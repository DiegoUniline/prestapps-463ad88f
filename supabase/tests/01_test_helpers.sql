-- Helpers de prueba (sin pgTAP). Cada aserción devuelve una línea TAP:
--   "ok - descripción"  |  "not ok - descripción -- detalle"
-- run.sh cuenta esas líneas; cualquier "not ok" (o error de psql) hace fallar la suite.
-- Vive en el esquema "tests" para no interferir con los barridos de las migraciones sobre public.

SET client_min_messages = warning;

CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated, service_role;

-- Ids con nombre para los datos fijos (05_fixtures.sql).
CREATE TABLE tests.ids (nombre text PRIMARY KEY, id uuid NOT NULL);
GRANT SELECT ON tests.ids TO anon, authenticated, service_role;

CREATE FUNCTION tests.id(p_nombre text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE v uuid;
BEGIN
  SELECT id INTO v FROM tests.ids WHERE nombre = p_nombre;
  IF v IS NULL THEN RAISE EXCEPTION 'tests.id: nombre desconocido %', p_nombre; END IF;
  RETURN v;
END $$;

CREATE FUNCTION tests.ok(p_cond boolean, p_desc text, p_detalle text DEFAULT NULL) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN coalesce(p_cond, false) THEN 'ok - ' || p_desc
              ELSE 'not ok - ' || p_desc || coalesce(' -- ' || p_detalle, CASE WHEN p_cond IS NULL THEN ' -- condición NULL' ELSE '' END) END
$$;

CREATE FUNCTION tests.eq(p_got anyelement, p_exp anyelement, p_desc text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT tests.ok(p_got IS NOT DISTINCT FROM p_exp, p_desc,
                  format('obtenido: %s, esperado: %s', coalesce(p_got::text, 'NULL'), coalesce(p_exp::text, 'NULL')))
$$;

-- Ejecuta p_sql (con los privilegios del rol actual) y espera un error.
-- p_errcode / p_msg (ILIKE) son opcionales. Los efectos del intento se deshacen (subtransacción).
CREATE FUNCTION tests.throws(p_sql text, p_errcode text, p_msg text, p_desc text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
  v_msg text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    IF (p_errcode IS NULL OR v_state = p_errcode) AND (p_msg IS NULL OR v_msg ILIKE p_msg) THEN
      RETURN tests.ok(true, p_desc);
    END IF;
    RETURN tests.ok(false, p_desc, format('error inesperado [%s] %s (esperado [%s] %s)',
                                          v_state, v_msg, coalesce(p_errcode, '*'), coalesce(p_msg, '*')));
  END;
  RETURN tests.ok(false, p_desc, 'no lanzó error');
END $$;

-- Ejecuta p_sql y espera que NO falle (los efectos se conservan).
CREATE FUNCTION tests.lives(p_sql text, p_desc text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
  v_msg text;
BEGIN
  EXECUTE p_sql;
  RETURN tests.ok(true, p_desc);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  RETURN tests.ok(false, p_desc, format('[%s] %s', v_state, v_msg));
END $$;

-- Ejecuta un INSERT/UPDATE/DELETE con los privilegios del rol actual y devuelve las filas afectadas.
CREATE FUNCTION tests.rowcount(p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE FUNCTION tests.skip(p_desc text, p_motivo text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'ok - ' || p_desc || ' # SKIP ' || p_motivo $$;

CREATE FUNCTION tests._email(p_uid uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email FROM auth.users WHERE id = p_uid
$$;

-- Simula una petición de PostgREST con el JWT del usuario: claims + SET ROLE authenticated
-- (locales a la transacción; los archivos de prueba corren dentro de BEGIN ... ROLLBACK).
CREATE FUNCTION tests.as_user(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'email', tests._email(p_uid))::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE FUNCTION tests.as_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
  PERFORM set_config('role', 'anon', true);
END $$;

CREATE FUNCTION tests.as_service() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{"role": "service_role"}', true);
  PERFORM set_config('role', 'service_role', true);
END $$;

-- Vuelve al superusuario de la conexión (para preparar datos o inspeccionar sin RLS).
CREATE FUNCTION tests.as_postgres() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

-- Funciones existentes ANTES de aplicar migraciones (las nuevas = creadas por las migraciones).
CREATE TABLE tests.funciones_mock AS
  SELECT p.oid::regprocedure::text AS firma FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace;
GRANT SELECT ON tests.funciones_mock TO anon, authenticated, service_role;

-- dblink (contrib) para pruebas de concurrencia; opcional.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS dblink SCHEMA tests;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'dblink no disponible: se omiten las pruebas de concurrencia';
END $$;
