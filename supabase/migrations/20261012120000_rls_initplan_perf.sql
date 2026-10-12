-- RLS: evaluar get_user_empresa_id() / has_role() / auth.uid() una sola vez por query (InitPlan)
-- en lugar de una vez por fila. Causa: 92M seq scans sobre profiles.

DO $$
BEGIN
  ALTER FUNCTION public.get_user_empresa_id() STABLE;
  ALTER FUNCTION public.has_role(uuid, public.app_role) STABLE;
EXCEPTION WHEN undefined_function OR undefined_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.wrap_rls(e text) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(e,
                 '(?<!SELECT )has_role\(auth\.uid\(\), (''[^'']+''::app_role)\)', '(SELECT has_role(auth.uid(), \1))', 'g'),
               '(?<!SELECT )get_user_empresa_id\(\)', '(SELECT get_user_empresa_id())', 'g'),
             '(?<!SELECT )(?<!has_role\()auth\.uid\(\)', '(SELECT auth.uid())', 'g'),
           '(?<!SELECT )auth\.jwt\(\)', '(SELECT auth.jwt())', 'g')
$f$;

DO $$
DECLARE
  r record;
  q text;
  c text;
  stmt text;
BEGIN
  FOR r IN SELECT tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' LOOP
    q := pg_temp.wrap_rls(r.qual);
    c := pg_temp.wrap_rls(r.with_check);
    IF q IS DISTINCT FROM r.qual OR c IS DISTINCT FROM r.with_check THEN
      stmt := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
      IF q IS NOT NULL THEN stmt := stmt || ' USING (' || q || ')'; END IF;
      IF c IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || c || ')'; END IF;
      EXECUTE stmt;
    END IF;
  END LOOP;
END $$;

-- Índices (no partial en anulado: PostgREST manda anulado=$2 y el plan genérico no usa el partial)
CREATE INDEX IF NOT EXISTS idx_amortizacion_prestamo_num      ON public.amortizacion (prestamo_id, num_cuota);
CREATE INDEX IF NOT EXISTS idx_amortizacion_empresa_id        ON public.amortizacion (empresa_id);
CREATE INDEX IF NOT EXISTS idx_amortizacion_empresa_fv        ON public.amortizacion (empresa_id, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_pagos_prestamo_anulado_fecha   ON public.pagos (prestamo_id, anulado, fecha_pago DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_empresa_anulado_fecha    ON public.pagos (empresa_id, anulado, fecha_pago);
CREATE INDEX IF NOT EXISTS idx_pagos_empresa_created          ON public.pagos (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_caja                     ON public.pagos (caja_id);
CREATE INDEX IF NOT EXISTS idx_prestamos_empresa_estado       ON public.prestamos (empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_caja_fecha    ON public.movimientos_caja (caja_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_empresa       ON public.movimientos_caja (empresa_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_prestamo      ON public.movimientos_caja (prestamo_id);
CREATE INDEX IF NOT EXISTS idx_cajas_empresa_nombre           ON public.cajas (empresa_id, nombre);
CREATE INDEX IF NOT EXISTS idx_rutas_empresa_nombre           ON public.rutas (empresa_id, nombre);
CREATE INDEX IF NOT EXISTS idx_profiles_empresa               ON public.profiles (empresa_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_empresa       ON public.role_permissions (empresa_id);
CREATE INDEX IF NOT EXISTS idx_promesas_pago_empresa          ON public.promesas_pago (empresa_id);
CREATE INDEX IF NOT EXISTS idx_promesas_pago_cuota            ON public.promesas_pago (cuota_id);
CREATE INDEX IF NOT EXISTS idx_crm_gestiones_empresa          ON public.crm_gestiones (empresa_id);
CREATE INDEX IF NOT EXISTS idx_crm_gestiones_prestamo         ON public.crm_gestiones (prestamo_id);
CREATE INDEX IF NOT EXISTS idx_cortes_empresa                 ON public.cortes (empresa_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_empresa_fecha     ON public.whatsapp_log (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_empresa         ON public.notificaciones (empresa_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_user            ON public.notificaciones (user_id);

ANALYZE public.profiles;
ANALYZE public.amortizacion;
ANALYZE public.pagos;
ANALYZE public.prestamos;
ANALYZE public.movimientos_caja;
ANALYZE public.cajas;
ANALYZE public.rutas;
ANALYZE public.clientes;
ANALYZE public.role_permissions;
ANALYZE public.empresas;
ANALYZE public.user_roles;
ANALYZE public.whatsapp_log;
