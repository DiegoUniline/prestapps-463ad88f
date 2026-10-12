-- Pagos: flujos multi-paso en UNA transacción, bloqueo de columnas de saldo para el
-- cliente y cola de WhatsApp (outbox) procesada por la Edge Function whatsapp-sender.
-- Idempotente (CREATE OR REPLACE / IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- ORDEN DE DESPLIEGUE: la sección 6 (bloqueo de columnas) deja sin efecto las escrituras
-- directas del frontend anterior (descuento en PagoModal, descuentos de LiquidarModal,
-- estado "Prometida", EditPrestamoModal). Publica el frontend nuevo en cuanto corras esto.
-- Para correr todo MENOS el bloqueo:  SET prestapp.omitir_bloqueo_saldos = 'on';  antes del script.

-- ── 0) Llamada a registrar_pago (firma real no está en el repo) ────────────────
-- Se invoca por nombre de parámetro con literales sin tipo, así funciona sea cual sea
-- el tipo exacto de cada parámetro (date/text, numeric/float, json/jsonb).
CREATE OR REPLACE FUNCTION public._pagos_registrar_pago(
  p_prestamo_id uuid,
  p_empresa_id uuid,
  p_caja_id uuid,
  p_cobrador_id uuid,
  p_ruta_id uuid,
  p_monto numeric,
  p_metodo text,
  p_fecha_pago date,
  p_gps_lat double precision,
  p_gps_lng double precision,
  p_distribution jsonb
)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_res jsonb;
BEGIN
  EXECUTE format(
    'SELECT to_jsonb(public.registrar_pago(p_prestamo_id => %L, p_empresa_id => %L, p_caja_id => %L, '
    'p_cobrador_id => %L, p_ruta_id => %L, p_registrado_por => %L, p_monto => %L, p_metodo => %L, '
    'p_fecha_pago => %L, p_gps_lat => %L, p_gps_lng => %L, p_distribution => %L))',
    p_prestamo_id, p_empresa_id, p_caja_id, p_cobrador_id, p_ruta_id, auth.uid(), p_monto, p_metodo,
    to_char(p_fecha_pago, 'YYYY-MM-DD'), p_gps_lat, p_gps_lng, p_distribution)
    INTO v_res;
  RETURN v_res;
END $$;

-- ── 1) Pago con descuento de mora (PagoModal) ──────────────────────────────────
-- p_descuentos: [{"cuota_id": uuid, "monto": numeric}] — fija amortizacion.descuento_mora
-- (igual que hacía la UI) y luego registra el pago, todo en la misma transacción.
CREATE OR REPLACE FUNCTION public.registrar_pago_completo(
  p_prestamo_id uuid,
  p_empresa_id uuid,
  p_caja_id uuid,
  p_cobrador_id uuid,
  p_ruta_id uuid,
  p_registrado_por uuid,
  p_monto numeric,
  p_metodo text,
  p_fecha_pago date,
  p_gps_lat double precision DEFAULT NULL,
  p_gps_lng double precision DEFAULT NULL,
  p_distribution jsonb DEFAULT NULL,
  p_descuentos jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  v_d jsonb;
  v_monto numeric;
  a public.amortizacion;
BEGIN
  IF p_empresa_id IS NOT NULL AND p_empresa_id IS DISTINCT FROM v_emp THEN
    RAISE EXCEPTION 'No autorizado: empresa' USING ERRCODE = '42501';
  END IF;
  IF p_registrado_por IS NOT NULL AND p_registrado_por IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado: usuario' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_monto, 0) <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a 0'; END IF;
  IF p_fecha_pago IS NULL THEN RAISE EXCEPTION 'Indica la fecha de pago'; END IF;

  PERFORM 1 FROM public.prestamos WHERE id = p_prestamo_id AND empresa_id = v_emp FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El préstamo no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF p_ruta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.rutas WHERE id = p_ruta_id AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'La ruta no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;

  IF p_distribution IS NOT NULL AND jsonb_typeof(p_distribution) = 'array' AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_distribution) e
        WHERE NOT EXISTS (SELECT 1 FROM public.amortizacion am
                           WHERE am.id = nullif(e->>'cuotaId', '')::uuid AND am.prestamo_id = p_prestamo_id)) THEN
    RAISE EXCEPTION 'La distribución incluye cuotas que no pertenecen al préstamo' USING ERRCODE = '42501';
  END IF;

  IF p_descuentos IS NOT NULL AND jsonb_typeof(p_descuentos) <> 'null' THEN
    IF jsonb_typeof(p_descuentos) <> 'array' THEN RAISE EXCEPTION 'Descuentos inválidos'; END IF;
    FOR v_d IN SELECT value FROM jsonb_array_elements(p_descuentos) LOOP
      v_monto := round(coalesce((v_d->>'monto')::numeric, 0), 2);
      CONTINUE WHEN v_monto = 0;
      IF v_monto < 0 THEN RAISE EXCEPTION 'El descuento no puede ser negativo'; END IF;
      SELECT * INTO a FROM public.amortizacion
       WHERE id = nullif(v_d->>'cuota_id', '')::uuid AND prestamo_id = p_prestamo_id
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'La cuota del descuento no pertenece al préstamo' USING ERRCODE = '42501';
      END IF;
      IF v_monto > round(coalesce(a.saldo_mora, 0), 2) THEN
        RAISE EXCEPTION 'El descuento (%) no puede ser mayor a la mora pendiente de la cuota #% (%)',
          public._integ_fmt(v_monto), a.num_cuota, public._integ_fmt(coalesce(a.saldo_mora, 0));
      END IF;
      UPDATE public.amortizacion SET descuento_mora = v_monto WHERE id = a.id;
    END LOOP;
  END IF;

  RETURN public._pagos_registrar_pago(p_prestamo_id, v_emp, p_caja_id, p_cobrador_id, p_ruta_id,
                                      round(p_monto, 2), p_metodo, p_fecha_pago, p_gps_lat, p_gps_lng, p_distribution);
END $$;

-- ── 2) Liquidación (LiquidarModal) ─────────────────────────────────────────────
-- Replica lo que hacía la UI: condona mora/interés por cuota (descuento_mora, saldos),
-- registra el pago con la distribución, anota el préstamo y reconstruye la amortización.
-- p_modo: completo | solo_capital | descuento (con % de mora e interés).
CREATE OR REPLACE FUNCTION public.liquidar_prestamo(
  p_prestamo_id uuid,
  p_caja_id uuid,
  p_modo text,
  p_desc_mora_pct numeric DEFAULT 0,
  p_desc_interes_pct numeric DEFAULT 0,
  p_cobrador_id uuid DEFAULT NULL,
  p_ruta_id uuid DEFAULT NULL,
  p_fecha_pago date DEFAULT NULL,
  p_gps_lat double precision DEFAULT NULL,
  p_gps_lng double precision DEFAULT NULL,
  p_monto_esperado numeric DEFAULT NULL,
  p_nota text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  p public.prestamos;
  c public.amortizacion;
  v_pm numeric;
  v_pi numeric;
  s_mora numeric;
  s_int numeric;
  s_cap numeric;
  m_apl numeric;
  i_apl numeric;
  c_apl numeric;
  v_desc numeric;
  v_dist jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_cond numeric := 0;
  v_n integer := 0;
  v_nota text;
  v_res jsonb;
BEGIN
  IF p_modo NOT IN ('completo', 'solo_capital', 'descuento') THEN
    RAISE EXCEPTION 'Tipo de liquidación inválido';
  END IF;
  IF p_modo = 'descuento' AND (coalesce(p_desc_mora_pct, 0) NOT BETWEEN 0 AND 100
                               OR coalesce(p_desc_interes_pct, 0) NOT BETWEEN 0 AND 100) THEN
    RAISE EXCEPTION 'El porcentaje de descuento debe estar entre 0 y 100';
  END IF;

  SELECT * INTO p FROM public.prestamos WHERE id = p_prestamo_id AND empresa_id = v_emp FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El préstamo no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF p.estado IN ('Liquidado', 'Cancelado', 'Reestructurado') THEN
    RAISE EXCEPTION 'El préstamo ya está %', lower(p.estado::text);
  END IF;
  PERFORM public._integ_lock_caja(p_caja_id, v_emp);
  IF p_ruta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.rutas WHERE id = p_ruta_id AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'La ruta no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;

  v_pm := CASE p_modo WHEN 'solo_capital' THEN 1 WHEN 'descuento' THEN coalesce(p_desc_mora_pct, 0) / 100 ELSE 0 END;
  v_pi := CASE p_modo WHEN 'solo_capital' THEN 1 WHEN 'descuento' THEN coalesce(p_desc_interes_pct, 0) / 100 ELSE 0 END;

  FOR c IN
    SELECT * FROM public.amortizacion
     WHERE prestamo_id = p.id AND coalesce(saldo_total, 0) > 0
     ORDER BY num_cuota
     FOR UPDATE
  LOOP
    s_mora := coalesce(c.saldo_mora, 0);
    s_int := coalesce(c.saldo_interes, 0);
    s_cap := coalesce(c.saldo_capital, 0);
    m_apl := round(s_mora * (1 - v_pm), 2);
    i_apl := round(s_int * (1 - v_pi), 2);
    c_apl := round(s_cap, 2);
    v_desc := GREATEST(0, s_mora - m_apl) + GREATEST(0, s_int - i_apl);

    IF v_pm > 0 OR v_pi > 0 THEN
      IF v_desc > 0 THEN
        UPDATE public.amortizacion
           SET descuento_mora = round(v_desc, 2),
               saldo_mora = GREATEST(0, m_apl),
               saldo_interes = GREATEST(0, i_apl),
               saldo_total = GREATEST(0, s_cap + GREATEST(0, i_apl) + GREATEST(0, m_apl))
         WHERE id = c.id;
      END IF;
      v_cond := v_cond + v_desc;
    END IF;

    IF c_apl > 0 OR i_apl > 0 OR m_apl > 0 THEN
      v_dist := v_dist || jsonb_build_array(jsonb_build_object(
        'cuotaId', c.id, 'capital', GREATEST(c_apl, 0), 'interes', GREATEST(i_apl, 0), 'mora', GREATEST(m_apl, 0)));
      v_total := v_total + GREATEST(c_apl, 0) + GREATEST(i_apl, 0) + GREATEST(m_apl, 0);
      v_n := v_n + 1;
    END IF;
  END LOOP;

  IF v_total <= 0 THEN RAISE EXCEPTION 'El préstamo no tiene saldo por liquidar'; END IF;
  IF p_monto_esperado IS NOT NULL AND abs(round(p_monto_esperado, 2) - v_total) > GREATEST(0.01, 0.01 * v_n) THEN
    RAISE EXCEPTION 'Los saldos del préstamo cambiaron (a cobrar ahora: %). Recarga e intenta de nuevo', public._integ_fmt(v_total);
  END IF;

  v_res := public._pagos_registrar_pago(p.id, v_emp, p_caja_id, p_cobrador_id, p_ruta_id, v_total, 'Efectivo',
                                        coalesce(p_fecha_pago, (now() AT TIME ZONE 'America/Mexico_City')::date),
                                        p_gps_lat, p_gps_lng, v_dist);

  v_nota := nullif(btrim(left(coalesce(p_nota, ''), 500)), '');
  IF v_nota IS NULL THEN
    v_nota := CASE p_modo
      WHEN 'completo' THEN 'Liquidación total'
      WHEN 'solo_capital' THEN format('Liquidación solo capital (condonado: %s)', public._integ_fmt(v_cond))
      ELSE format('Liquidación con descuento mora %s%%%s (condonado: %s)', round(coalesce(p_desc_mora_pct, 0), 2),
                  CASE WHEN coalesce(p_desc_interes_pct, 0) > 0 THEN format(' + interés %s%%', round(p_desc_interes_pct, 2)) ELSE '' END,
                  public._integ_fmt(v_cond))
    END;
  END IF;
  UPDATE public.prestamos SET notas = v_nota WHERE id = p.id;

  PERFORM public.rebuild_amortizacion(p.id);

  RETURN jsonb_build_object('prestamo_id', p.id, 'monto', v_total, 'condonado', round(v_cond, 2),
                            'cuotas', v_n, 'pago', v_res);
END $$;

-- ── 3) Promesas y visitas (PromesaModal / VisitaModal) ─────────────────────────

CREATE OR REPLACE FUNCTION public._pagos_promesa(p_emp uuid, p_prestamo_id uuid, p_cuota_id uuid, p_monto numeric, p_fecha date, p_notas text)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF coalesce(p_monto, 0) <= 0 THEN RAISE EXCEPTION 'El monto prometido debe ser mayor a 0'; END IF;
  IF p_fecha IS NULL THEN RAISE EXCEPTION 'Indica la fecha de la promesa'; END IF;
  IF p_cuota_id IS NOT NULL THEN
    PERFORM 1 FROM public.amortizacion WHERE id = p_cuota_id AND prestamo_id = p_prestamo_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La cuota no pertenece al préstamo' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.promesas_pago (prestamo_id, cuota_id, monto_prometido, fecha_prometida, notas, status, empresa_id)
  VALUES (p_prestamo_id, p_cuota_id, round(p_monto, 2), p_fecha, nullif(btrim(coalesce(p_notas, '')), ''), 'Pendiente', p_emp)
  RETURNING id INTO v_id;

  IF p_cuota_id IS NOT NULL THEN
    UPDATE public.amortizacion SET status = 'Prometida'
     WHERE id = p_cuota_id AND status IS DISTINCT FROM 'Pagada';
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.registrar_promesa_pago(
  p_prestamo_id uuid,
  p_cuota_id uuid,
  p_monto numeric,
  p_fecha date,
  p_notas text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.prestamos WHERE id = p_prestamo_id AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'El préstamo no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('promesa_id',
    public._pagos_promesa(v_emp, p_prestamo_id, p_cuota_id, p_monto, p_fecha, p_notas));
END $$;

CREATE OR REPLACE FUNCTION public.registrar_visita(
  p_prestamo_id uuid,
  p_cliente_id uuid,
  p_resultado text,
  p_notas text DEFAULT NULL,
  p_cuota_id uuid DEFAULT NULL,
  p_monto_promesa numeric DEFAULT NULL,
  p_fecha_promesa date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  v_cliente uuid;
  v_promesa boolean := p_resultado = 'promesa_pago' AND p_fecha_promesa IS NOT NULL;
  v_gestion uuid;
  v_prom uuid;
BEGIN
  IF coalesce(btrim(p_resultado), '') = '' THEN RAISE EXCEPTION 'Indica el resultado de la visita'; END IF;
  SELECT cliente_id INTO v_cliente FROM public.prestamos WHERE id = p_prestamo_id AND empresa_id = v_emp;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El préstamo no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF p_cliente_id IS NOT NULL AND p_cliente_id IS DISTINCT FROM v_cliente
     AND NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'El cliente no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.crm_gestiones (empresa_id, prestamo_id, cliente_id, tipo_gestion, resultado, notas,
                                    fecha_seguimiento, registrado_por)
  VALUES (v_emp, p_prestamo_id, coalesce(p_cliente_id, v_cliente), 'visita', p_resultado,
          nullif(btrim(coalesce(p_notas, '')), ''), CASE WHEN v_promesa THEN p_fecha_promesa END, auth.uid())
  RETURNING id INTO v_gestion;

  IF v_promesa THEN
    v_prom := public._pagos_promesa(v_emp, p_prestamo_id, p_cuota_id, p_monto_promesa, p_fecha_promesa, p_notas);
  END IF;

  RETURN jsonb_build_object('gestion_id', v_gestion, 'promesa_id', v_prom);
END $$;

-- ── 4) Edición de condiciones del préstamo (EditPrestamoModal) ─────────────────
-- Actualiza las claves presentes en p_datos, reconstruye la amortización y, si cambió la
-- caja, mueve el desembolso (entrada en la caja anterior, salida en la nueva).
CREATE OR REPLACE FUNCTION public.editar_prestamo(p_prestamo_id uuid, p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  p public.prestamos;
  d jsonb := coalesce(p_datos, '{}'::jsonb);
  v_caja uuid;
  v_ruta uuid;
  v_cob uuid;
  v_folio text;
  v_monto numeric;
  c public.cajas;
BEGIN
  IF jsonb_typeof(d) <> 'object' THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
  SELECT * INTO p FROM public.prestamos WHERE id = p_prestamo_id AND empresa_id = v_emp FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El préstamo no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;

  v_caja := CASE WHEN d ? 'caja_id' THEN nullif(d->>'caja_id', '')::uuid ELSE p.caja_id END;
  v_ruta := CASE WHEN d ? 'ruta_id' THEN nullif(d->>'ruta_id', '')::uuid ELSE p.ruta_id END;
  v_cob := CASE WHEN d ? 'cobrador_id' THEN nullif(d->>'cobrador_id', '')::uuid ELSE p.cobrador_id END;
  IF v_caja IS DISTINCT FROM p.caja_id AND v_caja IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.cajas WHERE id = v_caja AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'La caja no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF v_ruta IS DISTINCT FROM p.ruta_id AND v_ruta IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.rutas WHERE id = v_ruta AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'La ruta no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF v_cob IS DISTINCT FROM p.cobrador_id AND NOT public._integ_cobrador_ok(v_cob, v_emp) THEN
    RAISE EXCEPTION 'El cobrador no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF coalesce((d->>'tasa_interes')::numeric, 0) < 0 OR coalesce((d->>'valor_mora')::numeric, 0) < 0
     OR coalesce((d->>'gastos_legales')::numeric, 0) < 0 THEN
    RAISE EXCEPTION 'Los valores no pueden ser negativos';
  END IF;

  -- El saldo de la caja nueva se valida antes de reasignar el préstamo (caja_saldos ya
  -- descuenta monto_solicitado de los préstamos que apuntan a la caja).
  v_monto := coalesce(p.monto_solicitado, 0);
  IF v_caja IS DISTINCT FROM p.caja_id AND v_caja IS NOT NULL AND v_monto > 0 THEN
    c := public._integ_lock_caja(v_caja, v_emp);
    PERFORM public._integ_check_saldo(c, v_monto);
  END IF;

  UPDATE public.prestamos SET
    tasa_interes = CASE WHEN d ? 'tasa_interes' THEN (d->>'tasa_interes')::numeric ELSE tasa_interes END,
    tipo_mora = CASE WHEN d ? 'tipo_mora' THEN nullif(d->>'tipo_mora', '')::public.tipo_mora ELSE tipo_mora END,
    valor_mora = CASE WHEN d ? 'valor_mora' THEN coalesce((d->>'valor_mora')::numeric, 0) ELSE valor_mora END,
    gastos_legales = CASE WHEN d ? 'gastos_legales' THEN coalesce((d->>'gastos_legales')::numeric, 0) ELSE gastos_legales END,
    caja_id = v_caja,
    ruta_id = v_ruta,
    cobrador_id = v_cob,
    notas = CASE WHEN d ? 'notas' THEN nullif(d->>'notas', '') ELSE notas END,
    codigo_interno = CASE WHEN d ? 'codigo_interno' THEN nullif(d->>'codigo_interno', '') ELSE codigo_interno END
  WHERE id = p.id;

  PERFORM public.rebuild_amortizacion(p.id);

  IF v_caja IS DISTINCT FROM p.caja_id AND v_monto > 0 THEN
    v_folio := coalesce(nullif(p.id_prestamo, ''), left(p.id::text, 8));
    IF p.caja_id IS NOT NULL THEN
      PERFORM public._integ_lock_caja(p.caja_id, v_emp);
      INSERT INTO public.movimientos_caja (caja_id, tipo, monto, prestamo_id, concepto, empresa_id, registrado_por)
      VALUES (p.caja_id, 'entrada', v_monto, p.id,
              format('Corrección desembolso %s — salida de caja anterior', v_folio), v_emp, auth.uid());
    END IF;
    IF v_caja IS NOT NULL THEN
      INSERT INTO public.movimientos_caja (caja_id, tipo, monto, prestamo_id, concepto, empresa_id, registrado_por)
      VALUES (v_caja, 'salida', v_monto, p.id,
              format('Corrección desembolso %s — cambio de caja', v_folio), v_emp, auth.uid());
    END IF;
  END IF;

  RETURN jsonb_build_object('prestamo_id', p.id, 'caja_cambio', v_caja IS DISTINCT FROM p.caja_id);
END $$;

-- ── 5) Cola de WhatsApp (outbox) ───────────────────────────────────────────────
-- El navegador solo inserta filas; whatsapp-sender {action:"process-queue"} las envía con
-- reintentos (backoff exponencial, máx. 6 intentos) y registra en whatsapp_log.
CREATE TABLE IF NOT EXISTS public.whatsapp_cola (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  telefono text NOT NULL,
  tipo text NOT NULL DEFAULT 'manual',
  mensaje text,
  media_url text,
  media_tipo text,
  media_nombre text,
  referencia_id uuid,
  estado text NOT NULL DEFAULT 'pendiente',
  intentos integer NOT NULL DEFAULT 0,
  ultimo_error text,
  proximo_intento timestamptz NOT NULL DEFAULT now(),
  creado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  enviado_at timestamptz,
  CONSTRAINT whatsapp_cola_estado_chk CHECK (estado IN ('pendiente', 'enviando', 'enviado', 'error')),
  CONSTRAINT whatsapp_cola_media_chk CHECK (
    (media_tipo IS NULL AND media_url IS NULL)
    OR (media_tipo IN ('image', 'file') AND media_url ~ '^https://')),
  CONSTRAINT whatsapp_cola_contenido_chk CHECK (coalesce(btrim(mensaje), '') <> '' OR media_url IS NOT NULL),
  CONSTRAINT whatsapp_cola_telefono_chk CHECK (length(telefono) BETWEEN 6 AND 32)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_cola_due ON public.whatsapp_cola (proximo_intento)
  WHERE estado IN ('pendiente', 'enviando');
CREATE INDEX IF NOT EXISTS idx_whatsapp_cola_empresa ON public.whatsapp_cola (empresa_id, created_at DESC);

ALTER TABLE public.whatsapp_cola ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_cola FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.whatsapp_cola TO authenticated;
GRANT INSERT (empresa_id, telefono, tipo, mensaje, media_url, media_tipo, media_nombre, referencia_id)
  ON TABLE public.whatsapp_cola TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_cola TO service_role;

DROP POLICY IF EXISTS whatsapp_cola_select ON public.whatsapp_cola;
CREATE POLICY whatsapp_cola_select ON public.whatsapp_cola FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.get_user_empresa_id()));
DROP POLICY IF EXISTS whatsapp_cola_insert ON public.whatsapp_cola;
CREATE POLICY whatsapp_cola_insert ON public.whatsapp_cola FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT public.get_user_empresa_id()));

-- Reclama filas vencidas (pendientes, o "enviando" cuyo lease de 10 min expiró) sin
-- bloquear a otros procesos (SKIP LOCKED). Cada reclamo cuenta como intento.
CREATE OR REPLACE FUNCTION public.whatsapp_cola_claim(p_limit integer DEFAULT 50, p_empresa uuid DEFAULT NULL)
RETURNS SETOF public.whatsapp_cola LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.whatsapp_cola
     SET estado = 'error', ultimo_error = coalesce(ultimo_error, 'Sin confirmación de envío')
   WHERE estado = 'enviando' AND proximo_intento <= now() AND intentos >= 6
     AND (p_empresa IS NULL OR empresa_id = p_empresa);

  RETURN QUERY
  UPDATE public.whatsapp_cola q
     SET estado = 'enviando', intentos = q.intentos + 1, proximo_intento = now() + interval '10 minutes'
   WHERE q.id IN (
     SELECT w.id FROM public.whatsapp_cola w
      WHERE w.estado IN ('pendiente', 'enviando') AND w.proximo_intento <= now() AND w.intentos < 6
        AND (p_empresa IS NULL OR w.empresa_id = p_empresa)
      ORDER BY w.proximo_intento, w.created_at
      LIMIT GREATEST(1, LEAST(coalesce(p_limit, 50), 200))
      FOR UPDATE SKIP LOCKED)
  RETURNING q.*;
END $$;

-- Resultado de un envío: enviado, o de vuelta a pendiente con backoff 2^intentos min
-- (2, 4, 8, 16, 32), o error al 6.º intento / error permanente.
CREATE OR REPLACE FUNCTION public.whatsapp_cola_resultado(p_id uuid, p_ok boolean, p_error text DEFAULT NULL, p_permanente boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_estado text;
BEGIN
  UPDATE public.whatsapp_cola SET
    estado = CASE WHEN p_ok THEN 'enviado' WHEN p_permanente OR intentos >= 6 THEN 'error' ELSE 'pendiente' END,
    enviado_at = CASE WHEN p_ok THEN now() ELSE enviado_at END,
    ultimo_error = CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_error, 'Error desconocido'), 1000) END,
    proximo_intento = CASE WHEN p_ok THEN proximo_intento
                           ELSE now() + make_interval(mins => LEAST(60, power(2, GREATEST(intentos, 1))::int)) END
  WHERE id = p_id AND estado = 'enviando'
  RETURNING estado INTO v_estado;
  RETURN v_estado;
END $$;

-- Devuelve a pendiente (sin contar intento) filas reclamadas que no alcanzaron a enviarse.
CREATE OR REPLACE FUNCTION public.whatsapp_cola_liberar(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.whatsapp_cola
     SET estado = 'pendiente', intentos = GREATEST(0, intentos - 1), proximo_intento = now()
   WHERE id = ANY(p_ids) AND estado = 'enviando';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ── Permisos de funciones ──────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._pagos_registrar_pago(uuid, uuid, uuid, uuid, uuid, numeric, text, date, double precision, double precision, jsonb)',
    'public._pagos_promesa(uuid, uuid, uuid, numeric, date, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.whatsapp_cola_claim(integer, uuid)',
    'public.whatsapp_cola_resultado(uuid, boolean, text, boolean)',
    'public.whatsapp_cola_liberar(uuid[])'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.registrar_pago_completo(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, date, double precision, double precision, jsonb, jsonb)',
    'public.liquidar_prestamo(uuid, uuid, text, numeric, numeric, uuid, uuid, date, double precision, double precision, numeric, text)',
    'public.registrar_promesa_pago(uuid, uuid, numeric, date, text)',
    'public.registrar_visita(uuid, uuid, text, text, uuid, numeric, date)',
    'public.editar_prestamo(uuid, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- ── 6) Bloqueo de columnas de dinero para el cliente ───────────────────────────
-- Las escrituras de saldos solo ocurren dentro de RPC SECURITY DEFINER. Lista blanca
-- (columnas que el frontend aún actualiza directamente):
--   amortizacion: avisado                         (PrestamoDetallePage "marcar avisado")
--   pagos:        (ninguna)
--   prestamos:    ruta_id, cobrador_id            (ReasignarModal)
--                 cobro_automatico_stripe         (PrestamoDetallePage)
-- INSERT/DELETE directos: ningún cliente inserta ni borra en amortizacion/pagos, ni
-- inserta en prestamos (crear_prestamo / reestructurar_prestamo / delete-prestamo).
-- Si una función SECURITY INVOKER ejecutable por el cliente (o un trigger) escribe la
-- tabla, el bloqueo de esa tabla se OMITE con WARNING para no romperla.
DO $lock$
DECLARE
  t text;
  v_bloq text;
  v_all text;
  v_cfg jsonb := '{
    "amortizacion": {"ops": "INSERT, UPDATE, DELETE", "cols": ["avisado"]},
    "pagos":        {"ops": "INSERT, UPDATE, DELETE", "cols": []},
    "prestamos":    {"ops": "INSERT, UPDATE",         "cols": ["ruta_id", "cobrador_id", "cobro_automatico_stripe"]}
  }';
  v_cols text;
BEGIN
  IF coalesce(current_setting('prestapp.omitir_bloqueo_saldos', true), '') = 'on' THEN
    RAISE NOTICE 'Bloqueo de saldos omitido (prestapp.omitir_bloqueo_saldos = on)';
    RETURN;
  END IF;

  FOR t IN SELECT jsonb_object_keys(v_cfg) LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;

    SELECT string_agg(DISTINCT format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = public;', p.oid::regprocedure), ' ') INTO v_bloq
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prokind = 'f'
       AND NOT p.prosecdef
       AND p.prosrc ~* ('(update\s+(only\s+)?(public\.)?' || t || '|insert\s+into\s+(public\.)?' || t
                        || '|delete\s+from\s+(only\s+)?(public\.)?' || t || ')\M')
       AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgfoid = p.oid AND NOT tg.tgisinternal));
    IF v_bloq IS NOT NULL THEN
      RAISE WARNING 'Bloqueo de "%" OMITIDO: funciones SECURITY INVOKER (RPC o trigger) la escriben con permisos del usuario. Revisa que tengan guarda de tenant, ejecuta: % y vuelve a correr esta sección.', t, v_bloq;
      CONTINUE;
    END IF;

    SELECT string_agg(quote_ident(attname), ', ') INTO v_all
      FROM pg_attribute WHERE attrelid = ('public.' || t)::regclass AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE %s ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_cfg->t->>'ops', t);
    EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_all, v_all, t);

    SELECT string_agg(quote_ident(c), ', ') INTO v_cols
      FROM jsonb_array_elements_text(v_cfg->t->'cols') c
     WHERE EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = ('public.' || t)::regclass AND attname = c AND NOT attisdropped);
    IF v_cols IS NOT NULL THEN
      EXECUTE format('GRANT UPDATE (%s) ON TABLE public.%I TO authenticated', v_cols, t);
    END IF;
    RAISE NOTICE 'Bloqueo aplicado en %: sin %; UPDATE permitido solo en (%)', t, v_cfg->t->>'ops', coalesce(v_cols, 'ninguna');
  END LOOP;
END $lock$;

-- ── 7) (Opcional) pg_cron: procesar la cola cada 5 minutos ─────────────────────
-- Usa la clave publicable (pública); whatsapp-sender solo procesa filas ya encoladas
-- y limita estas llamadas con cron_claim('whatsapp-queue', 1).
DO $cron$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron no disponible: %', SQLERRM;
  END;
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_net;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_net no disponible: %', SQLERRM;
    END;
  END;

  IF to_regnamespace('cron') IS NULL OR to_regnamespace('net') IS NULL THEN
    RAISE NOTICE 'Job whatsapp-cola no creado (faltan pg_cron/pg_net); la cola se procesa desde la app y whatsapp-cron';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'whatsapp-cola';
    PERFORM cron.schedule('whatsapp-cola', '*/5 * * * *', $job$
      SELECT net.http_post(
        url := 'https://oewuzgugsjqtznmgnfhp.supabase.co/functions/v1/whatsapp-sender',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld3V6Z3Vnc2pxdHpubWduZmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDQ1NDgsImV4cCI6MjA4ODkyMDU0OH0.sLR4Y7cBqD9bqT4KRc6CUTUxJ2y_BqoQ0l15Avk5BbU',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld3V6Z3Vnc2pxdHpubWduZmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDQ1NDgsImV4cCI6MjA4ODkyMDU0OH0.sLR4Y7cBqD9bqT4KRc6CUTUxJ2y_BqoQ0l15Avk5BbU'),
        body := jsonb_build_object('action', 'process-queue'),
        timeout_milliseconds := 120000
      );
    $job$);
    RAISE NOTICE 'Job whatsapp-cola programado cada 5 minutos';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo programar whatsapp-cola: %', SQLERRM;
  END;
END $cron$;
