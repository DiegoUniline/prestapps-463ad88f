-- Permisos de ejecución, search_path y forma de las políticas tras aplicar las migraciones (dos veces).
BEGIN;

-- RPCs de negocio nuevas: anon NO, authenticated SÍ.
WITH f(firma) AS (VALUES
  ('public.transferir_caja(uuid, uuid, numeric, text)'),
  ('public.registrar_movimiento_caja(uuid, text, numeric, text)'),
  ('public.liquidar_ruta(uuid, uuid[], uuid, timestamptz, text, text)'),
  ('public.crear_prestamo(jsonb, jsonb, jsonb, uuid)'),
  ('public.cancelar_prestamo(uuid, text)'),
  ('public.reestructurar_prestamo(uuid, jsonb, jsonb, text)'),
  ('public.editar_pago(uuid, numeric, text, uuid, uuid)'),
  ('public.siguiente_id_cliente()'),
  ('public.registrar_pago_completo(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, date, double precision, double precision, jsonb, jsonb)'),
  ('public.liquidar_prestamo(uuid, uuid, text, numeric, numeric, uuid, uuid, date, double precision, double precision, numeric, text)'),
  ('public.registrar_promesa_pago(uuid, uuid, numeric, date, text)'),
  ('public.registrar_visita(uuid, uuid, text, text, uuid, numeric, date)'),
  ('public.editar_prestamo(uuid, jsonb)'),
  ('public.dashboard_kpis(jsonb)'),
  ('public.prestamos_resumen(uuid[], date)'),
  ('public.caja_saldos(uuid[])'),
  ('public.cobros_equipo_total(uuid, timestamptz, timestamptz)'),
  ('public.estados_cuenta_clientes()'),
  ('public.rentabilidad_resumen()'),
  ('public.productividad_mora(date)'),
  ('public.clientes_ultima_visita()'),
  ('public.gestiones_resumen(uuid[])'),
  ('public.prestamos_por_ruta()'),
  ('public.pagos_listado(jsonb, integer, integer)'),
  ('public.admin_client_errors(integer, integer, timestamptz)'),
  ('public.admin_slow_queries(integer)'),
  ('public.admin_table_stats()'),
  ('public.admin_tenant_summary()'),
  ('public.registrar_pago(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, date, numeric, numeric, jsonb)'),
  ('public.revertir_pago(uuid, text, uuid)'),
  ('public.switch_empresa(uuid)')
)
SELECT tests.ok(NOT has_function_privilege('anon', firma, 'EXECUTE')
                AND has_function_privilege('authenticated', firma, 'EXECUTE'),
                'anon sin EXECUTE / authenticated con EXECUTE: ' || firma)
FROM f;

-- Internas: ni anon ni authenticated.
WITH f(firma) AS (VALUES
  ('public._integ_empresa()'),
  ('public._integ_lock_caja(uuid, uuid)'),
  ('public._integ_check_saldo(public.cajas, numeric)'),
  ('public._integ_ajustar_efectivo(uuid, uuid, numeric)'),
  ('public._integ_insert_jsonb(text, jsonb)'),
  ('public._integ_insert_cuotas(uuid, uuid, jsonb)'),
  ('public._integ_validar_refs_prestamo(jsonb, uuid)'),
  ('public._pagos_registrar_pago(uuid, uuid, uuid, uuid, uuid, numeric, text, date, double precision, double precision, jsonb)'),
  ('public._pagos_promesa(uuid, uuid, uuid, numeric, date, text)'),
  ('public.trg_user_roles_empresa()'),
  ('public.trg_profiles_roles_empresa()')
)
SELECT tests.ok(NOT has_function_privilege('anon', firma, 'EXECUTE')
                AND NOT has_function_privilege('authenticated', firma, 'EXECUTE'),
                'interna sin EXECUTE para anon/authenticated: ' || firma)
FROM f;

-- Solo service_role.
WITH f(firma) AS (VALUES
  ('public.cron_claim(text, integer)'),
  ('public.whatsapp_cola_claim(integer, uuid)'),
  ('public.whatsapp_cola_resultado(uuid, boolean, text, boolean)'),
  ('public.whatsapp_cola_liberar(uuid[])'),
  ('public.buro_mover_creditos(uuid, integer, text, uuid, text, uuid)')
)
SELECT tests.ok(NOT has_function_privilege('anon', firma, 'EXECUTE')
                AND NOT has_function_privilege('authenticated', firma, 'EXECUTE')
                AND has_function_privilege('service_role', firma, 'EXECUTE'),
                'solo service_role: ' || firma)
FROM f;

SELECT tests.ok(has_function_privilege('anon', 'public.log_client_error(text, text, text, text, text, jsonb)', 'EXECUTE'),
                'anon puede registrar errores de cliente (log_client_error)');

-- Ninguna SECURITY DEFINER de public ejecutable por anon salvo helpers de RLS / hooks / log_client_error.
SELECT tests.eq(
  (SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1)
     FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname NOT IN ('get_user_empresa_id', 'has_role', 'is_super_admin', 'log_client_error')
      AND p.proname NOT ILIKE '%hook%'),
  NULL, 'ninguna otra SECURITY DEFINER ejecutable por anon');

-- Funciones nuevas (creadas por las migraciones) ejecutables por anon: solo log_client_error
-- y helpers puros IMMUTABLE sin acceso a tablas.
SELECT tests.eq(
  (SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1)
     FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.oid::regprocedure::text NOT IN (SELECT firma FROM tests.funciones_mock)
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.provolatile <> 'i'
      AND p.proname NOT IN ('log_client_error', 'is_super_admin')),
  NULL, 'funciones nuevas no IMMUTABLE ejecutables por anon: ninguna (salvo log_client_error / is_super_admin)');

-- search_path fijo en toda SECURITY DEFINER de public.
SELECT tests.eq(
  (SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1)
     FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')),
  NULL, 'toda SECURITY DEFINER de public tiene search_path fijo');

-- Guarda de tenant inyectada exactamente una vez (dos pasadas de migraciones).
SELECT tests.eq(
  (length(prosrc) - length(replace(prosrc, '/*tenant_guard*/', ''))) / length('/*tenant_guard*/'),
  1, 'guarda de tenant inyectada una sola vez en ' || proname)
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('registrar_pago', 'revertir_pago', 'rebuild_amortizacion', 'recalcular_mora',
                  'recalcular_mora_empresa', 'next_folio', 'notif_emit_admins', 'switch_empresa',
                  'actualizar_estados_prestamos')
ORDER BY proname;

-- RLS initplan: ninguna política con get_user_empresa_id()/auth.uid() sin envolver en SELECT.
SELECT tests.eq(
  (SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY 1)
     FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(^|[^T] )get_user_empresa_id\(\)|[(=] *get_user_empresa_id\(\)'),
  NULL, 'políticas con get_user_empresa_id() envuelto en (SELECT ...)');

-- Llamadas reales como anon: permiso denegado.
SELECT tests.as_anon();
SELECT tests.throws($$SELECT public.transferir_caja(gen_random_uuid(), gen_random_uuid(), 1, 'x')$$, '42501', NULL,
                    'anon no puede ejecutar transferir_caja');
SELECT tests.throws($$SELECT public.crear_prestamo('{}', '[]')$$, '42501', NULL, 'anon no puede ejecutar crear_prestamo');
SELECT tests.throws($$SELECT public.dashboard_kpis('{}')$$, '42501', NULL, 'anon no puede ejecutar dashboard_kpis');
SELECT tests.throws($$SELECT public.pagos_listado('{}')$$, '42501', NULL, 'anon no puede ejecutar pagos_listado');
SELECT tests.throws($$SELECT public.registrar_pago_completo(gen_random_uuid(), NULL, NULL, NULL, NULL, NULL, 1, 'Efectivo', current_date)$$,
                    '42501', NULL, 'anon no puede ejecutar registrar_pago_completo');
SELECT tests.throws($$SELECT public.registrar_pago(gen_random_uuid(), gen_random_uuid(), NULL, NULL, NULL, NULL, 1, 'Efectivo', current_date)$$,
                    '42501', NULL, 'anon no puede ejecutar registrar_pago');
SELECT tests.throws($$SELECT public.admin_tenant_summary()$$, '42501', NULL, 'anon no puede ejecutar admin_tenant_summary');
SELECT tests.throws($$SELECT * FROM public.whatsapp_cola$$, '42501', NULL, 'anon no puede leer whatsapp_cola');
SELECT tests.throws($$SELECT * FROM public.client_errors$$, '42501', NULL, 'anon no puede leer client_errors');

-- authenticated sin acceso a tablas internas.
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.throws($$SELECT * FROM public.cron_runs$$, '42501', NULL, 'authenticated no puede leer cron_runs');
SELECT tests.throws($$SELECT * FROM public.stripe_events$$, '42501', NULL, 'authenticated no puede leer stripe_events');
SELECT tests.throws($$SELECT * FROM public.client_errors$$, '42501', NULL, 'authenticated no puede leer client_errors');
SELECT tests.throws($$SELECT public._integ_empresa()$$, '42501', NULL, 'authenticated no puede ejecutar _integ_empresa');
SELECT tests.throws($$SELECT public.cron_claim('x', 1)$$, '42501', NULL, 'authenticated no puede ejecutar cron_claim');

-- Políticas reemplazadas por 20261012140000.
SELECT tests.as_postgres();
INSERT INTO public.cajas (id, empresa_id, nombre) VALUES ('00000000-0000-0000-0000-0000000000c1', tests.id('emp_a'), 'Caja temporal');
SELECT tests.as_user(tests.id('cob_a'));
SELECT tests.eq(tests.rowcount($$DELETE FROM public.cajas WHERE id = '00000000-0000-0000-0000-0000000000c1'$$), 0::bigint,
                'cobrador no puede borrar cajas (auth_delete_cajas)');
SELECT tests.throws(format($$INSERT INTO public.notificaciones (empresa_id, user_id, titulo) VALUES (%L, %L, 'x')$$,
                           tests.id('emp_a'), tests.id('admin_b')),
                    '42501', NULL, 'no se pueden crear notificaciones para usuarios de otra empresa');
SELECT tests.lives(format($$INSERT INTO public.notificaciones (empresa_id, user_id, titulo) VALUES (%L, %L, 'x')$$,
                          tests.id('emp_a'), tests.id('admin_a')),
                   'sí se pueden crear notificaciones para usuarios de la misma empresa');
SELECT tests.throws(format($$INSERT INTO public.cat_cuotas (empresa_id, nombre) VALUES (%L, 'x')$$, tests.id('emp_a')),
                    '42501', NULL, 'cobrador no puede editar el catálogo de cuotas');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq(tests.rowcount($$DELETE FROM public.cajas WHERE id = '00000000-0000-0000-0000-0000000000c1'$$), 1::bigint,
                'admin sí puede borrar una caja de su empresa');
SELECT tests.eq(tests.rowcount(format('DELETE FROM public.cajas WHERE id = %L', tests.id('caja_b1'))), 0::bigint,
                'admin no puede borrar una caja de otra empresa');

ROLLBACK;
