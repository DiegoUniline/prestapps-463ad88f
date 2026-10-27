-- cobranza_diaria (20261027110000): lista del día armada en el servidor.
-- Fixture pre_a: cuotas 09-08 (Vencida), 09-15, 10-20, 10-27; promesa de cuota_a2 para 10-01.
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT string_agg(e->>'numCuota', ',' ORDER BY ord) FROM jsonb_array_elements(public.cobranza_diaria('2026-10-20')) WITH ORDINALITY AS t(e, ord)),
  '1,2,3', '10-20: vencidas sin pagar + la que vence ese día; no la del 10-27');
SELECT tests.eq((SELECT e->>'clienteNombre' || '|' || (e->>'ruta') || '|' || (e->>'cobrador') || '|' || (e->>'tipoCuenta')
                 FROM jsonb_array_elements(public.cobranza_diaria('2026-10-20')) e WHERE e->>'numCuota' = '1'),
  'Cliente A|Ruta A|Cobrador A|prestamo', 'trae cliente, ruta, cobrador y tipo de cuenta');
SELECT tests.eq((SELECT (e->>'montoPagado')::numeric FROM jsonb_array_elements(public.cobranza_diaria('2026-10-20')) e WHERE e->>'numCuota' = '1'),
  (SELECT coalesce(sum(monto_recibido), 0) FROM public.pagos WHERE cuota_id = tests.id('cuota_a1') AND coalesce(anulado, false) = false),
  'monto pagado = pagos no anulados de la cuota');
SELECT tests.eq((SELECT (e->>'gestiones')::int FROM jsonb_array_elements(public.cobranza_diaria('2026-10-20')) e WHERE e->>'numCuota' = '1'),
  1, 'cuenta gestiones del préstamo');
SELECT tests.eq((SELECT count(*) FROM jsonb_array_elements(public.cobranza_diaria('2026-09-01'))), 0::bigint,
  'antes del primer vencimiento no hay cuotas');
SELECT tests.eq((SELECT string_agg(e->>'numCuota', ',') FROM jsonb_array_elements(public.cobranza_diaria('2026-08-01')) e),
  NULL, 'sin promesas ni vencimientos: vacío');
ROLLBACK;

-- Promesa para un día sin vencimientos: aparece la cuota prometida aunque venza después.
BEGIN;
SELECT tests.as_postgres();
UPDATE public.amortizacion SET fecha_vencimiento = '2026-12-01' WHERE prestamo_id = tests.id('pre_a');
UPDATE public.promesas_pago SET fecha_prometida = '2026-11-05' WHERE cuota_id = tests.id('cuota_a2');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT string_agg(e->>'cuotaId', ',') FROM jsonb_array_elements(public.cobranza_diaria('2026-11-05')) e),
  tests.id('cuota_a2')::text, 'incluye la cuota con promesa pendiente para esa fecha');
SELECT tests.as_user(tests.id('admin_b'));
SELECT tests.eq((SELECT count(*) FROM jsonb_array_elements(public.cobranza_diaria('2026-11-05')) e
                 WHERE e->>'cuotaId' = tests.id('cuota_a2')::text), 0::bigint, 'otra empresa no ve la cuota');
ROLLBACK;
