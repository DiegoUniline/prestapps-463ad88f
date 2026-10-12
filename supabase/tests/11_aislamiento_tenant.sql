-- Aislamiento de tenant: cada RPC nueva rechaza ids de otra empresa (admin de A con datos de B)
-- y las de lectura no devuelven datos de otra empresa.
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));

-- ── Escritura (20261012150000) ──
SELECT tests.throws(format('SELECT public.transferir_caja(%L, %L, 10)', tests.id('caja_b1'), tests.id('caja_a1')),
                    '42501', '%no pertenece a tu empresa%', 'transferir_caja: origen de otra empresa');
SELECT tests.throws(format('SELECT public.transferir_caja(%L, %L, 10)', tests.id('caja_a1'), tests.id('caja_b1')),
                    '42501', '%no pertenece a tu empresa%', 'transferir_caja: destino de otra empresa');
SELECT tests.throws(format($$SELECT public.registrar_movimiento_caja(%L, 'entrada', 10, 'x')$$, tests.id('caja_b1')),
                    '42501', NULL, 'registrar_movimiento_caja: caja de otra empresa');
SELECT tests.throws(format('SELECT public.liquidar_ruta(%L, ARRAY[%L]::uuid[], %L)', tests.id('cob_b'), tests.id('pago_b1'), tests.id('caja_a1')),
                    '42501', '%cobrador%', 'liquidar_ruta: cobrador de otra empresa');
SELECT tests.throws(format('SELECT public.liquidar_ruta(%L, ARRAY[%L]::uuid[], %L)', tests.id('cob_a'), tests.id('pago_a1'), tests.id('caja_b1')),
                    '42501', '%caja%', 'liquidar_ruta: caja de otra empresa');
SELECT tests.throws(format('SELECT public.liquidar_ruta(%L, ARRAY[%L, %L]::uuid[], %L)', tests.id('cob_a'), tests.id('pago_a1'), tests.id('pago_b1'), tests.id('caja_a1')),
                    '40001', NULL, 'liquidar_ruta: pago de otra empresa en la lista');
SELECT tests.throws(format($$SELECT public.crear_prestamo(%L::jsonb, '[]'::jsonb)$$,
                           jsonb_build_object('cliente_id', tests.id('cli_b'), 'monto_solicitado', 100, 'num_cuotas', 1,
                                              'frecuencia', 'semanal', 'modalidad', 'fijo')),
                    '42501', '%cliente%', 'crear_prestamo: cliente de otra empresa');
SELECT tests.throws(format($$SELECT public.crear_prestamo(%L::jsonb, '[]'::jsonb)$$,
                           jsonb_build_object('cliente_id', tests.id('cli_a'), 'caja_id', tests.id('caja_b1'), 'monto_solicitado', 100,
                                              'num_cuotas', 1, 'frecuencia', 'semanal', 'modalidad', 'fijo')),
                    '42501', '%caja%', 'crear_prestamo: caja de otra empresa');
SELECT tests.throws(format($$SELECT public.crear_prestamo(%L::jsonb, '[]'::jsonb)$$,
                           jsonb_build_object('cliente_id', tests.id('cli_a'), 'ruta_id', tests.id('ruta_b'), 'monto_solicitado', 100,
                                              'num_cuotas', 1, 'frecuencia', 'semanal', 'modalidad', 'fijo')),
                    '42501', '%ruta%', 'crear_prestamo: ruta de otra empresa');
SELECT tests.throws(format($$SELECT public.crear_prestamo(%L::jsonb, '[]'::jsonb)$$,
                           jsonb_build_object('cliente_id', tests.id('cli_a'), 'cobrador_id', tests.id('cob_b'), 'monto_solicitado', 100,
                                              'num_cuotas', 1, 'frecuencia', 'semanal', 'modalidad', 'fijo')),
                    '42501', '%cobrador%', 'crear_prestamo: cobrador de otra empresa');
SELECT tests.throws(format($$SELECT public.crear_prestamo(%L::jsonb, '[]'::jsonb, %L::jsonb)$$,
                           jsonb_build_object('cliente_id', tests.id('cli_a'), 'monto_solicitado', 100, 'num_cuotas', 1,
                                              'frecuencia', 'semanal', 'modalidad', 'fijo'),
                           jsonb_build_object('caja_id', tests.id('caja_b1'), 'monto', 100)),
                    '42501', '%caja%', 'crear_prestamo: caja de desembolso de otra empresa');
SELECT tests.throws(format($$SELECT public.crear_prestamo(%L::jsonb, '[]'::jsonb, NULL, %L)$$,
                           jsonb_build_object('cliente_id', tests.id('cli_a'), 'monto_solicitado', 100, 'num_cuotas', 1,
                                              'frecuencia', 'semanal', 'modalidad', 'fijo'),
                           tests.id('sol_b')),
                    '42501', '%solicitud%', 'crear_prestamo: solicitud de otra empresa');
SELECT tests.throws(format($$SELECT public.cancelar_prestamo(%L, 'x')$$, tests.id('pre_b')),
                    '42501', NULL, 'cancelar_prestamo: préstamo de otra empresa');
SELECT tests.throws(format($$SELECT public.reestructurar_prestamo(%L, '{}'::jsonb, '[]'::jsonb)$$, tests.id('pre_b')),
                    '42501', NULL, 'reestructurar_prestamo: préstamo de otra empresa');
SELECT tests.throws(format($$SELECT public.editar_pago(%L, 10, 'Efectivo', %L)$$, tests.id('pago_b1'), tests.id('caja_a1')),
                    '42501', NULL, 'editar_pago: pago de otra empresa');
SELECT tests.throws(format($$SELECT public.editar_pago(%L, 10, 'Efectivo', %L)$$, tests.id('pago_a1'), tests.id('caja_b1')),
                    '42501', '%caja%', 'editar_pago: caja destino de otra empresa');
SELECT tests.throws(format($$SELECT public.editar_pago(%L, 300, 'Efectivo', %L, %L)$$, tests.id('pago_a1'), tests.id('caja_a1'), tests.id('cob_b')),
                    '42501', '%cobrador%', 'editar_pago: reasignar a cobrador de otra empresa');
SELECT tests.eq(public.siguiente_id_cliente(), 'CLI-0008', 'siguiente_id_cliente solo cuenta clientes de la propia empresa');

-- ── Escritura (20261013120000) ──
SELECT tests.throws(format($$SELECT public.registrar_pago_completo(%L, %L, %L, %L, %L, %L, 10, 'Efectivo', current_date)$$,
                           tests.id('pre_b'), tests.id('emp_a'), tests.id('caja_a1'), tests.id('cob_a'), NULL, tests.id('admin_a')),
                    '42501', NULL, 'registrar_pago_completo: préstamo de otra empresa');
SELECT tests.throws(format($$SELECT public.registrar_pago_completo(%L, %L, %L, %L, %L, %L, 10, 'Efectivo', current_date)$$,
                           tests.id('pre_a'), tests.id('emp_b'), tests.id('caja_a1'), tests.id('cob_a'), NULL, tests.id('admin_a')),
                    '42501', '%empresa%', 'registrar_pago_completo: p_empresa_id de otra empresa');
SELECT tests.throws(format($$SELECT public.registrar_pago_completo(%L, NULL, %L, %L, NULL, NULL, 10, 'Efectivo', current_date)$$,
                           tests.id('pre_a'), tests.id('caja_b1'), tests.id('cob_a')),
                    '42501', '%caja%', 'registrar_pago_completo: caja de otra empresa (guarda de registrar_pago)');
SELECT tests.throws(format($$SELECT public.registrar_pago_completo(%L, NULL, %L, %L, NULL, NULL, 10, 'Efectivo', current_date)$$,
                           tests.id('pre_a'), tests.id('caja_a1'), tests.id('cob_b')),
                    '42501', '%cobrador%', 'registrar_pago_completo: cobrador de otra empresa (guarda de registrar_pago)');
SELECT tests.throws(format($$SELECT public.registrar_pago_completo(%L, NULL, %L, %L, %L, NULL, 10, 'Efectivo', current_date)$$,
                           tests.id('pre_a'), tests.id('caja_a1'), tests.id('cob_a'), tests.id('ruta_b')),
                    '42501', '%ruta%', 'registrar_pago_completo: ruta de otra empresa');
SELECT tests.throws(format($$SELECT public.registrar_pago_completo(%L, NULL, %L, %L, NULL, NULL, 10, 'Efectivo', current_date, NULL, NULL, %L::jsonb)$$,
                           tests.id('pre_a'), tests.id('caja_a1'), tests.id('cob_a'),
                           jsonb_build_array(jsonb_build_object('cuotaId', tests.id('cuota_b1'), 'capital', 10, 'interes', 0, 'mora', 0))),
                    '42501', '%distribución%', 'registrar_pago_completo: distribución con cuota de otro préstamo/empresa');
SELECT tests.throws(format($$SELECT public.registrar_pago_completo(%L, NULL, %L, %L, NULL, NULL, 10, 'Efectivo', current_date, NULL, NULL, NULL, %L::jsonb)$$,
                           tests.id('pre_a'), tests.id('caja_a1'), tests.id('cob_a'),
                           jsonb_build_array(jsonb_build_object('cuota_id', tests.id('cuota_b1'), 'monto', 1))),
                    '42501', '%descuento%', 'registrar_pago_completo: descuento sobre cuota de otra empresa');
SELECT tests.throws(format($$SELECT public.liquidar_prestamo(%L, %L, 'completo')$$, tests.id('pre_b'), tests.id('caja_a1')),
                    '42501', NULL, 'liquidar_prestamo: préstamo de otra empresa');
SELECT tests.throws(format($$SELECT public.liquidar_prestamo(%L, %L, 'completo')$$, tests.id('pre_a'), tests.id('caja_b1')),
                    '42501', '%caja%', 'liquidar_prestamo: caja de otra empresa');
SELECT tests.throws(format($$SELECT public.liquidar_prestamo(%L, %L, 'completo', 0, 0, NULL, %L)$$, tests.id('pre_a'), tests.id('caja_a1'), tests.id('ruta_b')),
                    '42501', '%ruta%', 'liquidar_prestamo: ruta de otra empresa');
SELECT tests.throws(format($$SELECT public.registrar_promesa_pago(%L, NULL, 100, current_date)$$, tests.id('pre_b')),
                    '42501', NULL, 'registrar_promesa_pago: préstamo de otra empresa');
SELECT tests.throws(format($$SELECT public.registrar_promesa_pago(%L, %L, 100, current_date)$$, tests.id('pre_a'), tests.id('cuota_b1')),
                    '42501', '%cuota%', 'registrar_promesa_pago: cuota de otro préstamo');
SELECT tests.throws(format($$SELECT public.registrar_visita(%L, NULL, 'sin_contacto')$$, tests.id('pre_b')),
                    '42501', NULL, 'registrar_visita: préstamo de otra empresa');
SELECT tests.throws(format($$SELECT public.registrar_visita(%L, %L, 'sin_contacto')$$, tests.id('pre_a'), tests.id('cli_b')),
                    '42501', '%cliente%', 'registrar_visita: cliente de otra empresa');
SELECT tests.throws(format($$SELECT public.editar_prestamo(%L, '{}'::jsonb)$$, tests.id('pre_b')),
                    '42501', NULL, 'editar_prestamo: préstamo de otra empresa');
SELECT tests.throws(format($$SELECT public.editar_prestamo(%L, %L::jsonb)$$, tests.id('pre_a'), jsonb_build_object('caja_id', tests.id('caja_b1'))),
                    '42501', '%caja%', 'editar_prestamo: caja de otra empresa');
SELECT tests.throws(format($$SELECT public.editar_prestamo(%L, %L::jsonb)$$, tests.id('pre_a'), jsonb_build_object('ruta_id', tests.id('ruta_b'))),
                    '42501', '%ruta%', 'editar_prestamo: ruta de otra empresa');
SELECT tests.throws(format($$SELECT public.editar_prestamo(%L, %L::jsonb)$$, tests.id('pre_a'), jsonb_build_object('cobrador_id', tests.id('cob_b'))),
                    '42501', '%cobrador%', 'editar_prestamo: cobrador de otra empresa');

-- Nada de lo anterior dejó rastro en la empresa B.
SELECT tests.as_postgres();
SELECT tests.eq((SELECT count(*) FROM public.movimientos_caja WHERE caja_id = tests.id('caja_b1')), 2::bigint,
                'caja de B sin movimientos nuevos');
SELECT tests.eq((SELECT count(*) FROM public.pagos WHERE empresa_id = tests.id('emp_b')), 1::bigint, 'B sin pagos nuevos');
SELECT tests.eq((SELECT estado::text FROM public.prestamos WHERE id = tests.id('pre_b')), 'Activo', 'préstamo de B intacto');

-- ── Lectura (20261012160000 / 20261013110000) ──
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT count(*) FROM public.prestamos_resumen(ARRAY[tests.id('pre_b')])), 0::bigint,
                'prestamos_resumen no devuelve préstamos de otra empresa');
SELECT tests.eq((SELECT count(*) FROM public.prestamos_resumen(NULL)), 1::bigint,
                'prestamos_resumen(NULL) solo devuelve los de la propia empresa');
SELECT tests.eq((SELECT count(*) FROM public.caja_saldos(ARRAY[tests.id('caja_b1'), tests.id('caja_a1')])), 1::bigint,
                'caja_saldos ignora cajas de otra empresa');
SELECT tests.eq(public.gestiones_resumen(ARRAY[tests.id('pre_b')]), '{}'::jsonb, 'gestiones_resumen ignora préstamos de otra empresa');
SELECT tests.ok(NOT (public.clientes_ultima_visita() ? tests.id('cli_b')::text) AND (public.clientes_ultima_visita() ? tests.id('cli_a')::text),
                'clientes_ultima_visita solo con clientes propios');
SELECT tests.eq((SELECT array_agg(ruta_id) FROM public.prestamos_por_ruta()), ARRAY[tests.id('ruta_a')],
                'prestamos_por_ruta solo rutas propias');
SELECT tests.eq(public.cobros_equipo_total(tests.id('sup_a')), 550::numeric, 'cobros_equipo_total del supervisor A (sin anulados)');
SELECT tests.eq((SELECT count(*) FROM jsonb_array_elements(public.estados_cuenta_clientes())), 1::bigint,
                'estados_cuenta_clientes solo clientes propios');
SELECT tests.eq((public.rentabilidad_resumen() -> 'totales' ->> 'totalCapital')::numeric, 1000::numeric,
                'rentabilidad_resumen solo préstamos propios');
SELECT tests.eq((SELECT count(*) FROM public.productividad_mora('2026-10-12')), 1::bigint, 'productividad_mora solo asesores propios');
SELECT tests.eq((public.pagos_listado('{}'::jsonb) ->> 'total')::int, 4, 'pagos_listado solo pagos propios');
SELECT tests.eq((public.dashboard_kpis('{}'::jsonb) -> 'prestamos' ->> 'total')::int, 1, 'dashboard_kpis solo préstamos propios');

-- Usuario sin empresa: nada.
SELECT tests.as_user(tests.id('sinemp'));
SELECT tests.throws(format('SELECT public.transferir_caja(%L, %L, 1)', tests.id('caja_a1'), tests.id('caja_a2')),
                    '42501', '%empresa%', 'usuario sin empresa no puede usar RPCs de escritura');
SELECT tests.eq(public.dashboard_kpis('{}'::jsonb), NULL::jsonb, 'dashboard_kpis de usuario sin empresa = NULL');
SELECT tests.eq((SELECT count(*) FROM public.caja_saldos(ARRAY[tests.id('caja_a1')])), 0::bigint, 'caja_saldos de usuario sin empresa vacío');

ROLLBACK;
