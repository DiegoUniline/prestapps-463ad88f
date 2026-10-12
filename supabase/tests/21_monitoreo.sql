-- Monitoreo (20261013140000): log_client_error con límites y RPCs admin_* solo para super admin.
BEGIN;

SELECT tests.as_user(tests.id('cob_a'));
SELECT public.log_client_error('Error ' || g, 'stack', 'https://app.test/pagos?token=secreto#x', 'UA', '1.0', '{"a": 1}')
FROM generate_series(1, 31) g \g /dev/null
SELECT public.log_client_error('   ') \g /dev/null
SELECT public.log_client_error('Extra raro', NULL, NULL, NULL, NULL, '[1, 2, 3]') \g /dev/null
SELECT tests.throws('SELECT * FROM public.client_errors', '42501', NULL, 'authenticated no puede leer client_errors');

SELECT tests.as_postgres();
SELECT tests.eq((SELECT count(*) FROM public.client_errors WHERE user_id = tests.id('cob_a')), 30::bigint,
                'log_client_error: máximo 30 por usuario por hora (31 + 1 llamadas → 30 filas)');
SELECT tests.eq((SELECT count(*) FROM public.client_errors WHERE mensaje = 'Extra raro'), 0::bigint, 'excedente descartado en silencio');
SELECT tests.eq((SELECT DISTINCT empresa_id FROM public.client_errors WHERE user_id = tests.id('cob_a')), tests.id('emp_a'),
                'empresa del usuario registrada');
SELECT tests.eq((SELECT DISTINCT url FROM public.client_errors WHERE user_id = tests.id('cob_a')), 'https://app.test/pagos',
                'url sin query string ni fragmento');
DELETE FROM public.client_errors WHERE user_id = tests.id('cob_a') AND mensaje = 'Error 1';
SELECT tests.as_user(tests.id('cob_a'));
SELECT public.log_client_error('Extra raro', NULL, NULL, NULL, NULL, '[1, 2, 3]') \g /dev/null
SELECT tests.as_postgres();
SELECT tests.eq((SELECT extra ? 'truncado' FROM public.client_errors WHERE mensaje = 'Extra raro'), true, 'extra no-objeto se guarda truncado');
SELECT tests.eq((SELECT count(*) FROM public.client_errors WHERE btrim(mensaje) = ''), 0::bigint, 'mensajes vacíos se ignoran');

-- Anónimos: 60/hora en total.
SELECT tests.as_anon();
SELECT public.log_client_error('Login falló ' || g, repeat('s', 5000)) FROM generate_series(1, 61) g \g /dev/null
SELECT tests.as_postgres();
SELECT tests.eq((SELECT count(*) FROM public.client_errors WHERE user_id IS NULL), 60::bigint, 'log_client_error: máximo 60 anónimos por hora');
SELECT tests.eq((SELECT max(length(stack)) FROM public.client_errors WHERE user_id IS NULL), 2000, 'stack anónimo truncado a 2000');
SELECT tests.eq((SELECT count(*) FROM public.client_errors WHERE user_id IS NULL AND empresa_id IS NOT NULL), 0::bigint, 'anónimos sin empresa');

-- Tope global 3000/hora.
INSERT INTO public.client_errors (user_id, mensaje) SELECT gen_random_uuid(), 'ruido' FROM generate_series(1, 3000);
SELECT tests.as_user(tests.id('admin_a'));
SELECT public.log_client_error('Después del tope') \g /dev/null
SELECT tests.as_postgres();
SELECT tests.eq((SELECT count(*) FROM public.client_errors WHERE mensaje = 'Después del tope'), 0::bigint, 'log_client_error: tope global 3000/hora');
ROLLBACK;

BEGIN;
SELECT tests.as_postgres();
INSERT INTO public.client_errors (empresa_id, user_id, mensaje) VALUES (tests.id('emp_a'), tests.id('cob_a'), 'Fallo 123 en ' || tests.id('pre_a')),
                                                                    (tests.id('emp_a'), tests.id('cob_a'), 'Fallo 456 en ' || tests.id('pre_b'));

-- admin_* rechazan a quien no es super admin (aunque sea admin de su empresa).
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.throws('SELECT public.admin_client_errors()', '42501', 'No autorizado', 'admin_client_errors rechaza a un admin normal');
SELECT tests.throws('SELECT * FROM public.admin_slow_queries()', '42501', 'No autorizado', 'admin_slow_queries rechaza a un admin normal');
SELECT tests.throws('SELECT * FROM public.admin_table_stats()', '42501', 'No autorizado', 'admin_table_stats rechaza a un admin normal');
SELECT tests.throws('SELECT * FROM public.admin_tenant_summary()', '42501', 'No autorizado', 'admin_tenant_summary rechaza a un admin normal');
SELECT tests.as_service();
SELECT tests.throws('SELECT * FROM public.admin_tenant_summary()', '42501', 'No autorizado', 'admin_tenant_summary rechaza service_role sin JWT de super admin');

SELECT tests.as_user(tests.id('super'));
SELECT tests.eq((SELECT format('%s/%s', j->>'total', jsonb_array_length(j->'grupos')) FROM (SELECT public.admin_client_errors() j) x), '2/1',
                'admin_client_errors (super admin): agrupa mensajes normalizando números e ids');
SELECT tests.lives('SELECT * FROM public.admin_slow_queries()', 'admin_slow_queries (super admin) sin pg_stat_statements no falla');
SELECT tests.ok((SELECT count(*) FROM public.admin_table_stats() WHERE tabla = 'pagos') = 1, 'admin_table_stats (super admin)');
SELECT tests.eq((SELECT format('%s/%s/%s', prestamos_total, usuarios, coalesce(suscripcion_estado, '-'))
                   FROM public.admin_tenant_summary() WHERE empresa_id = tests.id('emp_a')), '1/4/-',
                'admin_tenant_summary (super admin): todas las empresas');
SELECT tests.eq((SELECT count(*) FROM public.admin_tenant_summary()), 3::bigint, 'admin_tenant_summary: una fila por empresa');
ROLLBACK;
