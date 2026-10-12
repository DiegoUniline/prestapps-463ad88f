-- Paginación (20261013130000): humo (ejecutan sin error contra el esquema) + aislamiento de tenant.
-- Las aserciones no dependen de la forma exacta del JSON: buscan ids/nombres de la OTRA empresa en el texto.
BEGIN;

CREATE TEMP TABLE llamadas (n int, sql text);
INSERT INTO llamadas VALUES
  (1, $$SELECT to_jsonb(public.estados_cuenta_listado(NULL, 100, 0))$$),
  (2, $$SELECT to_jsonb(public.estados_cuenta_listado('cliente', 100, 0))$$),
  (3, $$SELECT to_jsonb(public.atendidos_semana('2026-09-01', '2026-09-30', NULL, NULL))$$),
  (4, $$SELECT to_jsonb(public.auditoria_listado(NULL, NULL, 100, 0))$$),
  (5, $$SELECT to_jsonb(public.auditoria_resumen())$$),
  (6, $$SELECT to_jsonb(public.crm_cartera_listado(NULL, 'todos', 100, 0))$$),
  (7, $$SELECT to_jsonb(public.renovacion_candidatos(100, 0))$$),
  (8, $$SELECT to_jsonb(public.mapa_puntos('todos', NULL, NULL, NULL, NULL, NULL, 500))$$),
  (9, $$SELECT to_jsonb(public.mapa_totales('todos', NULL))$$),
  (10, $$SELECT to_jsonb(public.lead_scoring_listado(NULL, NULL, '2026-10-12', 100, 0))$$),
  (11, $$SELECT to_jsonb(public.promesas_resumen())$$),
  (12, $$SELECT to_jsonb(public.gastos_listado(NULL, NULL, NULL, NULL, 100, 0))$$);

CREATE FUNCTION pg_temp.run(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
  EXECUTE p_sql INTO v;
  RETURN coalesce(v::text, 'null');
END $$;

CREATE TEMP TABLE patrones AS
SELECT 'A' AS emp, concat_ws('|', tests.id('cli_a'), tests.id('pre_a'), tests.id('caja_a1'), tests.id('pago_a1'), 'Cliente A', 'Caja A1') AS re
UNION ALL
SELECT 'B', concat_ws('|', tests.id('cli_b'), tests.id('pre_b'), tests.id('caja_b1'), tests.id('pago_b1'), 'Cliente B', 'Caja B1');
GRANT SELECT ON llamadas, patrones TO authenticated;

SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.lives(sql, 'ejecuta (admin A): ' || sql) FROM llamadas ORDER BY n;
SELECT tests.ok(pg_temp.run(sql) ~ 'Cliente A', 'control positivo, ve sus datos: ' || sql) FROM llamadas WHERE n IN (1, 6, 8) ORDER BY n;
SELECT tests.ok(pg_temp.run(sql) !~ (SELECT re FROM patrones WHERE emp = 'B'), 'sin datos de la empresa B: ' || sql) FROM llamadas ORDER BY n;

SELECT tests.as_user(tests.id('admin_b'));
SELECT tests.ok(pg_temp.run(sql) ~ 'Cliente B', 'control positivo (admin B): ' || sql) FROM llamadas WHERE n IN (1, 6, 8) ORDER BY n;
SELECT tests.ok(pg_temp.run(sql) !~ (SELECT re FROM patrones WHERE emp = 'A'), 'sin datos de la empresa A: ' || sql) FROM llamadas ORDER BY n;

-- Detalle de caja con una caja de otra empresa: vacío / sin datos.
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT count(*) FROM public.caja_kardex(tests.id('caja_b1'), 'todos', NULL, 100, 0)), 0::bigint,
                'caja_kardex: caja de otra empresa sin movimientos');
SELECT tests.eq((SELECT count(*) FROM public.caja_kardex_resumen(tests.id('caja_b1'))), 0::bigint,
                'caja_kardex_resumen: caja de otra empresa vacía');
SELECT tests.ok(coalesce(to_jsonb(public.caja_detalle_stats(tests.id('caja_b1'), '2026-10-12'))::text, '') !~ '5000|600',
                'caja_detalle_stats: no expone montos de la caja de otra empresa');
SELECT tests.ok(coalesce(to_jsonb(public.caja_flujo(tests.id('caja_b1')))::text, '') !~ '5000|600',
                'caja_flujo: no expone montos de la caja de otra empresa');
SELECT tests.ok(coalesce(to_jsonb(public.caja_fuentes_resumen(tests.id('caja_b1'), f))::text, '') !~ ((SELECT re FROM patrones WHERE emp = 'B') || '|5000|600'),
                'caja_fuentes_resumen(' || f || '): sin datos de la caja de otra empresa')
FROM unnest(ARRAY['pagos', 'prestamos', 'movimientos']) f;

-- Con la caja propia sí hay datos.
SELECT tests.ok((SELECT count(*) FROM public.caja_kardex(tests.id('caja_a1'), 'todos', NULL, 100, 0)) > 0, 'caja_kardex: caja propia con movimientos');
SELECT tests.lives(format('SELECT public.caja_detalle_stats(%L, %L)', tests.id('caja_a1'), '2026-10-12'), 'caja_detalle_stats: caja propia');
SELECT tests.lives(format('SELECT public.caja_flujo(%L)', tests.id('caja_a1')), 'caja_flujo: caja propia');

-- anon no puede ejecutarlas.
RESET ROLE;
SELECT tests.ok(NOT has_function_privilege('anon', p.oid, 'EXECUTE'), 'anon sin EXECUTE: ' || p.oid::regprocedure::text)
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('estados_cuenta_listado', 'atendidos_semana', 'auditoria_listado', 'auditoria_resumen', 'crm_cartera_listado',
                    'renovacion_candidatos', 'mapa_puntos', 'mapa_totales', 'lead_scoring_listado', 'promesas_resumen',
                    'gastos_listado', 'caja_kardex', 'caja_kardex_resumen', 'caja_detalle_stats', 'caja_flujo', 'caja_fuentes_resumen')
ORDER BY 1;
ROLLBACK;
