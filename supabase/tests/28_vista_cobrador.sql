-- Vista del cobrador (20261027120000): cobranza del rango, resumen semanal y cartera.
-- Fixture pre_a (cob_a): cuota_a1 09-08 Vencida con pagos 300 + 150 (+200 anulado); cuota_a2 09-15 con pago 100.
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT string_agg((e->>'numCuota') || ':' || (e->>'montoPagado') || ':' || (e->>'cobradaEnRango'), ',')
                 FROM jsonb_array_elements(public.cobrador_cobranza('2026-09-14', '2026-09-20', tests.id('cob_a'))) e),
  '1:450:true,2:100:true', 'cobranza: vencida sin pagar + la del rango, con pagos directos no anulados');
SELECT tests.eq((SELECT e->>'clienteNombre' || '|' || (e->>'ruta') FROM jsonb_array_elements(public.cobrador_cobranza('2026-09-14', '2026-09-20', NULL)) e
                 WHERE e->>'numCuota' = '1'), 'Cliente A|Ruta A', 'sin cobrador: toda la empresa');
SELECT tests.eq((SELECT public.cobrador_resumen_semanal('2026-09-14', '2026-09-20', tests.id('cob_a'))),
  jsonb_build_object('total', 300, 'cobrado', 100), 'resumen: esperado de las cuotas que vencen en la semana y lo cobrado de ellas');
SELECT tests.eq((SELECT e->>'pagadas' || '|' || (e->>'saldo') || '|' || (e->>'mora') FROM jsonb_array_elements(public.cobrador_cartera(tests.id('cob_a'))) e),
  '0|1220|20', 'cartera: cuotas pagadas, saldo y mora del préstamo');
SELECT tests.as_user(tests.id('admin_b'));
SELECT tests.eq(public.cobrador_cartera(tests.id('cob_a')), '[]'::jsonb, 'otra empresa no ve la cartera');
SELECT tests.eq(public.cobrador_cobranza('2026-09-14', '2026-09-20', tests.id('cob_a')), '[]'::jsonb, 'otra empresa no ve la cobranza');
ROLLBACK;

-- Reparto: cuota pagada en el rango sin pago directo toma de los pagos del rango del préstamo.
BEGIN;
SELECT tests.as_postgres();
UPDATE public.amortizacion SET status = 'Pagada', fecha_pagada = '2026-09-16', capital_pagado = 250, interes_pagado = 50,
       saldo_total = 0 WHERE id = tests.id('cuota_a3');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT (e->>'montoPagado')::numeric FROM jsonb_array_elements(public.cobrador_cobranza('2026-09-14', '2026-09-20', tests.id('cob_a'))) e
                 WHERE e->>'numCuota' = '3'), 300::numeric, 'cuota 3: toma 300 (lo pagado) de los 550 del rango');
ROLLBACK;
