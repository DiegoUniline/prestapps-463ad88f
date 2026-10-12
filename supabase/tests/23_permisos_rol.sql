-- Permisos por rol en el servidor (tiene_permiso + guardas inyectadas en RPCs).
BEGIN;

SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.ok(public.tiene_permiso('prestamos', 'cancelar_prestamo'), 'admin: cancelar préstamo permitido por defecto');
SELECT tests.eq(public.rol_actual()::text, 'admin', 'rol_actual admin');

SELECT tests.as_user(tests.id('sup_a'));
SELECT tests.ok(public.tiene_permiso('pagos', 'agregar'), 'supervisor: registrar pagos por defecto');
SELECT tests.ok(NOT public.tiene_permiso('cajas', 'editar'), 'supervisor: sin cajas por defecto');
SELECT tests.throws(format($$SELECT public.transferir_caja(%L, %L, 1, 'x')$$, tests.id('caja_a1'), tests.id('caja_a2')),
                    '42501', '%permiso%', 'supervisor no puede transferir entre cajas');

SELECT tests.as_user(tests.id('cob_a'));
SELECT tests.ok(public.tiene_permiso('pagos', 'agregar'), 'cobrador: registrar pagos por defecto');
SELECT tests.ok(NOT public.tiene_permiso('prestamos', 'cancelar_prestamo'), 'cobrador: no cancela préstamos');
SELECT tests.throws(format($$SELECT public.cancelar_prestamo(%L, 'x')$$, tests.id('pre_a')),
                    '42501', '%permiso%', 'cobrador no puede cancelar préstamos');
SELECT tests.throws(format($$SELECT public.editar_prestamo(%L, '{}'::jsonb)$$, tests.id('pre_a')),
                    '42501', '%permiso%', 'cobrador no puede editar préstamos');

-- Una fila en role_permissions de la empresa sobrescribe el valor por defecto.
SELECT tests.as_postgres();
INSERT INTO public.role_permissions (empresa_id, role, module, action, allowed)
VALUES (tests.id('emp_a'), 'cobrador', 'prestamos', 'cancelar_prestamo', true),
       (tests.id('emp_a'), 'cobrador', 'pagos', 'agregar', false);
SELECT tests.as_user(tests.id('cob_a'));
SELECT tests.ok(public.tiene_permiso('prestamos', 'cancelar_prestamo'), 'override de empresa concede permiso');
SELECT tests.ok(NOT public.tiene_permiso('pagos', 'agregar'), 'override de empresa revoca permiso');

-- Otra empresa no hereda los overrides de A.
SELECT tests.as_user(tests.id('cob_b'));
SELECT tests.ok(NOT public.tiene_permiso('prestamos', 'cancelar_prestamo'), 'override no aplica a otra empresa');

SELECT tests.as_user(tests.id('super'));
SELECT tests.ok(public.tiene_permiso('cajas', 'editar'), 'super admin: todo permitido');

SELECT tests.as_service();
SELECT tests.ok(public.tiene_permiso('cajas', 'editar'), 'service_role: permitido');

-- saldo_actual de cajas no se puede escribir desde el cliente.
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.throws(format($$UPDATE public.cajas SET saldo_actual = 999999 WHERE id = %L$$, tests.id('caja_a1')),
                    '42501', '%solo cambia con movimientos%', 'cliente no puede escribir cajas.saldo_actual');
SELECT tests.lives(format($$UPDATE public.cajas SET nombre = nombre WHERE id = %L$$, tests.id('caja_a1')),
                   'cliente sí puede renombrar caja');
SELECT tests.lives(format($$INSERT INTO public.movimientos_caja (caja_id, empresa_id, tipo, monto, concepto) VALUES (%L, %L, 'entrada', 10, 'Depósito')$$,
                          tests.id('caja_a1'), tests.id('emp_a')),
                   'insertar movimiento como cliente sigue actualizando saldo por trigger');

ROLLBACK;
