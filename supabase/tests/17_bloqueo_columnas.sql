-- Bloqueo de columnas de dinero (20261013120000 §6): el cliente solo actualiza la lista blanca.
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));

-- amortizacion: solo "avisado".
SELECT tests.throws(format('UPDATE public.amortizacion SET saldo_total = 0 WHERE id = %L', tests.id('cuota_a1')),
                    '42501', NULL, 'authenticated no puede actualizar amortizacion.saldo_total');
SELECT tests.throws(format('UPDATE public.amortizacion SET saldo_mora = 0, descuento_mora = 20 WHERE id = %L', tests.id('cuota_a1')),
                    '42501', NULL, 'authenticated no puede fijar descuento_mora');
SELECT tests.throws(format($$UPDATE public.amortizacion SET status = 'Pagada' WHERE id = %L$$, tests.id('cuota_a1')),
                    '42501', NULL, 'authenticated no puede marcar una cuota como Pagada');
SELECT tests.eq(tests.rowcount(format('UPDATE public.amortizacion SET avisado = true WHERE id = %L', tests.id('cuota_a1'))), 1::bigint,
                'authenticated sí puede marcar avisado');
SELECT tests.eq(tests.rowcount(format('UPDATE public.amortizacion SET avisado = true WHERE id = %L', tests.id('cuota_b1'))), 0::bigint,
                'avisado de otra empresa: 0 filas (RLS)');
SELECT tests.throws(format($$INSERT INTO public.amortizacion (prestamo_id, empresa_id, num_cuota, fecha_vencimiento) VALUES (%L, %L, 9, '2026-12-01')$$,
                           tests.id('pre_a'), tests.id('emp_a')),
                    '42501', NULL, 'authenticated no puede insertar cuotas');
SELECT tests.throws(format('DELETE FROM public.amortizacion WHERE id = %L', tests.id('cuota_a4')),
                    '42501', NULL, 'authenticated no puede borrar cuotas');

-- pagos: nada.
SELECT tests.throws(format('UPDATE public.pagos SET monto_recibido = 1 WHERE id = %L', tests.id('pago_a1')),
                    '42501', NULL, 'authenticated no puede cambiar pagos.monto_recibido');
SELECT tests.throws(format('UPDATE public.pagos SET anulado = true WHERE id = %L', tests.id('pago_a1')),
                    '42501', NULL, 'authenticated no puede anular pagos directamente');
SELECT tests.throws(format($$INSERT INTO public.pagos (prestamo_id, empresa_id, monto_recibido) VALUES (%L, %L, 1)$$, tests.id('pre_a'), tests.id('emp_a')),
                    '42501', NULL, 'authenticated no puede insertar pagos directamente');
SELECT tests.throws(format('DELETE FROM public.pagos WHERE id = %L', tests.id('pago_a1')),
                    '42501', NULL, 'authenticated no puede borrar pagos');

-- prestamos: ruta_id, cobrador_id, cobro_automatico_stripe.
SELECT tests.eq(tests.rowcount(format('UPDATE public.prestamos SET ruta_id = %L, cobrador_id = %L, cobro_automatico_stripe = true WHERE id = %L',
                                      tests.id('ruta_a'), tests.id('sup_a'), tests.id('pre_a'))), 1::bigint,
                'authenticated puede reasignar ruta/cobrador y cobro automático');
SELECT tests.throws(format('UPDATE public.prestamos SET monto_solicitado = 1 WHERE id = %L', tests.id('pre_a')),
                    '42501', NULL, 'authenticated no puede cambiar prestamos.monto_solicitado');
SELECT tests.throws(format($$UPDATE public.prestamos SET estado = 'Liquidado' WHERE id = %L$$, tests.id('pre_a')),
                    '42501', NULL, 'authenticated no puede cambiar prestamos.estado');
SELECT tests.throws(format($$INSERT INTO public.prestamos (cliente_id, empresa_id, monto_solicitado, num_cuotas, modalidad) VALUES (%L, %L, 1, 1, 'fijo')$$,
                           tests.id('cli_a'), tests.id('emp_a')),
                    '42501', NULL, 'authenticated no puede insertar préstamos directamente');

SELECT tests.as_postgres();
SELECT tests.ok(NOT has_column_privilege('anon', 'public.amortizacion', 'avisado', 'UPDATE'), 'anon tampoco puede actualizar avisado');
SELECT tests.ok(has_table_privilege('service_role', 'public.pagos', 'INSERT'), 'service_role conserva escritura sobre pagos');
ROLLBACK;
