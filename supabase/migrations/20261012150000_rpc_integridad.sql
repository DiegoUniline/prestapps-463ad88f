-- Integridad de escrituras de dinero: cada flujo multi-paso que antes hacía el navegador
-- (transferencias, gastos, liquidaciones, alta/cancelación/reestructura de préstamos,
-- edición de pagos) ahora es UNA llamada RPC = una transacción, con validación de tenant
-- y de saldo bajo bloqueo de fila. Idempotente y aditivo (solo CREATE OR REPLACE).
-- Saldo disponible = caja_saldos() (misma fórmula que la UI).

-- ── Helpers internos (no ejecutables por clientes) ─────────────────────────────

CREATE OR REPLACE FUNCTION public._integ_empresa()
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  v := public.get_user_empresa_id();
  IF v IS NULL THEN
    RAISE EXCEPTION 'Tu usuario no tiene empresa asignada' USING ERRCODE = '42501';
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public._integ_fmt(p numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT '$' || to_char(coalesce(p, 0), 'FM999,999,999,990.00')
$$;

-- Bloquea la caja (FOR UPDATE) verificando que sea del tenant.
CREATE OR REPLACE FUNCTION public._integ_lock_caja(p_caja_id uuid, p_empresa uuid)
RETURNS public.cajas LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c public.cajas;
BEGIN
  IF p_caja_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona una caja';
  END IF;
  SELECT * INTO c FROM public.cajas WHERE id = p_caja_id AND empresa_id = p_empresa FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La caja no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  RETURN c;
END $$;

-- Usa el mismo saldo que ve el usuario (caja_saldos, definida en 20261012160000);
-- si aún no existe cae a cajas.saldo_actual.
CREATE OR REPLACE FUNCTION public._integ_check_saldo(c public.cajas, p_monto numeric)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_saldo numeric;
BEGIN
  IF to_regprocedure('public.caja_saldos(uuid[])') IS NOT NULL THEN
    EXECUTE 'SELECT saldo FROM public.caja_saldos($1)' INTO v_saldo USING ARRAY[c.id];
  END IF;
  v_saldo := coalesce(v_saldo, c.saldo_actual, 0);
  IF v_saldo < p_monto THEN
    RAISE EXCEPTION 'Saldo insuficiente en la caja "%" (disponible %, requerido %)',
      c.nombre, public._integ_fmt(v_saldo), public._integ_fmt(p_monto);
  END IF;
END $$;

-- Cobrador puede ser profiles.id o cobradores.id (ambos existen en prod).
CREATE OR REPLACE FUNCTION public._integ_cobrador_ok(p_id uuid, p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p_id IS NULL
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_id AND empresa_id = p_empresa)
      OR EXISTS (SELECT 1 FROM public.cobradores WHERE id = p_id AND empresa_id = p_empresa)
$$;

-- Ajuste atómico de efectivo_en_mano (sin read-modify-write), nunca negativo.
CREATE OR REPLACE FUNCTION public._integ_ajustar_efectivo(p_id uuid, p_empresa uuid, p_delta numeric)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF p_id IS NULL OR coalesce(p_delta, 0) = 0 THEN RETURN; END IF;
  UPDATE public.profiles SET efectivo_en_mano = GREATEST(0, coalesce(efectivo_en_mano, 0) + p_delta)
   WHERE id = p_id AND empresa_id = p_empresa;
  IF NOT FOUND THEN
    UPDATE public.cobradores SET efectivo_en_mano = GREATEST(0, coalesce(efectivo_en_mano, 0) + p_delta)
     WHERE id = p_id AND empresa_id = p_empresa;
  END IF;
END $$;

-- Inserta un objeto jsonb usando solo las claves que son columnas reales
-- (las columnas omitidas conservan su DEFAULT). Devuelve el id.
CREATE OR REPLACE FUNCTION public._integ_insert_jsonb(p_table text, p_row jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_cols text;
  v_id uuid;
BEGIN
  IF p_table NOT IN ('prestamos', 'amortizacion') THEN
    RAISE EXCEPTION 'Tabla no permitida: %', p_table;
  END IF;
  IF p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN
    RAISE EXCEPTION 'Datos inválidos para %', p_table;
  END IF;
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO v_cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = p_table
     AND c.is_generated = 'NEVER'
     AND c.column_name IN (SELECT jsonb_object_keys(p_row));
  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'Sin columnas válidas para %', p_table;
  END IF;
  EXECUTE format(
    'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) RETURNING id',
    p_table, v_cols, v_cols, p_table)
    INTO v_id USING p_row;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public._integ_insert_cuotas(p_prestamo_id uuid, p_empresa uuid, p_cuotas jsonb)
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  r jsonb;
  n integer := 0;
BEGIN
  IF p_cuotas IS NULL OR jsonb_typeof(p_cuotas) = 'null' THEN RETURN 0; END IF;
  IF jsonb_typeof(p_cuotas) <> 'array' THEN
    RAISE EXCEPTION 'Las cuotas deben ser una lista';
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_cuotas) LOOP
    PERFORM public._integ_insert_jsonb('amortizacion',
      r || jsonb_build_object('prestamo_id', p_prestamo_id, 'empresa_id', p_empresa));
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Valida referencias de un préstamo (cliente/caja/ruta/cobrador) contra el tenant.
CREATE OR REPLACE FUNCTION public._integ_validar_refs_prestamo(p jsonb, p_empresa uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = (p->>'cliente_id')::uuid AND empresa_id = p_empresa) THEN
    RAISE EXCEPTION 'El cliente no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF nullif(p->>'caja_id', '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.cajas WHERE id = (p->>'caja_id')::uuid AND empresa_id = p_empresa) THEN
    RAISE EXCEPTION 'La caja no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF nullif(p->>'ruta_id', '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.rutas WHERE id = (p->>'ruta_id')::uuid AND empresa_id = p_empresa) THEN
    RAISE EXCEPTION 'La ruta no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT public._integ_cobrador_ok(nullif(p->>'cobrador_id', '')::uuid, p_empresa) THEN
    RAISE EXCEPTION 'El cobrador no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF coalesce((p->>'monto_solicitado')::numeric, 0) <= 0 THEN
    RAISE EXCEPTION 'El monto del préstamo debe ser mayor a 0';
  END IF;
  IF coalesce((p->>'num_cuotas')::integer, 0) <= 0 THEN
    RAISE EXCEPTION 'El número de cuotas debe ser mayor a 0';
  END IF;
END $$;

-- ── 1) Transferencia entre cajas ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.transferir_caja(p_origen uuid, p_destino uuid, p_monto numeric, p_concepto text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  o public.cajas;
  d public.cajas;
  v_nota text;
  v_sal uuid;
  v_ent uuid;
BEGIN
  IF v_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a 0'; END IF;
  IF p_origen IS NULL OR p_destino IS NULL OR p_origen = p_destino THEN
    RAISE EXCEPTION 'Selecciona cajas de origen y destino distintas';
  END IF;
  -- Orden fijo de bloqueo para evitar deadlocks entre transferencias cruzadas
  IF p_origen < p_destino THEN
    o := public._integ_lock_caja(p_origen, v_emp);
    d := public._integ_lock_caja(p_destino, v_emp);
  ELSE
    d := public._integ_lock_caja(p_destino, v_emp);
    o := public._integ_lock_caja(p_origen, v_emp);
  END IF;
  PERFORM public._integ_check_saldo(o, v_monto);

  v_nota := coalesce(nullif(btrim(p_concepto), ''), format('Transferencia %s → %s', o.nombre, d.nombre));

  INSERT INTO public.movimientos_caja (caja_id, tipo, monto, concepto, empresa_id)
  VALUES (o.id, 'salida', v_monto, v_nota, v_emp) RETURNING id INTO v_sal;
  INSERT INTO public.movimientos_caja (caja_id, tipo, monto, concepto, empresa_id)
  VALUES (d.id, 'entrada', v_monto, v_nota, v_emp) RETURNING id INTO v_ent;

  RETURN jsonb_build_object('salida_id', v_sal, 'entrada_id', v_ent, 'monto', v_monto);
END $$;

-- ── 2) Movimiento manual (depósito / retiro / gasto) ───────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_movimiento_caja(p_caja_id uuid, p_tipo text, p_monto numeric, p_concepto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  c public.cajas;
  v_id uuid;
BEGIN
  IF p_tipo NOT IN ('entrada', 'salida') THEN RAISE EXCEPTION 'Tipo de movimiento inválido'; END IF;
  IF v_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a 0'; END IF;
  c := public._integ_lock_caja(p_caja_id, v_emp);
  IF p_tipo = 'salida' THEN
    PERFORM public._integ_check_saldo(c, v_monto);
  END IF;

  INSERT INTO public.movimientos_caja (caja_id, tipo, monto, concepto, empresa_id)
  VALUES (c.id, p_tipo::public.movimiento_tipo, v_monto,
          coalesce(nullif(btrim(p_concepto), ''), CASE WHEN p_tipo = 'entrada' THEN 'Depósito manual' ELSE 'Retiro manual' END),
          v_emp)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('movimiento_id', v_id, 'monto', v_monto);
END $$;

-- ── 3) Liquidación de ruta (corte) ─────────────────────────────────────────────
-- Toma exactamente p_pago_ids (sin corte, no anulados, del cobrador y tenant);
-- si alguno ya fue liquidado/anulado por otro usuario, falla todo.

CREATE OR REPLACE FUNCTION public.liquidar_ruta(
  p_cobrador_id uuid,
  p_pago_ids uuid[],
  p_caja_id uuid,
  p_periodo_hasta timestamptz DEFAULT NULL,
  p_concepto text DEFAULT NULL,
  p_concepto_comision text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  v_ids uuid[];
  v_n integer;
  v_claimed integer;
  v_total numeric;
  v_efectivo numeric;
  v_pct numeric;
  v_nombre text;
  v_comision numeric;
  c public.cajas;
  v_corte uuid;
  v_mov uuid;
  v_mov_com uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    RAISE EXCEPTION 'No tienes permiso para liquidar rutas' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(coalesce(p_pago_ids, '{}')) x WHERE x IS NOT NULL;
  v_n := coalesce(array_length(v_ids, 1), 0);
  IF v_n = 0 THEN RAISE EXCEPTION 'No hay pagos para liquidar'; END IF;

  SELECT nombre_completo, porcentaje_comision INTO v_nombre, v_pct
    FROM public.profiles WHERE id = p_cobrador_id AND empresa_id = v_emp FOR UPDATE;
  IF NOT FOUND THEN
    SELECT nombre, porcentaje_comision INTO v_nombre, v_pct
      FROM public.cobradores WHERE id = p_cobrador_id AND empresa_id = v_emp FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El cobrador no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
    END IF;
  END IF;

  c := public._integ_lock_caja(p_caja_id, v_emp);

  WITH claimed AS (
    SELECT id, monto_recibido, metodo_pago
      FROM public.pagos
     WHERE id = ANY(v_ids)
       AND empresa_id = v_emp
       AND cobrador_id = p_cobrador_id
       AND corte_id IS NULL
       AND anulado = false
     FOR UPDATE
  )
  SELECT count(*),
         round(coalesce(sum(monto_recibido), 0), 2),
         round(coalesce(sum(monto_recibido) FILTER (WHERE coalesce(metodo_pago, 'Efectivo') = 'Efectivo'), 0), 2)
    INTO v_claimed, v_total, v_efectivo
    FROM claimed;

  IF v_claimed <> v_n THEN
    RAISE EXCEPTION 'Algunos pagos ya fueron liquidados o anulados (% de % disponibles). Vuelve a consultar.', v_claimed, v_n
      USING ERRCODE = '40001';
  END IF;

  v_pct := coalesce(v_pct, 0);
  v_comision := round(v_efectivo * v_pct / 100, 2);

  INSERT INTO public.cortes (cobrador_id, caja_id, total_cobrado, monto_efectivo, monto_depositado,
                             monto_comision, porcentaje_usado, empresa_id, periodo_hasta)
  VALUES (p_cobrador_id, c.id, v_total, v_efectivo, v_efectivo, v_comision, v_pct, v_emp, p_periodo_hasta)
  RETURNING id INTO v_corte;

  UPDATE public.pagos SET corte_id = v_corte
   WHERE id = ANY(v_ids) AND empresa_id = v_emp AND corte_id IS NULL;

  IF v_efectivo > 0 THEN
    PERFORM public._integ_ajustar_efectivo(p_cobrador_id, v_emp, -v_efectivo);

    INSERT INTO public.movimientos_caja (caja_id, tipo, monto, concepto, empresa_id, registrado_por)
    VALUES (c.id, 'entrada', v_efectivo,
            coalesce(nullif(btrim(p_concepto), ''),
                     format('Liquidación ruta %s — %s pagos hasta %s', v_nombre, v_n,
                            to_char(coalesce(p_periodo_hasta, now()), 'DD/MM/YYYY'))),
            v_emp, auth.uid())
    RETURNING id INTO v_mov;
  END IF;

  IF v_comision > 0 AND nullif(btrim(p_concepto_comision), '') IS NOT NULL THEN
    INSERT INTO public.movimientos_caja (caja_id, tipo, monto, concepto, empresa_id, registrado_por)
    VALUES (c.id, 'salida', v_comision, btrim(p_concepto_comision), v_emp, auth.uid())
    RETURNING id INTO v_mov_com;
  END IF;

  RETURN jsonb_build_object(
    'corte_id', v_corte, 'movimiento_id', v_mov, 'movimiento_comision_id', v_mov_com,
    'pagos', v_n, 'total_cobrado', v_total, 'monto_efectivo', v_efectivo, 'monto_comision', v_comision);
END $$;

-- ── 4) Alta de préstamo (NuevoPrestamo / aprobación de solicitud) ──────────────
-- p_prestamo: columnas de prestamos; p_cuotas: lista de filas de amortizacion
-- (sin prestamo_id); p_desembolso: {caja_id, monto, concepto} o null.

CREATE OR REPLACE FUNCTION public.crear_prestamo(
  p_prestamo jsonb,
  p_cuotas jsonb,
  p_desembolso jsonb DEFAULT NULL,
  p_solicitud_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  v_p jsonb := coalesce(p_prestamo, '{}'::jsonb);
  v_id uuid;
  v_folio text;
  v_codigo text;
  v_max numeric;
  v_status text;
  v_cuotas integer;
  v_des_monto numeric;
  c public.cajas;
  v_mov uuid;
BEGIN
  IF jsonb_typeof(v_p) <> 'object' THEN RAISE EXCEPTION 'Datos del préstamo inválidos'; END IF;
  v_p := (v_p - 'id' - 'id_prestamo' - 'reestructurado_de') || jsonb_build_object('empresa_id', v_emp);
  IF v_p ? 'generado_por' THEN
    v_p := v_p || jsonb_build_object('generado_por', auth.uid());
  END IF;
  PERFORM public._integ_validar_refs_prestamo(v_p, v_emp);

  IF p_solicitud_id IS NOT NULL THEN
    IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
      RAISE EXCEPTION 'Solo administradores o supervisores pueden aprobar solicitudes' USING ERRCODE = '42501';
    END IF;
    SELECT status INTO v_status FROM public.solicitudes_prestamo
     WHERE id = p_solicitud_id AND empresa_id = v_emp FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La solicitud no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
    END IF;
    IF v_status IS DISTINCT FROM 'Pendiente' THEN
      RAISE EXCEPTION 'La solicitud ya fue resuelta (%)', v_status;
    END IF;
  END IF;

  -- Desembolso: bloquear caja y validar saldo antes de crear nada
  IF p_desembolso IS NOT NULL AND jsonb_typeof(p_desembolso) = 'object' THEN
    v_des_monto := round(coalesce((p_desembolso->>'monto')::numeric, 0), 2);
    IF v_des_monto <= 0 THEN RAISE EXCEPTION 'El monto a desembolsar debe ser mayor a 0'; END IF;
    c := public._integ_lock_caja((p_desembolso->>'caja_id')::uuid, v_emp);
    PERFORM public._integ_check_saldo(c, v_des_monto);
  END IF;

  -- codigo_interno: si el cliente lo envía vacío, se genera PRE-XXXX (max+1 por empresa)
  IF v_p ? 'codigo_interno' AND coalesce(btrim(v_p->>'codigo_interno'), '') = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('codigo_' || v_emp::text));
    SELECT max(substring(id_prestamo FROM '[0-9]+')::numeric) INTO v_max
      FROM public.prestamos WHERE empresa_id = v_emp;
    v_max := coalesce(v_max, 0) + 1;
    v_codigo := 'PRE-' || CASE WHEN v_max < 10000 THEN lpad(v_max::text, 4, '0') ELSE v_max::text END;
    v_p := v_p || jsonb_build_object('codigo_interno', v_codigo);
  END IF;

  v_id := public._integ_insert_jsonb('prestamos', v_p);
  v_cuotas := public._integ_insert_cuotas(v_id, v_emp, p_cuotas);

  IF c.id IS NOT NULL THEN
    INSERT INTO public.movimientos_caja (caja_id, tipo, monto, concepto, prestamo_id, empresa_id, registrado_por)
    VALUES (c.id, 'salida', v_des_monto,
            coalesce(nullif(btrim(p_desembolso->>'concepto'), ''), 'Desembolso préstamo'),
            v_id, v_emp, auth.uid())
    RETURNING id INTO v_mov;
  END IF;

  IF p_solicitud_id IS NOT NULL THEN
    UPDATE public.solicitudes_prestamo
       SET status = 'Aprobada', aprobado_por = auth.uid(), prestamo_generado_id = v_id, resuelto_en = now()
     WHERE id = p_solicitud_id AND empresa_id = v_emp;
  END IF;

  SELECT id_prestamo, codigo_interno INTO v_folio, v_codigo FROM public.prestamos WHERE id = v_id;

  RETURN jsonb_build_object('prestamo_id', v_id, 'id_prestamo', v_folio, 'codigo_interno', v_codigo,
                            'cuotas', v_cuotas, 'movimiento_id', v_mov);
END $$;

-- ── 5) Cancelación y reestructura ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancelar_prestamo(p_prestamo_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  p public.prestamos;
  v_mov uuid;
BEGIN
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Debe indicar un motivo'; END IF;
  SELECT * INTO p FROM public.prestamos WHERE id = p_prestamo_id AND empresa_id = v_emp FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El préstamo no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF p.estado IN ('Cancelado', 'Reestructurado', 'Liquidado') THEN
    RAISE EXCEPTION 'El préstamo ya está %', lower(p.estado::text);
  END IF;

  UPDATE public.prestamos
     SET estado = 'Cancelado', cancelado_por = auth.uid(), cancelado_en = now(), motivo_cancelacion = btrim(p_motivo)
   WHERE id = p.id;

  UPDATE public.amortizacion
     SET status = 'Pagada', saldo_capital = 0, saldo_interes = 0, saldo_mora = 0, saldo_total = 0
   WHERE prestamo_id = p.id AND status IS DISTINCT FROM 'Pagada';

  IF p.caja_id IS NOT NULL AND coalesce(p.monto_solicitado, 0) > 0 THEN
    PERFORM public._integ_lock_caja(p.caja_id, v_emp);
    INSERT INTO public.movimientos_caja (caja_id, tipo, monto, prestamo_id, concepto, empresa_id)
    VALUES (p.caja_id, 'entrada', p.monto_solicitado, p.id,
            format('Cancelación préstamo %s — reintegro desembolso', coalesce(nullif(p.id_prestamo, ''), left(p.id::text, 8))),
            v_emp)
    RETURNING id INTO v_mov;
  END IF;

  RETURN jsonb_build_object('prestamo_id', p.id, 'movimiento_id', v_mov);
END $$;

CREATE OR REPLACE FUNCTION public.reestructurar_prestamo(p_prestamo_id uuid, p_nuevo jsonb, p_cuotas jsonb, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  p public.prestamos;
  v_n jsonb := coalesce(p_nuevo, '{}'::jsonb);
  v_id uuid;
  v_cuotas integer;
BEGIN
  IF jsonb_typeof(v_n) <> 'object' THEN RAISE EXCEPTION 'Datos del nuevo préstamo inválidos'; END IF;
  SELECT * INTO p FROM public.prestamos WHERE id = p_prestamo_id AND empresa_id = v_emp FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El préstamo no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF p.estado IN ('Cancelado', 'Reestructurado', 'Liquidado') THEN
    RAISE EXCEPTION 'El préstamo ya está %; no se puede reestructurar', lower(p.estado::text);
  END IF;

  v_n := (v_n - 'id' - 'id_prestamo' - 'codigo_interno')
         || jsonb_build_object('empresa_id', v_emp, 'cliente_id', p.cliente_id,
                               'reestructurado_de', p.id, 'generado_por', auth.uid());
  PERFORM public._integ_validar_refs_prestamo(v_n, v_emp);

  v_id := public._integ_insert_jsonb('prestamos', v_n);
  v_cuotas := public._integ_insert_cuotas(v_id, v_emp, p_cuotas);
  IF v_cuotas = 0 THEN RAISE EXCEPTION 'El nuevo préstamo no tiene cuotas'; END IF;

  UPDATE public.prestamos
     SET estado = 'Reestructurado', cancelado_por = auth.uid(), cancelado_en = now(),
         motivo_cancelacion = coalesce(nullif(btrim(p_motivo), ''), 'Reestructurado')
   WHERE id = p.id;

  UPDATE public.amortizacion
     SET saldo_capital = 0, saldo_interes = 0, saldo_mora = 0, saldo_total = 0
   WHERE prestamo_id = p.id AND status IS DISTINCT FROM 'Pagada';

  RETURN jsonb_build_object('prestamo_id', v_id, 'anterior_id', p.id, 'cuotas', v_cuotas,
                            'id_prestamo', (SELECT id_prestamo FROM public.prestamos WHERE id = v_id));
END $$;

-- ── 6) Edición de pago ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.editar_pago(
  p_pago_id uuid,
  p_monto numeric,
  p_metodo text,
  p_caja_id uuid,
  p_cobrador_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  pg public.pagos;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_old numeric;
  v_new_cob uuid;
  v_monto_changed boolean;
  v_caja_changed boolean;
  v_folio text;
  v_estado text;
BEGIN
  IF v_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a 0'; END IF;
  SELECT * INTO pg FROM public.pagos WHERE id = p_pago_id AND empresa_id = v_emp FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pago no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF pg.anulado THEN RAISE EXCEPTION 'El pago está anulado; no se puede editar'; END IF;
  IF pg.corte_id IS NOT NULL THEN
    RAISE EXCEPTION 'El pago ya fue liquidado en un corte; no se puede editar';
  END IF;
  IF p_caja_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.cajas WHERE id = p_caja_id AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'La caja no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;

  -- Solo admin puede reasignar el cobrador (igual que la UI)
  v_new_cob := CASE WHEN p_cobrador_id IS NOT NULL AND public.has_role(auth.uid(), 'admin')
                    THEN p_cobrador_id ELSE pg.cobrador_id END;
  IF v_new_cob IS DISTINCT FROM pg.cobrador_id AND NOT public._integ_cobrador_ok(v_new_cob, v_emp) THEN
    RAISE EXCEPTION 'El cobrador no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;

  v_old := coalesce(pg.monto_recibido, 0);
  v_monto_changed := abs(v_monto - v_old) > 0.001;
  v_caja_changed := p_caja_id IS DISTINCT FROM pg.caja_id;

  UPDATE public.pagos
     SET monto_recibido = v_monto,
         metodo_pago = coalesce(nullif(btrim(p_metodo), ''), metodo_pago),
         caja_id = p_caja_id,
         cobrador_id = v_new_cob
   WHERE id = pg.id;

  IF v_monto_changed OR v_caja_changed THEN
    SELECT coalesce(nullif(id_prestamo, ''), left(pg.prestamo_id::text, 8)) INTO v_folio
      FROM public.prestamos WHERE id = pg.prestamo_id;
    v_folio := coalesce(v_folio, left(pg.prestamo_id::text, 8));

    IF pg.caja_id IS NOT NULL THEN
      INSERT INTO public.movimientos_caja (caja_id, tipo, monto, prestamo_id, concepto, empresa_id)
      VALUES (pg.caja_id, 'salida', v_old, pg.prestamo_id,
              format('Corrección pago %s — salida de caja anterior', v_folio), v_emp);
    END IF;
    INSERT INTO public.movimientos_caja (caja_id, tipo, monto, prestamo_id, concepto, empresa_id)
    VALUES (p_caja_id, 'entrada', v_monto, pg.prestamo_id,
            CASE WHEN v_caja_changed AND NOT v_monto_changed
                 THEN format('Corrección pago %s — cambio de caja', v_folio)
                 ELSE format('Corrección pago %s — monto actualizado', v_folio) END,
            v_emp);
  END IF;

  -- efectivo_en_mano atómico
  IF pg.cobrador_id IS NOT NULL AND pg.cobrador_id IS DISTINCT FROM v_new_cob THEN
    PERFORM public._integ_ajustar_efectivo(pg.cobrador_id, v_emp, -v_old);
  END IF;
  IF v_new_cob IS NOT NULL THEN
    IF v_new_cob IS DISTINCT FROM pg.cobrador_id THEN
      PERFORM public._integ_ajustar_efectivo(v_new_cob, v_emp, v_monto);
    ELSIF v_monto_changed THEN
      PERFORM public._integ_ajustar_efectivo(v_new_cob, v_emp, v_monto - v_old);
    END IF;
  END IF;

  IF v_monto_changed THEN
    PERFORM public.rebuild_amortizacion(pg.prestamo_id);
  ELSE
    SELECT estado::text INTO v_estado FROM public.prestamos WHERE id = pg.prestamo_id FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM public.amortizacion WHERE prestamo_id = pg.prestamo_id AND status <> 'Pagada') THEN
      UPDATE public.prestamos SET estado = 'Liquidado' WHERE id = pg.prestamo_id;
    ELSIF v_estado = 'Liquidado' THEN
      UPDATE public.prestamos SET estado = 'Activo' WHERE id = pg.prestamo_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('pago_id', pg.id, 'prestamo_id', pg.prestamo_id,
                            'monto_cambio', v_monto_changed, 'caja_cambio', v_caja_changed);
END $$;

-- ── 7) Siguiente código de cliente (CLI-XXXX) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.siguiente_id_cliente()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  v_max numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('id_cliente_' || v_emp::text));
  SELECT max(substring(id_cliente FROM '[0-9]+')::numeric) INTO v_max
    FROM public.clientes WHERE empresa_id = v_emp;
  v_max := coalesce(v_max, 0) + 1;
  RETURN 'CLI-' || CASE WHEN v_max < 10000 THEN lpad(v_max::text, 4, '0') ELSE v_max::text END;
END $$;

-- ── Permisos ───────────────────────────────────────────────────────────────────

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._integ_empresa()',
    'public._integ_fmt(numeric)',
    'public._integ_lock_caja(uuid, uuid)',
    'public._integ_check_saldo(public.cajas, numeric)',
    'public._integ_cobrador_ok(uuid, uuid)',
    'public._integ_ajustar_efectivo(uuid, uuid, numeric)',
    'public._integ_insert_jsonb(text, jsonb)',
    'public._integ_insert_cuotas(uuid, uuid, jsonb)',
    'public._integ_validar_refs_prestamo(jsonb, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.transferir_caja(uuid, uuid, numeric, text)',
    'public.registrar_movimiento_caja(uuid, text, numeric, text)',
    'public.liquidar_ruta(uuid, uuid[], uuid, timestamptz, text, text)',
    'public.crear_prestamo(jsonb, jsonb, jsonb, uuid)',
    'public.cancelar_prestamo(uuid, text)',
    'public.reestructurar_prestamo(uuid, jsonb, jsonb, text)',
    'public.editar_pago(uuid, numeric, text, uuid, uuid)',
    'public.siguiente_id_cliente()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
