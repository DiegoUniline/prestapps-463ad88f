-- Pagos: editar_pago, registrar_pago_completo (descuentos de mora), liquidar_prestamo, promesas y visitas.
-- pre_a: cuota_a1 saldo 320 (mora 20), cuotas 2–4 saldo 300 c/u → total 1220. cob_a efectivo_en_mano = 500.
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));

-- ── editar_pago ──
SELECT tests.throws(format($$SELECT public.editar_pago(%L, 150, 'Efectivo', %L)$$, tests.id('pago_a3'), tests.id('caja_a1')),
                    NULL, '%liquidado en un corte%', 'editar_pago rechaza pagos con corte');
SELECT tests.throws(format($$SELECT public.editar_pago(%L, 200, 'Efectivo', %L)$$, tests.id('pago_a2'), tests.id('caja_a1')),
                    NULL, '%anulado%', 'editar_pago rechaza pagos anulados');
SELECT tests.throws(format($$SELECT public.editar_pago(%L, 0, 'Efectivo', %L)$$, tests.id('pago_a1'), tests.id('caja_a1')),
                    NULL, '%mayor a 0%', 'editar_pago rechaza monto 0');
SELECT tests.throws(format($$SELECT public.editar_pago(%L, 300, 'Efectivo', NULL)$$, tests.id('pago_a1')),
                    '42501', '%caja%', 'editar_pago exige caja');

SELECT tests.eq(public.editar_pago(tests.id('pago_a1'), 350, 'Efectivo', tests.id('caja_a2')) - 'pago_id' - 'prestamo_id',
                '{"monto_cambio": true, "caja_cambio": true}'::jsonb, 'editar_pago: cambio de monto y de caja');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT monto_recibido::text || ':' || caja_id::text FROM public.pagos WHERE id = tests.id('pago_a1')),
                '350.00:' || tests.id('caja_a2'), 'pago actualizado');
SELECT tests.eq((SELECT array_agg(caja_id::text || ':' || tipo || ':' || monto ORDER BY tipo)
                   FROM public.movimientos_caja WHERE concepto LIKE 'Corrección pago PRE-0001%'),
                ARRAY[tests.id('caja_a2') || ':entrada:350.00', tests.id('caja_a1') || ':salida:300'],
                'salida de la caja anterior (monto viejo) y entrada en la nueva (monto nuevo)');
SELECT tests.eq((SELECT efectivo_en_mano FROM public.profiles WHERE id = tests.id('cob_a')), 550::numeric, 'efectivo_en_mano +50');
SELECT tests.eq((SELECT count(*) FROM public._mock_rebuild_log WHERE prestamo_id = tests.id('pre_a')), 1::bigint,
                'cambio de monto reconstruye la amortización');

-- Reasignar cobrador: solo admin.
SELECT tests.as_user(tests.id('sup_a'));
SELECT tests.lives(format($$SELECT public.editar_pago(%L, 100, 'Transferencia', %L, %L)$$, tests.id('pago_a4'), tests.id('caja_a2'), tests.id('cobx_a')),
                   'supervisor edita método');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT cobrador_id::text || ':' || metodo_pago FROM public.pagos WHERE id = tests.id('pago_a4')),
                tests.id('cob_a') || ':Transferencia', 'supervisor no puede reasignar el cobrador (se ignora)');
SELECT tests.eq((SELECT count(*) FROM public._mock_rebuild_log WHERE prestamo_id = tests.id('pre_a')), 1::bigint,
                'sin cambio de monto no se reconstruye');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.lives(format($$SELECT public.editar_pago(%L, 100, NULL, %L, %L)$$, tests.id('pago_a4'), tests.id('caja_a2'), tests.id('cobx_a')),
                   'admin reasigna el cobrador');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT cobrador_id::text || ':' || metodo_pago FROM public.pagos WHERE id = tests.id('pago_a4')),
                tests.id('cobx_a') || ':Transferencia', 'cobrador reasignado, método conservado si viene vacío');
SELECT tests.eq((SELECT efectivo_en_mano FROM public.profiles WHERE id = tests.id('cob_a')) || ':' ||
                (SELECT efectivo_en_mano FROM public.cobradores WHERE id = tests.id('cobx_a')),
                '450.00:100.00', 'efectivo_en_mano movido del cobrador anterior al nuevo');
ROLLBACK;

-- ── registrar_pago_completo ──
BEGIN;
SELECT tests.as_user(tests.id('cob_a'));
SELECT tests.throws(format($$SELECT public.registrar_pago_completo(%L, NULL, %L, %L, %L, NULL, 300, 'Efectivo', '2026-10-12', NULL, NULL,
                                                                   %L::jsonb, %L::jsonb)$$,
                           tests.id('pre_a'), tests.id('caja_a1'), tests.id('cob_a'), tests.id('ruta_a'),
                           jsonb_build_array(jsonb_build_object('cuotaId', tests.id('cuota_a1'), 'capital', 250, 'interes', 50, 'mora', 0)),
                           jsonb_build_array(jsonb_build_object('cuota_id', tests.id('cuota_a1'), 'monto', 20.01))),
                    'P0001', '%no puede ser mayor a la mora pendiente%', 'descuento mayor a saldo_mora rechazado');
SELECT tests.throws(format($$SELECT public.registrar_pago_completo(%L, NULL, %L, %L, NULL, NULL, 300, 'Efectivo', '2026-10-12', NULL, NULL, NULL, %L::jsonb)$$,
                           tests.id('pre_a'), tests.id('caja_a1'), tests.id('cob_a'),
                           jsonb_build_array(jsonb_build_object('cuota_id', tests.id('cuota_a2'), 'monto', 10),
                                             jsonb_build_object('cuota_id', tests.id('cuota_a1'), 'monto', 25))),
                    'P0001', '%no puede ser mayor%', 'segundo descuento inválido revierte el primero');
SELECT tests.throws(format($$SELECT public.registrar_pago_completo(%L, NULL, %L, %L, NULL, NULL, 300, 'Efectivo', '2026-10-12', NULL, NULL, NULL, %L::jsonb)$$,
                           tests.id('pre_a'), tests.id('caja_a1'), tests.id('cob_a'),
                           jsonb_build_array(jsonb_build_object('cuota_id', tests.id('cuota_a1'), 'monto', -1))),
                    NULL, '%negativo%', 'descuento negativo rechazado');
SELECT tests.throws(format($$SELECT public.registrar_pago_completo(%L, NULL, %L, %L, NULL, %L, 300, 'Efectivo', '2026-10-12')$$,
                           tests.id('pre_a'), tests.id('caja_a1'), tests.id('cob_a'), tests.id('admin_a')),
                    '42501', '%usuario%', 'p_registrado_por de otro usuario rechazado');
SELECT tests.throws(format($$SELECT public.registrar_pago_completo(%L, NULL, %L, %L, NULL, NULL, 0, 'Efectivo', '2026-10-12')$$,
                           tests.id('pre_a'), tests.id('caja_a1'), tests.id('cob_a')),
                    NULL, '%mayor a 0%', 'monto 0 rechazado');
SELECT tests.throws(format($$SELECT public.registrar_pago_completo(%L, NULL, %L, %L, NULL, NULL, 10, 'Efectivo', NULL)$$,
                           tests.id('pre_a'), tests.id('caja_a1'), tests.id('cob_a')),
                    NULL, '%fecha%', 'fecha obligatoria');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT sum(descuento_mora) FROM public.amortizacion WHERE prestamo_id = tests.id('pre_a')), 0::numeric,
                'los descuentos de intentos fallidos se revirtieron');
SELECT tests.eq((SELECT count(*) FROM public.pagos WHERE prestamo_id = tests.id('pre_a')), 4::bigint, 'los intentos fallidos no crearon pagos');

SELECT tests.as_user(tests.id('cob_a'));
CREATE TEMP TABLE r AS SELECT public.registrar_pago_completo(
  tests.id('pre_a'), tests.id('emp_a'), tests.id('caja_a1'), tests.id('cob_a'), tests.id('ruta_a'), tests.id('cob_a'),
  305.004, 'Efectivo', '2026-10-12', 19.4321, -99.1234,
  jsonb_build_array(jsonb_build_object('cuotaId', tests.id('cuota_a1'), 'capital', 250, 'interes', 50, 'mora', 5)),
  jsonb_build_array(jsonb_build_object('cuota_id', tests.id('cuota_a1'), 'monto', 15))) AS j;
SELECT tests.as_postgres();
CREATE TEMP TABLE np AS SELECT * FROM public.pagos WHERE id = (SELECT (j->>'pago_id')::uuid FROM r);
SELECT tests.eq((SELECT count(*) FROM np), 1::bigint, 'registrar_pago_completo devuelve el pago creado por registrar_pago');
SELECT tests.eq((SELECT empresa_id::text || ':' || registrado_por::text || ':' || monto_recibido || ':' || fecha_pago || ':' || gps_lat FROM np),
                tests.id('emp_a') || ':' || tests.id('cob_a') || ':305.00:2026-10-12:19.4321',
                'registrar_pago recibe empresa, usuario, monto redondeado, fecha y GPS');
SELECT tests.eq((SELECT descuento_mora FROM public.amortizacion WHERE id = tests.id('cuota_a1')), 15::numeric, 'descuento_mora fijado en la cuota');
SELECT tests.eq((SELECT status FROM public.amortizacion WHERE id = tests.id('cuota_a1')), 'Pagada', 'cuota pagada con el descuento');
SELECT tests.as_user(tests.id('cob_a'));
SELECT tests.lives(format($$SELECT public.registrar_pago_completo(%L, NULL, %L, %L, NULL, NULL, 50, 'Efectivo', '2026-10-12', NULL, NULL, NULL, '[{"cuota_id": "%s", "monto": 0}]'::jsonb)$$,
                          tests.id('pre_a'), tests.id('caja_a1'), tests.id('cob_a'), tests.id('cuota_a2')),
                   'descuento 0 se ignora');
ROLLBACK;

-- ── liquidar_prestamo ──
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.throws(format($$SELECT public.liquidar_prestamo(%L, %L, 'todo')$$, tests.id('pre_a'), tests.id('caja_a1')),
                    NULL, '%inválido%', 'modo inválido');
SELECT tests.throws(format($$SELECT public.liquidar_prestamo(%L, %L, 'descuento', 150)$$, tests.id('pre_a'), tests.id('caja_a1')),
                    NULL, '%entre 0 y 100%', 'porcentaje fuera de rango');
SELECT tests.throws(format($$SELECT public.liquidar_prestamo(%L, %L, 'completo', p_monto_esperado => 1000)$$, tests.id('pre_a'), tests.id('caja_a1')),
                    'P0001', '%cambiaron%', 'monto esperado distinto al saldo real (1000 vs 1220)');
SELECT tests.throws(format($$SELECT public.liquidar_prestamo(%L, %L, 'completo', p_monto_esperado => 1220.05)$$, tests.id('pre_a'), tests.id('caja_a1')),
                    'P0001', '%cambiaron%', 'diferencia mayor a la tolerancia (0.01 por cuota) rechazada');
SELECT tests.throws(format($$SELECT public.liquidar_prestamo(%L, %L, 'descuento', 50, 0, p_monto_esperado => 1220)$$, tests.id('pre_a'), tests.id('caja_a1')),
                    'P0001', '%cambiaron%', 'monto esperado sin el descuento rechazado');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT count(*) FROM public.pagos WHERE prestamo_id = tests.id('pre_a')), 4::bigint, 'sin pagos tras los rechazos');
SELECT tests.eq((SELECT sum(descuento_mora)::text || ':' || sum(saldo_mora)::text FROM public.amortizacion WHERE prestamo_id = tests.id('pre_a')),
                '0:20', 'condonaciones revertidas tras el rechazo');

SELECT tests.as_user(tests.id('admin_a'));
CREATE TEMP TABLE r AS SELECT public.liquidar_prestamo(tests.id('pre_a'), tests.id('caja_a1'), 'completo',
                                                       p_cobrador_id => tests.id('cob_a'), p_monto_esperado => 1220.03) AS j;
SELECT tests.eq((SELECT (j->>'monto')::numeric || ':' || (j->>'condonado') || ':' || (j->>'cuotas') FROM r), '1220.00:0.00:4',
                'liquidación completa: 1220, sin condonar, 4 cuotas (tolerancia de centavos)');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT monto_recibido::text || ':' || metodo_pago || ':' || registrado_por::text FROM public.pagos WHERE id = (SELECT (j->'pago'->>'pago_id')::uuid FROM r)),
                '1220.00:Efectivo:' || tests.id('admin_a'), 'pago de liquidación registrado por el usuario');
SELECT tests.eq((SELECT notas || ':' || estado::text FROM public.prestamos WHERE id = tests.id('pre_a')), 'Liquidación total:Liquidado',
                'préstamo anotado y liquidado');
SELECT tests.eq((SELECT count(*) FROM public._mock_rebuild_log WHERE prestamo_id = tests.id('pre_a')), 1::bigint, 'reconstruye la amortización');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.throws(format($$SELECT public.liquidar_prestamo(%L, %L, 'completo')$$, tests.id('pre_a'), tests.id('caja_a1')),
                    NULL, '%ya está liquidado%', 'no se liquida dos veces');
ROLLBACK;

BEGIN;
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((public.liquidar_prestamo(tests.id('pre_a'), tests.id('caja_a1'), 'solo_capital', p_monto_esperado => 1000) - 'pago' - 'prestamo_id'),
                '{"monto": 1000, "condonado": 220, "cuotas": 4}'::jsonb, 'solo capital: cobra 1000 y condona 200 de interés + 20 de mora');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT notas FROM public.prestamos WHERE id = tests.id('pre_a')), 'Liquidación solo capital (condonado: $220.00)', 'nota de solo capital');
ROLLBACK;

BEGIN;
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((public.liquidar_prestamo(tests.id('pre_a'), tests.id('caja_a1'), 'descuento', 50, 10, p_monto_esperado => 1190) - 'pago' - 'prestamo_id'),
                '{"monto": 1190, "condonado": 30, "cuotas": 4}'::jsonb, 'descuento 50 % mora + 10 % interés: 1220 − 10 − 20');
ROLLBACK;

-- ── Promesas y visitas ──
BEGIN;
SELECT tests.as_user(tests.id('cob_a'));
SELECT tests.throws(format($$SELECT public.registrar_promesa_pago(%L, %L, 0, '2026-10-20')$$, tests.id('pre_a'), tests.id('cuota_a3')),
                    NULL, '%mayor a 0%', 'promesa con monto 0 rechazada');
SELECT tests.lives(format($$SELECT public.registrar_promesa_pago(%L, %L, 300, '2026-10-20', 'llamar')$$, tests.id('pre_a'), tests.id('cuota_a3')),
                   'registrar_promesa_pago');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT status FROM public.amortizacion WHERE id = tests.id('cuota_a3')), 'Prometida', 'cuota marcada Prometida');
SELECT tests.eq((SELECT empresa_id::text || ':' || monto_prometido || ':' || status FROM public.promesas_pago WHERE cuota_id = tests.id('cuota_a3')),
                tests.id('emp_a') || ':300.00:Pendiente', 'promesa creada en la empresa del usuario');
SELECT tests.as_user(tests.id('cob_a'));
SELECT tests.eq((SELECT (j->>'promesa_id') IS NOT NULL FROM (SELECT public.registrar_visita(tests.id('pre_a'), NULL, 'promesa_pago', 'visto', tests.id('cuota_a4'), 150, '2026-10-25') j) x),
                true, 'registrar_visita con promesa crea gestión y promesa');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT cliente_id::text || ':' || registrado_por::text || ':' || fecha_seguimiento FROM public.crm_gestiones WHERE notas = 'visto'),
                tests.id('cli_a') || ':' || tests.id('cob_a') || ':2026-10-25', 'gestión con cliente del préstamo y usuario');
ROLLBACK;
