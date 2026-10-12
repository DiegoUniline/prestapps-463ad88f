-- Monitoreo propio: errores del navegador (client_errors) + RPCs de diagnóstico solo para super admin.

-- 1) Tabla de errores de cliente (sin acceso directo para usuarios; solo vía RPC)
CREATE TABLE IF NOT EXISTS public.client_errors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  empresa_id uuid,
  user_id uuid,
  mensaje text NOT NULL,
  stack text,
  url text,
  user_agent text,
  version text,
  extra jsonb
);

CREATE INDEX IF NOT EXISTS idx_client_errors_created ON public.client_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_user_created ON public.client_errors (user_id, created_at DESC);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.client_errors FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.client_errors TO service_role;

-- 2) Registro de errores. Límite: 30/hora por usuario, 60/hora para anónimos (login/registro),
--    3000/hora global. Lo que excede se descarta en silencio. Retención 30 días (limpieza en ~1% de llamadas).
CREATE OR REPLACE FUNCTION public.log_client_error(
  p_mensaje text,
  p_stack text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_version text DEFAULT NULL,
  p_extra jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa uuid;
  v_limite int := CASE WHEN v_uid IS NULL THEN 60 ELSE 30 END;
  v_n int;
  v_extra jsonb := p_extra;
BEGIN
  IF p_mensaje IS NULL OR btrim(p_mensaje) = '' THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('client_errors:' || coalesce(v_uid::text, 'anon')));

  IF v_uid IS NULL THEN
    SELECT count(*) INTO v_n FROM (
      SELECT 1 FROM client_errors
      WHERE user_id IS NULL AND created_at > now() - interval '1 hour' LIMIT v_limite
    ) s;
  ELSE
    SELECT count(*) INTO v_n FROM (
      SELECT 1 FROM client_errors
      WHERE user_id = v_uid AND created_at > now() - interval '1 hour' LIMIT v_limite
    ) s;
  END IF;
  IF v_n >= v_limite THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM client_errors WHERE created_at > now() - interval '1 hour' LIMIT 3000
  ) s;
  IF v_n >= 3000 THEN
    RETURN;
  END IF;

  IF v_uid IS NOT NULL THEN
    v_empresa := get_user_empresa_id();
  END IF;

  IF v_extra IS NOT NULL AND (jsonb_typeof(v_extra) <> 'object' OR length(v_extra::text) > 4000) THEN
    v_extra := jsonb_build_object('truncado', left(v_extra::text, 4000));
  END IF;

  INSERT INTO client_errors (empresa_id, user_id, mensaje, stack, url, user_agent, version, extra)
  VALUES (
    v_empresa,
    v_uid,
    left(p_mensaje, 1000),
    left(p_stack, CASE WHEN v_uid IS NULL THEN 2000 ELSE 8000 END),
    left(split_part(split_part(p_url, '#', 1), '?', 1), 500),
    left(p_user_agent, 400),
    left(p_version, 100),
    v_extra
  );

  IF random() < 0.01 THEN
    DELETE FROM client_errors WHERE created_at < now() - interval '30 days';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.log_client_error(text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, text, text, text, jsonb) TO anon, authenticated, service_role;

-- 3) Errores de cliente: agrupados por mensaje normalizado + lista cruda paginada (solo super admin)
CREATE OR REPLACE FUNCTION public.admin_client_errors(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_desde timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desde timestamptz := coalesce(p_desde, now() - interval '7 days');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    SELECT ce.*,
           regexp_replace(
             regexp_replace(ce.mensaje, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'),
             '[0-9]+', 'N', 'g') AS clave
    FROM client_errors ce
    WHERE ce.created_at >= v_desde
  ),
  grupos AS (
    SELECT clave,
           count(*) AS conteo,
           count(DISTINCT user_id) AS usuarios,
           count(DISTINCT empresa_id) AS empresas,
           min(created_at) AS primero,
           max(created_at) AS ultimo
    FROM base
    GROUP BY clave
    ORDER BY max(created_at) DESC
    LIMIT v_limit
  ),
  grupos_json AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'clave', g.clave,
             'conteo', g.conteo,
             'usuarios', g.usuarios,
             'empresas', g.empresas,
             'primero', g.primero,
             'ultimo', g.ultimo,
             'mensaje', u.mensaje,
             'stack', u.stack,
             'url', u.url,
             'version', u.version,
             'empresa_nombre', e.nombre
           ) ORDER BY g.ultimo DESC), '[]'::jsonb) AS j
    FROM grupos g
    CROSS JOIN LATERAL (
      SELECT b.mensaje, b.stack, b.url, b.version, b.empresa_id
      FROM base b WHERE b.clave = g.clave
      ORDER BY b.created_at DESC, b.id DESC LIMIT 1
    ) u
    LEFT JOIN empresas e ON e.id = u.empresa_id
  ),
  recientes AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id,
             'created_at', r.created_at,
             'empresa_id', r.empresa_id,
             'empresa_nombre', e.nombre,
             'user_id', r.user_id,
             'mensaje', r.mensaje,
             'stack', r.stack,
             'url', r.url,
             'user_agent', r.user_agent,
             'version', r.version,
             'extra', r.extra
           ) ORDER BY r.created_at DESC, r.id DESC), '[]'::jsonb) AS j
    FROM (
      SELECT * FROM base ORDER BY created_at DESC, id DESC LIMIT v_limit OFFSET v_offset
    ) r
    LEFT JOIN empresas e ON e.id = r.empresa_id
  )
  SELECT jsonb_build_object(
           'desde', v_desde,
           'total', (SELECT count(*) FROM base),
           'total_24h', (SELECT count(*) FROM base WHERE created_at > now() - interval '24 hours'),
           'grupos', (SELECT j FROM grupos_json),
           'recientes', (SELECT j FROM recientes)
         )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_client_errors(int, int, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_client_errors(int, int, timestamptz) TO authenticated;

-- 4) Consultas más costosas desde pg_stat_statements (vacío si la extensión no está disponible)
CREATE OR REPLACE FUNCTION public.admin_slow_queries(p_limit int DEFAULT 20)
RETURNS TABLE (calls bigint, total_ms numeric, mean_ms numeric, filas bigint, query text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rel regclass := coalesce(to_regclass('extensions.pg_stat_statements'), to_regclass('public.pg_stat_statements'));
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF v_rel IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    RETURN QUERY EXECUTE format(
      'SELECT s.calls::bigint,
              round(s.total_exec_time::numeric, 2),
              round(s.mean_exec_time::numeric, 2),
              s.rows::bigint,
              left(s.query, 1000)
       FROM %s s
       WHERE s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
         AND s.query !~* ''pg_stat_statements|^\s*(begin|commit|rollback|set |show |deallocate|discard)''
       ORDER BY s.total_exec_time DESC
       LIMIT $1', v_rel)
    USING least(greatest(coalesce(p_limit, 20), 1), 200);
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_slow_queries(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_slow_queries(int) TO authenticated;

-- 5) Estadísticas de tablas del esquema public
CREATE OR REPLACE FUNCTION public.admin_table_stats()
RETURNS TABLE (
  tabla text, filas bigint, filas_muertas bigint, seq_scan bigint, idx_scan bigint,
  tamano_bytes bigint, ultimo_vacuum timestamptz, ultimo_analyze timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.relname::text,
         s.n_live_tup::bigint,
         s.n_dead_tup::bigint,
         coalesce(s.seq_scan, 0)::bigint,
         coalesce(s.idx_scan, 0)::bigint,
         pg_total_relation_size(s.relid)::bigint,
         greatest(s.last_vacuum, s.last_autovacuum),
         greatest(s.last_analyze, s.last_autoanalyze)
  FROM pg_stat_user_tables s
  WHERE s.schemaname = 'public'
  ORDER BY pg_total_relation_size(s.relid) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_table_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_table_stats() TO authenticated;

-- 6) Resumen por empresa calculado en SQL (antes la página descargaba todos los préstamos de todas las empresas)
CREATE OR REPLACE FUNCTION public.admin_tenant_summary()
RETURNS TABLE (
  empresa_id uuid, nombre text, activa boolean, plan text,
  prestamos_activos bigint, prestamos_total bigint,
  pagos_30d bigint, monto_pagos_30d numeric,
  usuarios bigint, usuarios_activos bigint,
  wa_activo boolean, wa_errores_24h bigint, wa_ultimo_envio timestamptz, wa_ultimo_estado text,
  stripe_conectado boolean, suscripcion_estado text,
  errores_cliente_24h bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH pr AS (
    SELECT p.empresa_id,
           count(*) FILTER (WHERE p.estado::text IN ('Activo', 'Vencido')) AS activos,
           count(*) AS total
    FROM prestamos p GROUP BY p.empresa_id
  ),
  pg AS (
    SELECT p.empresa_id, count(*) AS n, round(coalesce(sum(p.monto_recibido), 0)::numeric, 2) AS monto
    FROM pagos p
    WHERE p.fecha_pago >= current_date - 30 AND NOT coalesce(p.anulado, false)
    GROUP BY p.empresa_id
  ),
  us AS (
    SELECT pf.empresa_id, count(*) AS n, count(*) FILTER (WHERE pf.activo) AS activos
    FROM profiles pf GROUP BY pf.empresa_id
  ),
  wac AS (
    SELECT c.empresa_id, bool_or(c.activo) AS activo FROM whatsapp_config c GROUP BY c.empresa_id
  ),
  wal AS (
    SELECT l.empresa_id, count(*) FILTER (WHERE l.status = 'error') AS errores, max(l.created_at) AS ultimo
    FROM whatsapp_log l
    WHERE l.created_at >= now() - interval '24 hours'
    GROUP BY l.empresa_id
  ),
  wau AS (
    SELECT DISTINCT ON (l.empresa_id) l.empresa_id, l.status
    FROM whatsapp_log l
    WHERE l.created_at >= now() - interval '24 hours'
    ORDER BY l.empresa_id, l.created_at DESC
  ),
  st AS (
    SELECT s.empresa_id, bool_or(s.charges_enabled) AS ok FROM stripe_connect_accounts s GROUP BY s.empresa_id
  ),
  su AS (
    SELECT DISTINCT ON (s.empresa_id) s.empresa_id, s.estado
    FROM suscripciones s
    ORDER BY s.empresa_id, s.actualizado_en DESC NULLS LAST, s.creado_en DESC NULLS LAST
  ),
  ce AS (
    SELECT c.empresa_id, count(*) AS n
    FROM client_errors c
    WHERE c.created_at >= now() - interval '24 hours' AND c.empresa_id IS NOT NULL
    GROUP BY c.empresa_id
  )
  SELECT e.id, e.nombre::text, e.activa, e.plan::text,
         coalesce(pr.activos, 0), coalesce(pr.total, 0),
         coalesce(pg.n, 0), coalesce(pg.monto, 0),
         coalesce(us.n, 0), coalesce(us.activos, 0),
         coalesce(wac.activo, false), coalesce(wal.errores, 0), wal.ultimo, wau.status::text,
         coalesce(st.ok, false), su.estado::text,
         coalesce(ce.n, 0)
  FROM empresas e
  LEFT JOIN pr ON pr.empresa_id = e.id
  LEFT JOIN pg ON pg.empresa_id = e.id
  LEFT JOIN us ON us.empresa_id = e.id
  LEFT JOIN wac ON wac.empresa_id = e.id
  LEFT JOIN wal ON wal.empresa_id = e.id
  LEFT JOIN wau ON wau.empresa_id = e.id
  LEFT JOIN st ON st.empresa_id = e.id
  LEFT JOIN su ON su.empresa_id = e.id
  LEFT JOIN ce ON ce.empresa_id = e.id
  ORDER BY coalesce(wal.errores, 0) DESC, e.nombre;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_tenant_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_tenant_summary() TO authenticated;
