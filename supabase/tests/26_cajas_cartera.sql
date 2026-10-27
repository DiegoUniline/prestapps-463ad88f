-- cajas_cartera_stats (20261027100000): cartera por caja calculada en el servidor.
-- Fixture pre_a (emp_a, caja_a1): monto 1000, total 1200; 4 cuotas de 250+50, cuota 1 vencida con saldo_mora 20.
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT public.cajas_cartera_stats()->'byCaja'->(tests.id('caja_a1')::text)),
  jsonb_build_object('activos', 1, 'colocado', 1000, 'totalPagar', 1220, 'porCobrar', 1220,
                     'gananciaProyectada', 220, 'enMora', 1, 'moraTotal', 20),
  'sin mora dinámica (valor_mora 0): por cobrar = saldos + saldo_mora');
SELECT tests.eq((SELECT (public.cajas_cartera_stats()->'global'->>'colocado')::numeric), 1000::numeric,
  'global solo incluye la empresa del usuario');
SELECT tests.eq((SELECT public.cajas_cartera_stats()->'byCaja' ? tests.id('caja_b1')::text), false,
  'no aparecen cajas de otra empresa');
ROLLBACK;

-- Mora dinámica: fijo 10/día, cuota 2 vencida hace 3 días sin mora guardada; las demás a futuro.
BEGIN;
SELECT tests.as_postgres();
UPDATE public.prestamos SET tipo_mora = 'fijo', valor_mora = 10 WHERE id = tests.id('pre_a');
UPDATE public.amortizacion SET fecha_vencimiento = current_date + 30 WHERE prestamo_id = tests.id('pre_a');
UPDATE public.amortizacion SET fecha_vencimiento = current_date - 3, saldo_mora = 0 WHERE id = tests.id('cuota_a2');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT (public.cajas_cartera_stats()->'byCaja'->(tests.id('caja_a1')::text)->>'moraTotal')::numeric), 50::numeric,
  'mora = 3 días × 10 de la cuota vencida + 20 guardados de la cuota 1');
SELECT tests.eq((SELECT (public.cajas_cartera_stats()->'byCaja'->(tests.id('caja_a1')::text)->>'porCobrar')::numeric), 1250::numeric,
  'por cobrar incluye la mora dinámica');
-- Préstamos cancelados no cuentan
SELECT tests.as_postgres();
UPDATE public.prestamos SET estado = 'Cancelado' WHERE id = tests.id('pre_a');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT public.cajas_cartera_stats()->'byCaja'), '{}'::jsonb, 'préstamos cancelados se excluyen');
ROLLBACK;
