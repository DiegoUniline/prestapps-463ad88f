-- Seguridad de BD: RPCs SECURITY DEFINER sin acceso anónimo, search_path fijo,
-- validación de tenant dentro de RPCs existentes y políticas RLS corregidas.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(auth.jwt() ->> 'email', '') = 'diego.leon@uniline.mx'
$$;

-- 1) search_path fijo en todas las SECURITY DEFINER de public (incluye extensions para pgcrypto/uuid-ossp)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', f.sig);
  END LOOP;
END $$;

-- 2) Ningún RPC SECURITY DEFINER ejecutable por anon (excepto helpers usados en RLS y hooks de auth).
--    authenticated conserva EXECUTE solo si ya lo tenía.
DO $$
DECLARE
  f record;
  v_auth boolean;
BEGIN
  FOR f IN
    SELECT p.oid, p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.prokind = 'f'
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname NOT IN ('get_user_empresa_id', 'has_role', 'is_super_admin')
      AND p.proname NOT ILIKE '%hook%'
      AND NOT (p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype AND p.prorettype = 'jsonb'::regtype)
  LOOP
    v_auth := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    IF v_auth THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.sig);
    END IF;
  END LOOP;
END $$;

-- Funciones internas: solo service_role
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('buro_mover_creditos', 'cron_claim')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
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
