-- editar_prestamo con fecha_siguiente_pago (20261026130000): recorre la primera cuota pendiente y las siguientes.
-- Fixture pre_a: cuotas 1..4 al 2026-09-08, 09-15, 10-20, 10-27, todas con saldo.
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.lives(format($$SELECT public.editar_prestamo(%L, '{"fecha_siguiente_pago": "2026-11-02"}'::jsonb)$$, tests.id('pre_a')),
                   'editar_prestamo acepta fecha_siguiente_pago');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT string_agg(fecha_vencimiento::text, ',' ORDER BY num_cuota) FROM public.amortizacion WHERE prestamo_id = tests.id('pre_a')),
                '2026-11-02,2026-11-09,2026-12-14,2026-12-21', 'todas las cuotas se recorren los mismos días (+55)');
SELECT tests.eq((SELECT fecha_primer_pago FROM public.prestamos WHERE id = tests.id('pre_a')), '2026-11-02'::date,
                'si la primera pendiente es la cuota 1, cambia fecha_primer_pago');
SELECT tests.eq((SELECT count(*) FROM public._mock_rebuild_log WHERE prestamo_id = tests.id('pre_a')), 1::bigint, 'reconstruye la amortización');
ROLLBACK;

-- Con la cuota 1 pagada solo se recorren de la 2 en adelante.
BEGIN;
SELECT tests.as_postgres();
UPDATE public.amortizacion SET saldo_total = 0, status = 'Pagada' WHERE id = tests.id('cuota_a1');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.lives(format($$SELECT public.editar_prestamo(%L, '{"fecha_siguiente_pago": "2026-09-10"}'::jsonb)$$, tests.id('pre_a')),
                   'mover la siguiente cuota hacia atrás');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT string_agg(fecha_vencimiento::text, ',' ORDER BY num_cuota) FROM public.amortizacion WHERE prestamo_id = tests.id('pre_a')),
                '2026-09-08,2026-09-10,2026-10-15,2026-10-22', 'la cuota pagada no se mueve; las demás -5 días');
SELECT tests.eq((SELECT fecha_primer_pago IS DISTINCT FROM '2026-09-10'::date FROM public.prestamos WHERE id = tests.id('pre_a')), true,
                'fecha_primer_pago no cambia si la cuota 1 ya estaba pagada');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.throws(format($$SELECT public.editar_prestamo(%L, '{"fecha_siguiente_pago": "2000-01-01"}'::jsonb)$$, tests.id('pre_a')),
                    'P0001', '%anterior al registro%', 'no acepta fechas anteriores al registro');
ROLLBACK;

-- Sin cuotas pendientes
BEGIN;
SELECT tests.as_postgres();
UPDATE public.amortizacion SET saldo_total = 0 WHERE prestamo_id = tests.id('pre_a');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.throws(format($$SELECT public.editar_prestamo(%L, '{"fecha_siguiente_pago": "2026-11-02"}'::jsonb)$$, tests.id('pre_a')),
                    'P0001', '%no tiene cuotas pendientes%', 'préstamo liquidado: error claro');
ROLLBACK;
