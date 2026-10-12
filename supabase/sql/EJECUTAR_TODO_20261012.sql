-- EJECUTAR TODO: seguridad, integridad y rendimiento (2026-10-12). Idempotente.

-- ===== 20261012130000_edge_security =====
-- Edge Functions hardening: cron throttle, Stripe webhook dedupe, facturas idempotency.
-- Idempotent and additive: safe to re-run and safe while the old frontend is live.

-- ── 1. Cron throttle ─────────────────────────────────────────────────────────
-- Cron/batch Edge Functions call cron_claim() (service role) when the caller is
-- neither the service role nor the super admin; it returns true at most once
-- per p_min_minutes for each p_nombre.
CREATE TABLE IF NOT EXISTS public.cron_runs (
  nombre text PRIMARY KEY,
  ultimo timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cron_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cron_runs TO service_role;

CREATE OR REPLACE FUNCTION public.cron_claim(p_nombre text, p_min_minutes integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RETURN false;
  END IF;

  INSERT INTO public.cron_runs AS c (nombre, ultimo)
  VALUES (p_nombre, now())
  ON CONFLICT (nombre) DO UPDATE
    SET ultimo = EXCLUDED.ultimo
    WHERE c.ultimo < now() - make_interval(mins => GREATEST(COALESCE(p_min_minutes, 0), 0))
  RETURNING true INTO v_ok;

  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.cron_claim(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_claim(text, integer) TO service_role;

-- ── 2. Stripe webhook event dedupe ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id text PRIMARY KEY,
  tipo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stripe_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_stripe_events_created_at ON public.stripe_events (created_at);

-- ── 3. One factura per Stripe invoice ────────────────────────────────────────
-- Only created when no duplicates exist yet (otherwise it would fail); the
-- Edge Functions also dedupe in code, so skipping it is not fatal.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'facturas_stripe_invoice_id_uniq'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.facturas
    WHERE stripe_invoice_id IS NOT NULL
    GROUP BY stripe_invoice_id
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'facturas: hay stripe_invoice_id duplicados; se omite el índice único facturas_stripe_invoice_id_uniq';
  ELSE
    CREATE UNIQUE INDEX facturas_stripe_invoice_id_uniq
      ON public.facturas (stripe_invoice_id)
      WHERE stripe_invoice_id IS NOT NULL;
  END IF;
END;
$$;

-- ===== 20261012140000_db_security =====
-- Seguridad de BD: RPCs SECURITY DEFINER sin acceso anónimo, search_path fijo,
-- validación de tenant dentro de RPCs existentes y políticas RLS corregidas.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(auth.jwt() ->> 'email', '') = 'diego.leon@uniline.mx'
$$;

-- 1) search_path fijo en todas las SECURITY DEFINER de public
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', f.sig);
  END LOOP;
END $$;

-- 2) Ningún RPC SECURITY DEFINER ejecutable por anon (excepto helpers usados en RLS)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.prokind = 'f'
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname NOT IN ('get_user_empresa_id', 'has_role', 'is_super_admin')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;

-- 3) Guardas de tenant inyectadas al inicio de RPCs existentes (plpgsql).
--    Solo aplican a usuarios (auth.uid() no nulo); service_role / cron pasan.
CREATE OR REPLACE FUNCTION pg_temp.tenant_guard(p_oid oid) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE
  args text[];
  g text := '';
BEGIN
  SELECT coalesce(proargnames, '{}') INTO args FROM pg_proc WHERE oid = p_oid;
  IF (SELECT proname FROM pg_proc WHERE oid = p_oid) = 'switch_empresa' THEN
    RETURN 'IF auth.uid() IS NOT NULL AND p_empresa_id IS DISTINCT FROM public.get_user_empresa_id() AND NOT public.is_super_admin() THEN RAISE EXCEPTION ''No autorizado'' USING ERRCODE = ''42501''; END IF; ';
  END IF;
  IF 'p_empresa_id' = ANY(args) THEN
    g := g || 'IF p_empresa_id IS DISTINCT FROM public.get_user_empresa_id() THEN RAISE EXCEPTION ''No autorizado: empresa'' USING ERRCODE = ''42501''; END IF; ';
  END IF;
  IF 'p_prestamo_id' = ANY(args) THEN
    g := g || 'IF NOT EXISTS (SELECT 1 FROM public.prestamos WHERE id = p_prestamo_id AND empresa_id = public.get_user_empresa_id()) THEN RAISE EXCEPTION ''No autorizado: préstamo'' USING ERRCODE = ''42501''; END IF; ';
  END IF;
  IF 'p_pago_id' = ANY(args) THEN
    g := g || 'IF NOT EXISTS (SELECT 1 FROM public.pagos WHERE id = p_pago_id AND empresa_id = public.get_user_empresa_id()) THEN RAISE EXCEPTION ''No autorizado: pago'' USING ERRCODE = ''42501''; END IF; ';
  END IF;
  IF 'p_caja_id' = ANY(args) THEN
    g := g || 'IF p_caja_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cajas WHERE id = p_caja_id AND empresa_id = public.get_user_empresa_id()) THEN RAISE EXCEPTION ''No autorizado: caja'' USING ERRCODE = ''42501''; END IF; ';
  END IF;
  IF 'p_cobrador_id' = ANY(args) THEN
    g := g || 'IF p_cobrador_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_cobrador_id AND empresa_id = public.get_user_empresa_id()) AND NOT EXISTS (SELECT 1 FROM public.cobradores WHERE id = p_cobrador_id AND empresa_id = public.get_user_empresa_id()) THEN RAISE EXCEPTION ''No autorizado: cobrador'' USING ERRCODE = ''42501''; END IF; ';
  END IF;
  IF 'p_registrado_por' = ANY(args) THEN
    g := g || 'IF p_registrado_por IS NOT NULL AND p_registrado_por <> auth.uid() THEN RAISE EXCEPTION ''No autorizado: usuario'' USING ERRCODE = ''42501''; END IF; ';
  END IF;
  IF 'p_user_id' = ANY(args) THEN
    g := g || 'IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN RAISE EXCEPTION ''No autorizado: usuario'' USING ERRCODE = ''42501''; END IF; ';
  END IF;
  IF g = '' THEN RETURN NULL; END IF;
  RETURN 'IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN ' || g || 'END IF; ';
END $f$;

DO $$
DECLARE
  f record;
  def text;
  guard text;
  nuevo text;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.pronamespace = 'public'::regnamespace
      AND l.lanname = 'plpgsql'
      AND p.proname IN ('registrar_pago', 'revertir_pago', 'rebuild_amortizacion', 'recalcular_mora',
                        'recalcular_mora_empresa', 'next_folio', 'notif_emit_admins',
                        'actualizar_estados_prestamos', 'switch_empresa')
  LOOP
    def := pg_get_functiondef(f.oid);
    CONTINUE WHEN def LIKE '%/*tenant_guard*/%';
    guard := pg_temp.tenant_guard(f.oid);
    CONTINUE WHEN guard IS NULL;
    nuevo := regexp_replace(def, '(AS \$function\$.*?\mBEGIN\M)', '\1 /*tenant_guard*/ ' || replace(guard, '\', '\\'), 'i');
    IF nuevo = def THEN
      RAISE NOTICE 'tenant_guard: no se pudo inyectar en %', f.proname;
      CONTINUE;
    END IF;
    EXECUTE nuevo;
    RAISE NOTICE 'tenant_guard: aplicado en %', f.proname;
  END LOOP;
END $$;

-- 4) Notificaciones: solo insertar para usuarios de la misma empresa
DROP POLICY IF EXISTS users_insert_same_empresa ON public.notificaciones;
CREATE POLICY users_insert_same_empresa ON public.notificaciones FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = (SELECT public.get_user_empresa_id())
    AND user_id IN (SELECT id FROM public.profiles WHERE empresa_id = (SELECT public.get_user_empresa_id()))
  );

-- 5) Borrado de cajas y edición del catálogo de cuotas: solo admin/supervisor
DROP POLICY IF EXISTS auth_delete_cajas ON public.cajas;
CREATE POLICY auth_delete_cajas ON public.cajas FOR DELETE TO authenticated
  USING (
    empresa_id = (SELECT public.get_user_empresa_id())
    AND ((SELECT public.has_role(auth.uid(), 'admin'::app_role)) OR (SELECT public.has_role(auth.uid(), 'supervisor'::app_role)))
  );

DO $$
BEGIN
  IF to_regclass('public.cat_cuotas') IS NOT NULL THEN
    DROP POLICY IF EXISTS auth_insert_cat_cuotas ON public.cat_cuotas;
    DROP POLICY IF EXISTS auth_update_cat_cuotas ON public.cat_cuotas;
    DROP POLICY IF EXISTS auth_delete_cat_cuotas ON public.cat_cuotas;
    CREATE POLICY auth_insert_cat_cuotas ON public.cat_cuotas FOR INSERT TO authenticated
      WITH CHECK (empresa_id = (SELECT public.get_user_empresa_id())
        AND ((SELECT public.has_role(auth.uid(), 'admin'::app_role)) OR (SELECT public.has_role(auth.uid(), 'supervisor'::app_role))));
    CREATE POLICY auth_update_cat_cuotas ON public.cat_cuotas FOR UPDATE TO authenticated
      USING (empresa_id = (SELECT public.get_user_empresa_id())
        AND ((SELECT public.has_role(auth.uid(), 'admin'::app_role)) OR (SELECT public.has_role(auth.uid(), 'supervisor'::app_role))))
      WITH CHECK (empresa_id = (SELECT public.get_user_empresa_id()));
    CREATE POLICY auth_delete_cat_cuotas ON public.cat_cuotas FOR DELETE TO authenticated
      USING (empresa_id = (SELECT public.get_user_empresa_id())
        AND ((SELECT public.has_role(auth.uid(), 'admin'::app_role)) OR (SELECT public.has_role(auth.uid(), 'supervisor'::app_role))));
  END IF;
END $$;

-- ===== 20261012150000_rpc_integridad =====
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

-- ===== 20261012160000_rpc_agregados =====
-- RPCs de agregación (solo lectura) para reemplazar descargas masivas + cálculos en el navegador.
-- SECURITY INVOKER: RLS sigue aplicando igual que en las consultas PostgREST que reemplazan;
-- además se filtra explícitamente por empresa_id = get_user_empresa_id().
-- Idempotente y aditivo: el frontend anterior sigue funcionando sin cambios.

-- ── Índices de soporte ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pagos_cuota                ON public.pagos (cuota_id);
CREATE INDEX IF NOT EXISTS idx_pagos_ruta_created         ON public.pagos (ruta_id, created_at);
CREATE INDEX IF NOT EXISTS idx_prestamos_empresa_created  ON public.prestamos (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prestamos_caja             ON public.prestamos (caja_id);
CREATE INDEX IF NOT EXISTS idx_crm_gestiones_cliente_fecha ON public.crm_gestiones (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervisor_rutas_supervisor ON public.supervisor_rutas (supervisor_id);

-- ── 1) Dashboard ─────────────────────────────────────────────────
-- p_filters: { desde, hasta: 'YYYY-MM-DD' | null, ruta_id, cobrador_id, caja_id: uuid | null,
--              today: 'YYYY-MM-DD' (UTC, como new Date().toISOString()), today_local: 'YYYY-MM-DD',
--              meses: ['YYYY-MM', ...] }
CREATE OR REPLACE FUNCTION public.dashboard_kpis(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_emp uuid := public.get_user_empresa_id();
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_desde text := nullif(v_f->>'desde', '');
  v_hasta text := nullif(v_f->>'hasta', '');
  v_desde_d date;
  v_hasta_d date;
  v_ruta uuid := nullif(v_f->>'ruta_id', '')::uuid;
  v_cob uuid := nullif(v_f->>'cobrador_id', '')::uuid;
  v_caja uuid := nullif(v_f->>'caja_id', '')::uuid;
  v_today date := coalesce(nullif(v_f->>'today', '')::date, (now() AT TIME ZONE 'UTC')::date);
  v_today_local date;
  v_mes_ini date;
  v_tz text := current_setting('TimeZone');
  v_meses text[];
  v_sin_filtros boolean;
  v_result jsonb;
BEGIN
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  v_sin_filtros := v_desde IS NULL AND v_hasta IS NULL AND v_ruta IS NULL AND v_cob IS NULL AND v_caja IS NULL;
  v_desde_d := v_desde::date;
  v_hasta_d := v_hasta::date;
  v_today_local := coalesce(nullif(v_f->>'today_local', '')::date, v_today);
  v_mes_ini := date_trunc('month', v_today)::date;
  SELECT coalesce(array_agg(x), ARRAY[]::text[]) INTO v_meses
  FROM jsonb_array_elements_text(coalesce(v_f->'meses', '[]'::jsonb)) AS x;
  IF cardinality(v_meses) = 0 THEN
    v_meses := ARRAY(
      SELECT to_char(v_mes_ini - make_interval(months => g), 'YYYY-MM')
      FROM generate_series(5, 0, -1) AS g
    );
  END IF;

  -- Semántica idéntica al cálculo previo en el navegador:
  --  * fechas de pagos/movimientos = fecha (zona de la sesión, UTC en Supabase) de created_at;
  --  * prestamos.fecha_registro se compara como texto (igual que el string JSON);
  --  * pagos NO filtran anulado (el dashboard previo tampoco lo hacía).
  WITH pr AS (
    SELECT p.id, p.cliente_id, p.ruta_id, p.cobrador_id,
           p.estado::text AS estado,
           p.frecuencia::text AS frecuencia,
           coalesce(p.monto_solicitado, 0) AS monto,
           coalesce(p.monto_total_pagar, 0) AS total_pagar,
           coalesce(p.fecha_registro::text, '') AS freg,
           p.estado::text IN ('Activo', 'Al día', 'Vencido') AS activo
    FROM prestamos p
    WHERE p.empresa_id = v_emp
      AND (v_ruta IS NULL OR p.ruta_id = v_ruta)
      AND (v_cob IS NULL OR p.cobrador_id = v_cob)
      AND (v_caja IS NULL OR p.caja_id = v_caja)
      AND (v_desde IS NULL OR coalesce(p.fecha_registro::text, '') COLLATE "C" >= v_desde)
      AND (v_hasta IS NULL OR coalesce(p.fecha_registro::text, '') COLLATE "C" <= v_hasta)
  ),
  -- Amortización pre-agregada por (préstamo, status): todo lo demás se acumula desde aquí.
  am AS (
    SELECT g.*, g.status IS DISTINCT FROM 'Pagada' AS pendiente, pr.activo, pr.cobrador_id, pr.ruta_id
    FROM (
      SELECT a.prestamo_id,
             a.status::text AS status,
             count(*) AS n,
             sum(coalesce(a.saldo_total, 0)) AS st,
             sum(coalesce(a.saldo_capital, 0)) AS sc,
             sum(coalesce(a.saldo_interes, 0)) AS si,
             sum(coalesce(a.saldo_mora, 0)) AS sm,
             sum(coalesce(a.capital_pagado, 0)) AS cp,
             sum(coalesce(a.interes_pagado, 0)) AS ip,
             sum(coalesce(a.mora_pagada, 0)) AS mp,
             count(*) FILTER (WHERE a.fecha_vencimiento::date < v_today) AS n_venc,
             coalesce(sum(coalesce(a.saldo_total, 0)) FILTER (WHERE a.fecha_vencimiento::date < v_today), 0) AS st_venc,
             count(*) FILTER (WHERE a.fecha_vencimiento::date = v_today) AS n_hoy,
             coalesce(sum(coalesce(a.saldo_total, 0)) FILTER (WHERE a.fecha_vencimiento::date = v_today), 0) AS st_hoy,
             max(v_today_local - a.fecha_vencimiento::date) FILTER (WHERE a.fecha_vencimiento::date < v_today) AS dias
      FROM amortizacion a
      WHERE a.empresa_id = v_emp
        AND (v_sin_filtros OR a.prestamo_id IN (SELECT pr.id FROM pr))
      GROUP BY a.prestamo_id, a.status
    ) g
    JOIN pr ON pr.id = g.prestamo_id
  ),
  -- Pagos pre-agregados por (cobrador, día)
  pg AS (
    SELECT x.cobrador_id, x.d,
           count(*) AS n,
           sum(x.m) AS m, sum(x.c) AS c, sum(x.i) AS i, sum(x.mo) AS mo
    FROM (
      SELECT p.cobrador_id,
             (p.created_at AT TIME ZONE v_tz)::date AS d,
             coalesce(p.monto_recibido, 0) AS m,
             coalesce(p.aplicado_capital, 0) AS c,
             coalesce(p.aplicado_interes, 0) AS i,
             coalesce(p.aplicado_mora, 0) AS mo
      FROM pagos p
      JOIN pr ON pr.id = p.prestamo_id
      WHERE p.empresa_id = v_emp
        AND (v_cob IS NULL OR p.cobrador_id = v_cob)
        AND (v_caja IS NULL OR p.caja_id = v_caja)
        AND (v_ruta IS NULL OR p.ruta_id = v_ruta)
    ) x
    WHERE (v_desde_d IS NULL OR x.d >= v_desde_d)
      AND (v_hasta_d IS NULL OR x.d IS NULL OR x.d <= v_hasta_d)
    GROUP BY x.cobrador_id, x.d
  ),
  k_pr AS (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE activo) AS activos,
           count(*) FILTER (WHERE estado = 'Liquidado') AS liquidados,
           count(*) FILTER (WHERE estado = 'Juridico') AS juridicos,
           count(*) FILTER (WHERE estado = 'Vencido') AS vencidos,
           coalesce(sum(monto) FILTER (WHERE activo), 0) AS capital_colocado,
           coalesce(sum(total_pagar) FILTER (WHERE activo), 0) AS total_pagar
    FROM pr
  ),
  -- Por préstamo activo, solo cuotas no pagadas (top deudores y préstamos en riesgo)
  deud AS (
    SELECT am.prestamo_id,
           sum(am.st) AS saldo,
           sum(am.st_venc) AS vencido,
           sum(am.sm) AS mora,
           greatest(coalesce(max(am.dias), 0), 0) AS dias,
           sum(am.n_venc) > 0 AS en_riesgo
    FROM am
    WHERE am.activo AND am.pendiente
    GROUP BY am.prestamo_id
  ),
  k_am AS (
    SELECT coalesce(sum(st) FILTER (WHERE pendiente), 0) AS saldo_por_cobrar,
           coalesce(sum(sc) FILTER (WHERE pendiente), 0) AS saldo_capital,
           coalesce(sum(si) FILTER (WHERE pendiente), 0) AS saldo_interes,
           coalesce(sum(sm), 0) AS mora_total,
           coalesce(sum(cp), 0) AS capital_recuperado,
           coalesce(sum(ip), 0) AS interes_recuperado,
           coalesce(sum(mp), 0) AS mora_recuperada,
           coalesce(sum(CASE WHEN status = 'Vencida' THEN n WHEN pendiente THEN n_venc ELSE 0 END), 0) AS cuotas_vencidas,
           coalesce(sum(n) FILTER (WHERE pendiente), 0) AS cuotas_pendientes,
           coalesce(sum(n) FILTER (WHERE status = 'Pagada'), 0) AS cuotas_pagadas,
           coalesce(sum(n), 0) AS total_cuotas,
           coalesce(sum(st_venc) FILTER (WHERE pendiente), 0) AS monto_vencido,
           coalesce(sum(st_hoy) FILTER (WHERE pendiente), 0) AS monto_vence_hoy,
           coalesce(sum(n_hoy) FILTER (WHERE pendiente), 0) AS cuotas_vencen_hoy,
           (SELECT count(*) FROM deud WHERE en_riesgo) AS prestamos_en_riesgo
    FROM am
    WHERE activo
  ),
  k_pg AS (
    SELECT coalesce(sum(m), 0) AS total_cobrado,
           coalesce(sum(c), 0) AS capital_cobrado,
           coalesce(sum(i), 0) AS interes_cobrado,
           coalesce(sum(mo), 0) AS mora_cobrada,
           coalesce(sum(m) FILTER (WHERE d = v_today), 0) AS cobrado_hoy,
           coalesce(sum(n) FILTER (WHERE d = v_today), 0) AS num_pagos_hoy,
           coalesce(sum(m) FILTER (WHERE date_trunc('month', d) = v_mes_ini), 0) AS cobrado_mes,
           coalesce(sum(i + mo) FILTER (WHERE date_trunc('month', d) = v_mes_ini), 0) AS ingreso_financiero_mes
    FROM pg
  ),
  k_mv AS (
    SELECT coalesce(sum(coalesce(x.monto, 0)), 0) AS gastos_mes
    FROM (
      SELECT m.monto, m.concepto, m.tipo, (m.created_at AT TIME ZONE v_tz)::date AS d
      FROM movimientos_caja m
      WHERE m.empresa_id = v_emp
        AND (v_caja IS NULL OR m.caja_id = v_caja)
        AND m.tipo::text = 'salida'
    ) x
    WHERE (v_desde_d IS NULL OR x.d >= v_desde_d)
      AND (v_hasta_d IS NULL OR x.d IS NULL OR x.d <= v_hasta_d)
      AND date_trunc('month', x.d) = v_mes_ini
      AND lower(translate(coalesce(x.concepto, ''), 'ÁÉÍÓÚ', 'áéíóú'))
          !~ '(desembolso|préstamo|prestamo|retiro|transferencia|recurso|anulación|anulacion|corrección|correccion)'
  ),
  k_misc AS (
    SELECT
      (SELECT coalesce(sum(coalesce(pf.efectivo_en_mano, 0)), 0) FROM profiles pf WHERE pf.empresa_id = v_emp) AS efectivo_calle,
      (SELECT coalesce(sum(coalesce(cj.saldo_actual, 0)), 0) FROM cajas cj WHERE cj.empresa_id = v_emp) AS capital_cajas,
      (SELECT count(*) FROM promesas_pago pp WHERE pp.empresa_id = v_emp AND pp.status = 'Pendiente') AS promesas_pendientes,
      (SELECT count(*) FROM promesas_pago pp WHERE pp.empresa_id = v_emp AND pp.status = 'Pendiente'
          AND pp.fecha_prometida::date <= v_today) AS promesas_por_atender,
      (SELECT coalesce(sum(coalesce(pp.monto_prometido, 0)), 0) FROM promesas_pago pp WHERE pp.empresa_id = v_emp
          AND pp.status = 'Pendiente' AND pp.fecha_prometida::date <= v_today) AS monto_promesas_hoy,
      (SELECT count(*) FROM clientes cl WHERE cl.empresa_id = v_emp AND cl.estado::text = 'Activo') AS clientes_activos,
      (SELECT count(*) FROM clientes cl WHERE cl.empresa_id = v_emp AND cl.estado::text = 'En mora') AS clientes_mora
  ),
  top_deud AS (
    SELECT jsonb_agg(jsonb_build_object(
             'id', d.prestamo_id,
             'cliente', coalesce(nullif(cl.nombre_completo, ''), 'Cliente sin nombre'),
             'telefono', nullif(cl.telefono, ''),
             'direccion', nullif(cl.direccion, ''),
             'gpsLat', nullif(cl.gps_lat, 0),
             'gpsLng', nullif(cl.gps_lng, 0),
             'saldo', d.saldo,
             'vencido', d.vencido,
             'mora', d.mora,
             'diasAtraso', d.dias,
             'ruta', coalesce(nullif(r.nombre, ''), 'Sin ruta'),
             'cobrador', coalesce(nullif(pf.nombre_completo, ''), 'Sin cobrador')
           ) ORDER BY d.vencido DESC, d.saldo DESC, d.prestamo_id) AS items
    FROM (SELECT * FROM deud WHERE saldo > 0 ORDER BY vencido DESC, saldo DESC, prestamo_id LIMIT 8) d
    JOIN pr ON pr.id = d.prestamo_id
    LEFT JOIN clientes cl ON cl.id = pr.cliente_id
    LEFT JOIN rutas r ON r.id = pr.ruta_id AND r.empresa_id = v_emp
    LEFT JOIN profiles pf ON pf.id = pr.cobrador_id AND pf.empresa_id = v_emp
  ),
  meses AS (
    SELECT jsonb_agg(jsonb_build_object(
             'ym', u.ym,
             'colocado', coalesce(col.colocado, 0),
             'cobrado', coalesce(pm.cobrado, 0),
             'mora', coalesce(pm.mora, 0),
             'interes', coalesce(pm.interes, 0),
             'capital', coalesce(pm.capital, 0)
           ) ORDER BY u.ord) AS items
    FROM unnest(v_meses) WITH ORDINALITY AS u(ym, ord)
    LEFT JOIN (SELECT left(freg, 7) AS ym, sum(monto) AS colocado FROM pr GROUP BY 1) col ON col.ym = u.ym
    LEFT JOIN (SELECT to_char(d, 'YYYY-MM') AS ym, sum(m) AS cobrado, sum(mo) AS mora, sum(i) AS interes, sum(c) AS capital
               FROM pg WHERE d IS NOT NULL GROUP BY 1) pm ON pm.ym = u.ym
  ),
  pies AS (
    SELECT
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value) ORDER BY value DESC, name), '[]'::jsonb)
         FROM (SELECT coalesce(estado, 'Activo') AS name, count(*) AS value FROM pr GROUP BY 1) x) AS estado,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value) ORDER BY value DESC, name), '[]'::jsonb)
         FROM (SELECT coalesce(nullif(frecuencia, ''), 'semanal') AS name, count(*) AS value FROM pr WHERE activo GROUP BY 1) x) AS frecuencia,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value) ORDER BY value DESC, name), '[]'::jsonb)
         FROM (SELECT coalesce(nullif(status, ''), 'Pendiente') AS name, sum(n) AS value FROM am WHERE activo GROUP BY 1) x) AS cuota_status
  ),
  cob_stats AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', pf.id,
             'nombre', pf.nombre_completo,
             'cobrado', coalesce(pc.cobrado, 0),
             'prestamos', coalesce(prc.n, 0),
             'efectivo', coalesce(pf.efectivo_en_mano, 0),
             'saldo', coalesce(ac.saldo, 0),
             'mora', coalesce(ac.mora, 0)
           ) ORDER BY coalesce(pc.cobrado, 0) DESC, pf.nombre_completo, pf.id), '[]'::jsonb) AS items
    FROM profiles pf
    LEFT JOIN (SELECT cobrador_id, sum(m) AS cobrado FROM pg GROUP BY 1) pc ON pc.cobrador_id = pf.id
    LEFT JOIN (SELECT cobrador_id, count(*) AS n FROM pr WHERE activo GROUP BY 1) prc ON prc.cobrador_id = pf.id
    LEFT JOIN (SELECT cobrador_id, sum(st) FILTER (WHERE pendiente) AS saldo, sum(sm) AS mora FROM am GROUP BY 1) ac
      ON ac.cobrador_id = pf.id
    WHERE pf.empresa_id = v_emp AND pf.activo
  ),
  ruta_stats AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'nombre', r.nombre,
             'prestamos', coalesce(prc.n, 0),
             'saldo', coalesce(ar.saldo, 0),
             'mora', coalesce(ar.mora, 0)
           ) ORDER BY coalesce(ar.saldo, 0) DESC, r.nombre, r.id), '[]'::jsonb) AS items
    FROM rutas r
    LEFT JOIN (SELECT ruta_id, count(*) AS n FROM pr WHERE activo GROUP BY 1) prc ON prc.ruta_id = r.id
    LEFT JOIN (SELECT ruta_id, coalesce(sum(st) FILTER (WHERE pendiente), 0) AS saldo, sum(sm) AS mora
               FROM am WHERE activo GROUP BY 1) ar ON ar.ruta_id = r.id
    WHERE r.empresa_id = v_emp
  ),
  opciones AS (
    SELECT
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nombre', r.nombre) ORDER BY r.nombre, r.id), '[]'::jsonb)
         FROM rutas r WHERE r.empresa_id = v_emp) AS rutas,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', pf.id, 'nombre_completo', pf.nombre_completo) ORDER BY pf.nombre_completo, pf.id), '[]'::jsonb)
         FROM profiles pf WHERE pf.empresa_id = v_emp AND pf.activo) AS cobradores,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', cj.id, 'nombre', cj.nombre, 'saldo', coalesce(cj.saldo_actual, 0)) ORDER BY cj.nombre, cj.id), '[]'::jsonb)
         FROM cajas cj WHERE cj.empresa_id = v_emp) AS cajas
  )
  SELECT jsonb_build_object(
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'prestamos', to_jsonb(k_pr),
    'cuotas', to_jsonb(k_am),
    'pagos', to_jsonb(k_pg),
    'gastosMes', k_mv.gastos_mes,
    'misc', to_jsonb(k_misc),
    'topDeudores', coalesce(top_deud.items, '[]'::jsonb),
    'meses', coalesce(meses.items, '[]'::jsonb),
    'pies', to_jsonb(pies),
    'cobradorStats', cob_stats.items,
    'rutaStats', ruta_stats.items,
    'opciones', to_jsonb(opciones)
  )
  INTO v_result
  FROM k_pr, k_am, k_pg, k_mv, k_misc, top_deud, meses, pies, cob_stats, ruta_stats, opciones;

  RETURN v_result;
END;
$$;

-- ── 2) Préstamos: agregados por préstamo (lista) ─────────────────
-- p_ids viaja en el body (POST), sin límite de URL. Devuelve 1 fila por préstamo:
-- el cliente debe trocear p_ids en lotes de <= 1000 (límite de filas de PostgREST).
CREATE OR REPLACE FUNCTION public.prestamos_resumen(p_ids uuid[] DEFAULT NULL, p_today date DEFAULT NULL)
RETURNS TABLE (
  prestamo_id uuid,
  cliente_nombre text,
  cliente_foto text,
  caja_nombre text,
  ruta_nombre text,
  cobrador_nombre text,
  saldo numeric,
  saldo_capital numeric,
  saldo_interes numeric,
  mora numeric,
  saldo_atrasado numeric,
  mora_atrasada numeric,
  cuotas_pagadas integer,
  tiene_atraso boolean,
  dias_atraso integer,
  proximo_vencimiento text,
  ultimo_pago_fecha text,
  ultimo_pago_monto numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH t AS (
    SELECT coalesce(p_today, (now() AT TIME ZONE 'UTC')::date) AS hoy
  ),
  p AS (
    SELECT pr.id, pr.cliente_id, pr.caja_id, pr.ruta_id, pr.cobrador_id
    FROM prestamos pr
    WHERE pr.empresa_id = public.get_user_empresa_id()
      AND (p_ids IS NULL OR pr.id = ANY (p_ids))
  )
  SELECT p.id,
         c.nombre_completo::text,
         c.foto_cliente::text,
         cj.nombre::text,
         r.nombre::text,
         pf.nombre_completo::text,
         coalesce(a.saldo, 0),
         coalesce(a.saldo_capital, 0),
         coalesce(a.saldo_interes, 0),
         coalesce(a.mora, 0),
         coalesce(a.saldo_atrasado, 0),
         coalesce(a.mora_atrasada, 0),
         coalesce(a.pagadas, 0)::integer,
         coalesce(a.tiene_atraso, false),
         greatest(coalesce(a.dias_atraso, 0), 0)::integer,
         to_char(a.proximo, 'YYYY-MM-DD'),
         u.fecha,
         u.monto
  FROM p
  CROSS JOIN t
  LEFT JOIN clientes c ON c.id = p.cliente_id
  LEFT JOIN cajas cj ON cj.id = p.caja_id
  LEFT JOIN rutas r ON r.id = p.ruta_id
  LEFT JOIN profiles pf ON pf.id = p.cobrador_id
  LEFT JOIN LATERAL (
    SELECT sum(coalesce(am.saldo_total, 0)) AS saldo,
           sum(coalesce(am.saldo_capital, 0)) AS saldo_capital,
           sum(coalesce(am.saldo_interes, 0)) AS saldo_interes,
           sum(coalesce(am.saldo_mora, 0)) AS mora,
           sum(coalesce(am.saldo_total, 0)) FILTER (WHERE am.fecha_vencimiento::date < t.hoy AND coalesce(am.saldo_total, 0) > 0) AS saldo_atrasado,
           sum(coalesce(am.saldo_mora, 0)) FILTER (WHERE am.fecha_vencimiento::date < t.hoy AND coalesce(am.saldo_total, 0) > 0) AS mora_atrasada,
           count(*) FILTER (WHERE am.status = 'Pagada') AS pagadas,
           bool_or(am.fecha_vencimiento::date < t.hoy AND coalesce(am.saldo_total, 0) > 0) AS tiene_atraso,
           max(t.hoy - am.fecha_vencimiento::date) FILTER (WHERE am.fecha_vencimiento::date < t.hoy AND coalesce(am.saldo_total, 0) > 0) AS dias_atraso,
           min(am.fecha_vencimiento::date) FILTER (WHERE am.fecha_vencimiento::date >= t.hoy AND coalesce(am.saldo_total, 0) > 0) AS proximo
    FROM amortizacion am
    WHERE am.prestamo_id = p.id
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT to_jsonb(pg.fecha_pago) #>> '{}' AS fecha,
           nullif(coalesce(pg.monto_recibido, 0), 0) AS monto
    FROM pagos pg
    WHERE pg.prestamo_id = p.id AND pg.anulado = false
    ORDER BY pg.fecha_pago DESC, pg.created_at DESC, pg.id DESC
    LIMIT 1
  ) u ON true;
$$;

-- ── 3) Saldo real de cajas (desde tablas fuente, sin tope de 1000 filas) ──
-- + pagos no anulados − desembolsos no cancelados ± movimientos manuales (prestamo_id IS NULL)
-- EXCLUYENDO las entradas de corte/liquidación de cobrador: ese efectivo ya entró a la caja
-- con el pago (pagos.caja_id), volver a sumarlo lo duplicaba.
CREATE OR REPLACE FUNCTION public.caja_saldos(p_caja_ids uuid[])
RETURNS TABLE (caja_id uuid, saldo numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  SELECT c.id,
         coalesce((SELECT sum(coalesce(p.monto_recibido, 0)) FROM pagos p
                   WHERE p.caja_id = c.id AND p.anulado = false), 0)
       - coalesce((SELECT sum(coalesce(pr.monto_solicitado, 0)) FROM prestamos pr
                   WHERE pr.caja_id = c.id AND pr.estado::text <> 'Cancelado'), 0)
       + coalesce((SELECT sum(CASE WHEN m.tipo::text = 'entrada' THEN coalesce(m.monto, 0) ELSE -coalesce(m.monto, 0) END)
                   FROM movimientos_caja m
                   WHERE m.caja_id = c.id
                     AND m.prestamo_id IS NULL
                     AND NOT (m.tipo::text = 'entrada'
                              AND (coalesce(m.concepto, '') ILIKE 'Corte cobrador%'
                                   OR coalesce(m.concepto, '') ILIKE 'Liquidación ruta%'
                                   OR coalesce(m.concepto, '') ILIKE 'Liquidacion ruta%'))), 0)
  FROM cajas c
  WHERE c.empresa_id = public.get_user_empresa_id()
    AND c.id = ANY (p_caja_ids);
$$;

-- ── 4) Comisiones: cobros del equipo de un supervisor ───────────
CREATE OR REPLACE FUNCTION public.cobros_equipo_total(p_supervisor_id uuid, p_desde timestamptz DEFAULT NULL, p_hasta timestamptz DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  SELECT coalesce(sum(coalesce(p.monto_recibido, 0)), 0)
  FROM pagos p
  WHERE p.empresa_id = public.get_user_empresa_id()
    AND p.anulado = false
    AND p.ruta_id IN (SELECT sr.ruta_id FROM supervisor_rutas sr WHERE sr.supervisor_id = p_supervisor_id)
    AND (p_desde IS NULL OR p.created_at >= p_desde)
    AND (p_hasta IS NULL OR p.created_at <= p_hasta);
$$;

-- ── 6) Clientes: estados de cuenta ───────────────────────────────
CREATE OR REPLACE FUNCTION public.estados_cuenta_clientes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH emp AS (SELECT public.get_user_empresa_id() AS id),
  pr AS (
    SELECT p.id, p.cliente_id, p.cobrador_id
    FROM prestamos p, emp
    WHERE p.empresa_id = emp.id AND p.estado::text IN ('Activo', 'Al día', 'Vencido')
  ),
  cu AS (
    SELECT pr.cliente_id,
           sum(coalesce(a.saldo_total, 0)) AS saldo_total,
           count(*) FILTER (WHERE a.status = 'Vencida') AS cuotas_vencidas,
           coalesce(sum(coalesce(a.saldo_total, 0)) FILTER (WHERE a.status = 'Vencida'), 0) AS saldo_moroso
    FROM amortizacion a
    JOIN pr ON pr.id = a.prestamo_id
    WHERE a.status <> 'Pagada'
    GROUP BY pr.cliente_id
  ),
  cob AS (
    SELECT DISTINCT ON (pr.cliente_id) pr.cliente_id, pf.nombre_completo
    FROM pr
    JOIN profiles pf ON pf.id = pr.cobrador_id
    WHERE coalesce(pf.nombre_completo, '') <> ''
    ORDER BY pr.cliente_id, pr.id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'cliente_id', c.id,
           'id_cliente', c.id_cliente,
           'nombre_completo', c.nombre_completo,
           'saldo_total', cu.saldo_total,
           'cuotas_vencidas', cu.cuotas_vencidas,
           'saldo_moroso', cu.saldo_moroso,
           'cobrador_nombre', cob.nombre_completo
         ) ORDER BY c.nombre_completo, c.id), '[]'::jsonb)
  FROM clientes c
  CROSS JOIN emp
  JOIN cu ON cu.cliente_id = c.id
  LEFT JOIN cob ON cob.cliente_id = c.id
  WHERE c.empresa_id = emp.id
    AND c.activo = true
    AND (cu.saldo_total > 0 OR cu.cuotas_vencidas > 0);
$$;

-- ── 8a) Rentabilidad ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rentabilidad_resumen()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH emp AS (SELECT public.get_user_empresa_id() AS id),
  pg AS (
    SELECT p.prestamo_id,
           sum(coalesce(p.aplicado_capital, 0)) AS capital,
           sum(coalesce(p.aplicado_interes, 0)) AS interes,
           sum(coalesce(p.aplicado_mora, 0)) AS mora,
           sum(coalesce(p.monto_recibido, 0)) AS total
    FROM pagos p, emp
    WHERE p.empresa_id = emp.id AND p.anulado = false
    GROUP BY p.prestamo_id
  ),
  bp AS (
    SELECT pr.id, pr.estado::text AS estado, pr.ruta_id, pr.cobrador_id, pr.cliente_id,
           coalesce(pr.monto_solicitado, 0) AS capital_colocado,
           coalesce(pg.capital, 0) AS capital_recuperado,
           coalesce(pg.interes, 0) AS interes_ganado,
           coalesce(pg.mora, 0) AS mora_ganada,
           coalesce(pg.total, 0) AS total_recibido,
           coalesce(pg.interes, 0) + coalesce(pg.mora, 0) AS utilidad_bruta
    FROM prestamos pr
    CROSS JOIN emp
    LEFT JOIN pg ON pg.prestamo_id = pr.id
    WHERE pr.empresa_id = emp.id
      AND pr.estado::text IN ('Activo', 'Al día', 'Vencido', 'Liquidado')
  ),
  grp_ruta AS (
    SELECT coalesce(bp.ruta_id::text, 'sin-ruta') AS key, bp.ruta_id, count(*) AS prestamos,
           sum(capital_colocado) AS capital_colocado, sum(capital_recuperado) AS capital_recuperado,
           sum(utilidad_bruta) AS utilidad_bruta
    FROM bp GROUP BY 1, 2
  ),
  grp_cob AS (
    SELECT coalesce(bp.cobrador_id::text, 'sin-cobrador') AS key, bp.cobrador_id, count(*) AS prestamos,
           sum(capital_colocado) AS capital_colocado, sum(capital_recuperado) AS capital_recuperado,
           sum(utilidad_bruta) AS utilidad_bruta
    FROM bp GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'totales', (SELECT jsonb_build_object(
                  'totalCapital', coalesce(sum(capital_colocado), 0),
                  'totalUtilidad', coalesce(sum(utilidad_bruta), 0),
                  'totalRecuperado', coalesce(sum(capital_recuperado), 0),
                  'totalInteres', coalesce(sum(interes_ganado), 0),
                  'totalMora', coalesce(sum(mora_ganada), 0))
                FROM bp),
    'porRuta', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'rutaId', g.key, 'nombre', coalesce(nullif(r.nombre, ''), 'Sin ruta'), 'prestamos', g.prestamos,
                  'capitalColocado', g.capital_colocado, 'capitalRecuperado', g.capital_recuperado,
                  'utilidadBruta', g.utilidad_bruta) ORDER BY g.utilidad_bruta DESC, g.key), '[]'::jsonb)
                FROM grp_ruta g CROSS JOIN emp
                LEFT JOIN rutas r ON r.id = g.ruta_id AND r.empresa_id = emp.id),
    'porCobrador', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'cobId', g.key, 'nombre', coalesce(nullif(pf.nombre_completo, ''), 'Sin asignar'), 'prestamos', g.prestamos,
                  'capitalColocado', g.capital_colocado, 'capitalRecuperado', g.capital_recuperado,
                  'utilidadBruta', g.utilidad_bruta) ORDER BY g.utilidad_bruta DESC, g.key), '[]'::jsonb)
                FROM grp_cob g CROSS JOIN emp
                LEFT JOIN profiles pf ON pf.id = g.cobrador_id AND pf.empresa_id = emp.id),
    'porPrestamo', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'id', x.id, 'cliente', coalesce(nullif(cl.nombre_completo, ''), '—'),
                  'capitalColocado', x.capital_colocado, 'capitalRecuperado', x.capital_recuperado,
                  'interesGanado', x.interes_ganado, 'moraGanada', x.mora_ganada, 'totalRecibido', x.total_recibido,
                  'utilidadBruta', x.utilidad_bruta, 'estado', x.estado) ORDER BY x.utilidad_bruta DESC, x.id), '[]'::jsonb)
                FROM (SELECT * FROM bp ORDER BY utilidad_bruta DESC, id LIMIT 100) x
                LEFT JOIN clientes cl ON cl.id = x.cliente_id)
  );
$$;

-- ── 8b) Productividad: mora vencida por asesor ──────────────────
-- asesor = coalesce(cobrador_id, generado_por); NULL => "Sin asignar".
CREATE OR REPLACE FUNCTION public.productividad_mora(p_today date DEFAULT NULL)
RETURNS TABLE (advisor_id text, clientes_morosos integer, monto_mora numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  SELECT coalesce(p.cobrador_id::text, p.generado_por::text) AS advisor_id,
         count(DISTINCT p.cliente_id)::integer,
         sum(coalesce(a.saldo_mora, 0))
  FROM amortizacion a
  JOIN prestamos p ON p.id = a.prestamo_id
  WHERE p.empresa_id = public.get_user_empresa_id()
    AND p.estado::text IN ('Activo', 'Al día', 'Vencido')
    AND a.fecha_vencimiento::date < coalesce(p_today, (now() AT TIME ZONE 'UTC')::date)
    AND coalesce(a.saldo_total, 0) > 0
  GROUP BY 1;
$$;

-- ── 8c) Productividad: última visita por cliente ────────────────
CREATE OR REPLACE FUNCTION public.clientes_ultima_visita()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  SELECT coalesce(jsonb_object_agg(x.cliente_id, x.ultima), '{}'::jsonb)
  FROM (
    SELECT g.cliente_id, max(g.created_at) AS ultima
    FROM crm_gestiones g
    WHERE g.empresa_id = public.get_user_empresa_id()
      AND g.tipo_gestion = 'Visita'
      AND g.cliente_id IS NOT NULL
    GROUP BY g.cliente_id
  ) x;
$$;

-- ── 9) Cobranza: gestiones por préstamo (conteo + última) ───────
CREATE OR REPLACE FUNCTION public.gestiones_resumen(p_prestamo_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  SELECT coalesce(jsonb_object_agg(x.prestamo_id, jsonb_build_object('count', x.n, 'ultima', x.ultima)), '{}'::jsonb)
  FROM (
    SELECT g.prestamo_id, count(*) AS n, max(g.created_at) AS ultima
    FROM crm_gestiones g
    WHERE g.empresa_id = public.get_user_empresa_id()
      AND g.prestamo_id = ANY (p_prestamo_ids)
    GROUP BY g.prestamo_id
  ) x;
$$;

-- ── 10) Rutas: préstamos vigentes por ruta ──────────────────────
CREATE OR REPLACE FUNCTION public.prestamos_por_ruta()
RETURNS TABLE (ruta_id uuid, total integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  SELECT p.ruta_id, count(*)::integer
  FROM prestamos p
  WHERE p.empresa_id = public.get_user_empresa_id()
    AND p.ruta_id IS NOT NULL
    AND p.estado::text NOT IN ('Cancelado', 'Liquidado')
  GROUP BY p.ruta_id;
$$;

-- ── 11) Pagos: listado paginado con filtros, orden y totales ────
-- p_filtros: { search, metodos[], cajas[] (nombres), rutas[] (nombres), desde, hasta (ISO instantes),
--              sort_key, sort_dir: 'asc'|'desc' }. p_limit NULL = todas las filas filtradas.
CREATE OR REPLACE FUNCTION public.pagos_listado(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
DECLARE
  v_emp uuid := public.get_user_empresa_id();
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_q text := lower(nullif(v_f->>'search', ''));
  v_metodos text[];
  v_cajas text[];
  v_rutas text[];
  v_desde timestamptz := nullif(v_f->>'desde', '')::timestamptz;
  v_hasta timestamptz := nullif(v_f->>'hasta', '')::timestamptz;
  v_dir text := CASE WHEN v_f->>'sort_dir' = 'desc' THEN 'DESC' ELSE 'ASC' END;
  v_order text;
  v_sql text;
  v_result jsonb;
BEGIN
  IF v_emp IS NULL THEN
    RETURN jsonb_build_object('total', 0, 'rows', '[]'::jsonb);
  END IF;
  SELECT nullif(array_agg(x), '{}') INTO v_metodos FROM jsonb_array_elements_text(coalesce(v_f->'metodos', '[]'::jsonb)) x;
  SELECT nullif(array_agg(x), '{}') INTO v_cajas FROM jsonb_array_elements_text(coalesce(v_f->'cajas', '[]'::jsonb)) x;
  SELECT nullif(array_agg(x), '{}') INTO v_rutas FROM jsonb_array_elements_text(coalesce(v_f->'rutas', '[]'::jsonb)) x;

  v_order := CASE v_f->>'sort_key'
    WHEN 'fecha' THEN 'created_at ' || v_dir || CASE WHEN v_dir = 'ASC' THEN ' NULLS FIRST' ELSE ' NULLS LAST' END
    WHEN 'cliente' THEN 'cliente ' || v_dir
    WHEN 'shortId' THEN 'short_id ' || v_dir
    WHEN 'montoRecibido' THEN 'monto_recibido ' || v_dir
    WHEN 'aplicadoMora' THEN 'aplicado_mora ' || v_dir
    WHEN 'aplicadoInteres' THEN 'aplicado_interes ' || v_dir
    WHEN 'aplicadoCapital' THEN 'aplicado_capital ' || v_dir
    WHEN 'metodo' THEN 'metodo ' || v_dir
    WHEN 'caja' THEN 'caja ' || v_dir
    WHEN 'ruta' THEN 'ruta ' || v_dir
    ELSE NULL
  END;
  v_order := coalesce(v_order || ', ', '') || 'created_at DESC, id';

  v_sql := $q$
    WITH base AS (
      SELECT p.id, p.created_at,
             coalesce(p.monto_recibido, 0) AS monto_recibido,
             coalesce(p.aplicado_mora, 0) AS aplicado_mora,
             coalesce(p.aplicado_interes, 0) AS aplicado_interes,
             coalesce(p.aplicado_capital, 0) AS aplicado_capital,
             coalesce(nullif(p.metodo_pago::text, ''), 'Efectivo') AS metodo,
             coalesce(nullif(cl.nombre_completo, ''), '—') AS cliente,
             coalesce(nullif(pr.id_prestamo, ''), 'PRE-' || left(coalesce(p.prestamo_id::text, ''), 8)) AS short_id,
             coalesce(nullif(cj.nombre, ''), '—') AS caja,
             coalesce(nullif(r.nombre, ''), '—') AS ruta
      FROM pagos p
      LEFT JOIN prestamos pr ON pr.id = p.prestamo_id
      LEFT JOIN clientes cl ON cl.id = pr.cliente_id
      LEFT JOIN rutas r ON r.id = pr.ruta_id
      LEFT JOIN cajas cj ON cj.id = p.caja_id
      WHERE p.empresa_id = $1
    ),
    filt AS (
      SELECT * FROM base
      WHERE ($2::text IS NULL OR strpos(lower(cliente), $2) > 0 OR strpos(lower(short_id), $2) > 0)
        AND ($3::text[] IS NULL OR metodo = ANY ($3))
        AND ($4::text[] IS NULL OR caja = ANY ($4))
        AND ($5::text[] IS NULL OR ruta = ANY ($5))
        AND (created_at IS NULL OR (($6::timestamptz IS NULL OR created_at >= $6) AND ($7::timestamptz IS NULL OR created_at <= $7)))
    ),
    tot AS (
      SELECT count(*) AS total,
             coalesce(sum(monto_recibido), 0) AS sum_monto,
             coalesce(sum(aplicado_mora), 0) AS sum_mora,
             coalesce(sum(aplicado_interes), 0) AS sum_interes,
             coalesce(sum(aplicado_capital), 0) AS sum_capital
      FROM filt
    ),
    pagina AS (
      SELECT filt.*, row_number() OVER (ORDER BY $q$ || v_order || $q$) AS rn
      FROM filt ORDER BY $q$ || v_order || $q$ LIMIT $8 OFFSET $9
    ),
    filas AS (
      SELECT pg.rn, pg.id, p.prestamo_id, pg.created_at, p.anulado, p.cuota_id, p.caja_id, p.cobrador_id,
             to_jsonb(p.fecha_pago) #>> '{}' AS fecha_pago,
             pg.monto_recibido, pg.aplicado_mora, pg.aplicado_interes, pg.aplicado_capital,
             pg.metodo, pg.cliente, nullif(cl.telefono, '') AS cliente_telefono, pg.short_id, pg.caja, pg.ruta,
             coalesce(pr.num_cuotas, 0) AS num_cuotas
      FROM pagina pg
      JOIN pagos p ON p.id = pg.id
      LEFT JOIN prestamos pr ON pr.id = p.prestamo_id
      LEFT JOIN clientes cl ON cl.id = pr.cliente_id
    )
    SELECT jsonb_build_object(
      'total', tot.total,
      'sum_monto', tot.sum_monto,
      'sum_mora', tot.sum_mora,
      'sum_interes', tot.sum_interes,
      'sum_capital', tot.sum_capital,
      'empresa', (SELECT jsonb_build_object('nombre', e.nombre, 'telefono', e.telefono, 'direccion', e.direccion, 'logo_url', e.logo_url)
                  FROM empresas e WHERE e.id = $1),
      'rows', coalesce((SELECT jsonb_agg(to_jsonb(filas) - 'rn' ORDER BY filas.rn) FROM filas), '[]'::jsonb)
    )
    FROM tot
  $q$;

  EXECUTE v_sql INTO v_result
    USING v_emp, v_q, v_metodos, v_cajas, v_rutas, v_desde, v_hasta, p_limit, greatest(coalesce(p_offset, 0), 0);
  RETURN v_result;
END;
$$;

-- ── Permisos ─────────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.dashboard_kpis(jsonb)',
    'public.prestamos_resumen(uuid[], date)',
    'public.caja_saldos(uuid[])',
    'public.cobros_equipo_total(uuid, timestamptz, timestamptz)',
    'public.estados_cuenta_clientes()',
    'public.rentabilidad_resumen()',
    'public.productividad_mora(date)',
    'public.clientes_ultima_visita()',
    'public.gestiones_resumen(uuid[])',
    'public.prestamos_por_ruta()',
    'public.pagos_listado(jsonb, integer, integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

ANALYZE public.pagos;
ANALYZE public.prestamos;
ANALYZE public.crm_gestiones;
