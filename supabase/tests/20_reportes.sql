-- Reportes (20261013110000): pagos anulados excluidos, "hasta" inclusivo, día de negocio en hora de México.
-- Pagos de A: pago_a1 300 (15/09 23:30 MX = 16/09 UTC), pago_a2 200 ANULADO (10/09), pago_a3 150 Transferencia (14/09),
-- pago_a4 100 en Caja A2 (16/09). Pago de B: 600.
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));

-- ── dashboard_kpis ──
SELECT tests.eq((public.dashboard_kpis('{"hoy": "2026-10-12"}') -> 'pagos' ->> 'total_cobrado')::numeric, 550::numeric,
                'dashboard_kpis: total cobrado excluye anulados y otras empresas (300 + 150 + 100)');
SELECT tests.eq((public.dashboard_kpis('{"desde": "2026-09-01", "hasta": "2026-09-15", "hoy": "2026-10-12"}') -> 'pagos' ->> 'total_cobrado')::numeric,
                450::numeric, 'dashboard_kpis: hasta inclusivo en hora de México (incluye el pago de las 23:30 del 15)');
SELECT tests.eq((public.dashboard_kpis('{"desde": "2026-09-01", "hasta": "2026-09-14", "hoy": "2026-10-12"}') -> 'pagos' ->> 'total_cobrado')::numeric,
                150::numeric, 'dashboard_kpis: el pago del 15 no entra si hasta = 14');
SELECT tests.eq((public.dashboard_kpis('{"hoy": "2026-09-15"}') -> 'pagos' ->> 'cobrado_hoy')::numeric, 300::numeric,
                'dashboard_kpis: cobrado_hoy usa el día de México');
SELECT tests.eq((public.dashboard_kpis('{"hoy": "2026-09-15"}') -> 'pagos' ->> 'num_pagos_hoy')::int, 1, 'dashboard_kpis: num_pagos_hoy');
SELECT tests.eq((public.dashboard_kpis('{"hoy": "2026-09-10"}') -> 'pagos' ->> 'cobrado_hoy')::numeric, 0::numeric,
                'dashboard_kpis: el pago anulado no cuenta como cobrado hoy');
SELECT tests.eq((SELECT (m ->> 'cobrado')::numeric FROM jsonb_array_elements(public.dashboard_kpis('{"hoy": "2026-10-12", "meses": ["2026-09"]}') -> 'meses') m),
                550::numeric, 'dashboard_kpis: serie mensual sin anulados');
SELECT tests.eq((public.dashboard_kpis('{"hoy": "2026-09-25"}') ->> 'gastosMes')::numeric, 50::numeric,
                'dashboard_kpis: gastos del mes excluyen desembolsos');
SELECT tests.eq((public.dashboard_kpis(jsonb_build_object('hoy', '2026-10-12', 'caja_id', tests.id('caja_a2'))) -> 'pagos' ->> 'total_cobrado')::numeric,
                0::numeric, 'dashboard_kpis: filtro de caja (préstamo en caja_a1)');
SELECT tests.eq((public.dashboard_kpis('{"hoy": "2026-10-12"}') -> 'cuotas' ->> 'saldo_por_cobrar')::numeric, 1220::numeric,
                'dashboard_kpis: saldo por cobrar de la empresa');
SELECT tests.eq((public.dashboard_kpis('{"hoy": "2026-10-12"}') -> 'misc' ->> 'promesas_pendientes')::int, 1, 'dashboard_kpis: promesas de la empresa');

-- ── pagos_listado ──
CREATE TEMP TABLE l AS SELECT public.pagos_listado('{}'::jsonb) AS j;
SELECT tests.eq((SELECT format('%s/%s/%s', j->>'total', j->>'total_validos', j->>'total_anulados') FROM l), '4/3/1',
                'pagos_listado: total incluye anulados; total_validos/total_anulados');
SELECT tests.eq((SELECT (j->>'sum_monto')::numeric FROM l), 550::numeric, 'pagos_listado: sum_monto excluye anulados');
SELECT tests.eq((SELECT (j->>'sum_capital')::numeric || ':' || (j->>'sum_interes')::numeric FROM l), '430:120',
                'pagos_listado: sum_capital / sum_interes excluyen anulados');
SELECT tests.eq((SELECT jsonb_array_length(j->'rows') FROM l), 4, 'pagos_listado: filas de la empresa');
SELECT tests.eq((SELECT j->'empresa'->>'nombre' FROM l), 'Empresa A', 'pagos_listado: datos de la empresa propia');
SELECT tests.eq((SELECT format('%s/%s', j->>'total', (j->>'sum_monto')::numeric) FROM (SELECT public.pagos_listado('{"desde": "2026-09-15", "hasta": "2026-09-15"}') j) x),
                '1/300', 'pagos_listado: día 15 en hora de México, hasta inclusivo');
SELECT tests.eq((SELECT format('%s/%s', j->>'total', (j->>'sum_monto')::numeric) FROM (SELECT public.pagos_listado('{"hasta": "2026-09-15T12:00:00.000Z"}') j) x),
                '3/450', 'pagos_listado: hasta como instante ISO → todo el día de México');
SELECT tests.eq((SELECT format('%s/%s', j->>'total', (j->>'sum_monto')::numeric) FROM (SELECT public.pagos_listado('{"metodos": ["Transferencia"]}') j) x),
                '1/150', 'pagos_listado: filtro por método');
SELECT tests.eq((SELECT j->>'total' FROM (SELECT public.pagos_listado('{"cajas": ["Caja A2"]}') j) x), '1', 'pagos_listado: filtro por caja');
SELECT tests.eq((SELECT j->>'total' FROM (SELECT public.pagos_listado('{"search": "CLIENTE A"}') j) x), '4', 'pagos_listado: búsqueda por cliente');
SELECT tests.eq((SELECT j->>'total' FROM (SELECT public.pagos_listado('{"search": "cliente b"}') j) x), '0', 'pagos_listado: no encuentra clientes de otra empresa');
SELECT tests.eq((SELECT format('%s/%s', j->>'total', jsonb_array_length(j->'rows')) FROM (SELECT public.pagos_listado('{}', 2, 0) j) x), '4/2',
                'pagos_listado: paginación (limit) conserva el total');
SELECT tests.eq((SELECT format('%s/%s', j->>'total', jsonb_array_length(j->'rows')) FROM (SELECT public.pagos_listado('{}', 2, 3) j) x), '4/1',
                'pagos_listado: offset');
SELECT tests.eq((SELECT j->'rows'->0->>'id' FROM (SELECT public.pagos_listado('{"sort_key": "fecha", "sort_dir": "asc"}') j) x),
                tests.id('pago_a2')::text, 'pagos_listado: orden por fecha ascendente');
SELECT tests.eq((SELECT j->'rows'->0->>'id' FROM (SELECT public.pagos_listado('{"sort_key": "montoRecibido", "sort_dir": "desc"}') j) x),
                tests.id('pago_a1')::text, 'pagos_listado: orden por monto descendente');
SELECT tests.eq((SELECT j->>'total' FROM (SELECT public.pagos_listado('{"sort_key": "x; DROP TABLE pagos", "sort_dir": "desc; --"}') j) x), '4',
                'pagos_listado: sort_key/sort_dir desconocidos no se inyectan');

-- ── productividad_mora ──
SELECT tests.eq((SELECT format('%s/%s/%s', advisor_id, clientes_morosos, monto_mora) FROM public.productividad_mora('2026-10-12')),
                tests.id('cob_a') || '/1/20', 'productividad_mora: mora vencida por asesor');
ROLLBACK;
