-- Guardas de tenant inyectadas por 20261012140000 en RPCs de prod (registrar_pago, revertir_pago, …).
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));

CREATE FUNCTION pg_temp.rp(p_prestamo uuid, p_empresa uuid, p_caja uuid, p_cobrador uuid, p_registrado uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT format($q$SELECT public.registrar_pago(%L, %L, %L, %L, NULL, %L, 10, 'Efectivo', '2026-10-12')$q$,
                p_prestamo, p_empresa, p_caja, p_cobrador, p_registrado)
$$;

SELECT tests.throws(pg_temp.rp(tests.id('pre_a'), tests.id('emp_b'), tests.id('caja_a1'), tests.id('cob_a'), tests.id('admin_a')),
                    '42501', 'No autorizado: empresa', 'registrar_pago: p_empresa_id de otra empresa');
SELECT tests.throws(pg_temp.rp(tests.id('pre_b'), tests.id('emp_a'), tests.id('caja_a1'), tests.id('cob_a'), tests.id('admin_a')),
                    '42501', 'No autorizado: préstamo', 'registrar_pago: préstamo de otra empresa');
SELECT tests.throws(pg_temp.rp(tests.id('pre_a'), tests.id('emp_a'), tests.id('caja_b1'), tests.id('cob_a'), tests.id('admin_a')),
                    '42501', 'No autorizado: caja', 'registrar_pago: caja de otra empresa');
SELECT tests.throws(pg_temp.rp(tests.id('pre_a'), tests.id('emp_a'), tests.id('caja_a1'), tests.id('cob_b'), tests.id('admin_a')),
                    '42501', 'No autorizado: cobrador', 'registrar_pago: cobrador de otra empresa');
SELECT tests.throws(pg_temp.rp(tests.id('pre_a'), tests.id('emp_a'), tests.id('caja_a1'), tests.id('cob_a'), tests.id('sup_a')),
                    '42501', 'No autorizado: usuario', 'registrar_pago: registrado_por de otro usuario');
SELECT tests.lives(pg_temp.rp(tests.id('pre_a'), tests.id('emp_a'), tests.id('caja_a1'), tests.id('cob_a'), tests.id('admin_a')),
                   'registrar_pago: llamada válida de la propia empresa');
SELECT tests.lives(pg_temp.rp(tests.id('pre_a'), tests.id('emp_a'), tests.id('caja_a1'), tests.id('cobx_a'), NULL),
                   'registrar_pago: cobrador de la tabla cobradores y registrado_por nulo');

SELECT tests.as_service();
SELECT tests.lives(pg_temp.rp(tests.id('pre_b'), tests.id('emp_b'), tests.id('caja_b1'), tests.id('cob_b'), NULL),
                   'registrar_pago: service_role (sin auth.uid) pasa la guarda');
SELECT tests.as_user(tests.id('super'));
SELECT tests.lives(pg_temp.rp(tests.id('pre_b'), tests.id('emp_b'), tests.id('caja_b1'), tests.id('cob_b'), tests.id('super')),
                   'registrar_pago: super admin pasa la guarda');

SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.throws(format($$SELECT public.revertir_pago(%L, 'x')$$, tests.id('pago_b1')), '42501', 'No autorizado: pago',
                    'revertir_pago: pago de otra empresa');
SELECT tests.throws(format($$SELECT public.revertir_pago(%L, 'x', %L)$$, tests.id('pago_a1'), tests.id('sup_a')), '42501', 'No autorizado: usuario',
                    'revertir_pago: p_user_id de otro usuario');
SELECT tests.lives(format($$SELECT public.revertir_pago(%L, 'x', %L)$$, tests.id('pago_a1'), tests.id('admin_a')), 'revertir_pago: pago propio');
SELECT tests.throws(format('SELECT public.rebuild_amortizacion(%L)', tests.id('pre_b')), '42501', 'No autorizado: préstamo',
                    'rebuild_amortizacion: préstamo de otra empresa');
SELECT tests.throws(format('SELECT public.recalcular_mora(%L)', tests.id('pre_b')), '42501', NULL, 'recalcular_mora: préstamo de otra empresa');
SELECT tests.throws(format('SELECT public.recalcular_mora_empresa(%L)', tests.id('emp_b')), '42501', NULL, 'recalcular_mora_empresa: otra empresa');
SELECT tests.lives(format('SELECT public.recalcular_mora_empresa(%L)', tests.id('emp_a')), 'recalcular_mora_empresa: empresa propia');
SELECT tests.throws(format($$SELECT public.next_folio(%L, 'recibo')$$, tests.id('emp_b')), '42501', NULL, 'next_folio: otra empresa');
SELECT tests.eq(public.next_folio(tests.id('emp_a'), 'recibo'), 'REC-0001', 'next_folio: empresa propia');
SELECT tests.throws(format($$SELECT public.notif_emit_admins(%L, 't', 'x', 'y', NULL)$$, tests.id('emp_b')), '42501', NULL,
                    'notif_emit_admins: otra empresa');
SELECT tests.throws(format('SELECT public.actualizar_estados_prestamos(%L)', tests.id('emp_b')), '42501', NULL,
                    'actualizar_estados_prestamos: otra empresa');
SELECT tests.throws(format('SELECT public.switch_empresa(%L)', tests.id('emp_b')), '42501', 'No autorizado', 'switch_empresa: usuario normal no cambia de empresa');
SELECT tests.eq(public.get_user_empresa_id(), tests.id('emp_a'), 'el usuario sigue en su empresa');

SELECT tests.as_user(tests.id('super'));
SELECT tests.lives(format('SELECT public.switch_empresa(%L)', tests.id('emp_b')), 'switch_empresa: super admin cambia de empresa');
SELECT tests.eq(public.get_user_empresa_id(), tests.id('emp_b'), 'get_user_empresa_id = empresa que el super admin está viendo');
SELECT tests.eq((public.dashboard_kpis('{}'::jsonb) -> 'prestamos' ->> 'total')::int, 1, 'super admin ve los datos de la empresa B');
SELECT tests.throws(format('SELECT public.transferir_caja(%L, %L, 1)', tests.id('caja_a1'), tests.id('caja_a2')),
                    '42501', NULL, 'tras cambiar a B, las cajas de A son de "otra empresa" para las RPCs nuevas');
ROLLBACK;
