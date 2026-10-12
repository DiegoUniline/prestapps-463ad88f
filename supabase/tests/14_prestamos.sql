-- Préstamos: crear_prestamo (atomicidad, desembolso, folio, solicitudes), cancelar, reestructurar, editar.
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));

CREATE TEMP TABLE base AS SELECT jsonb_build_object(
  'cliente_id', tests.id('cli_a'), 'caja_id', tests.id('caja_a1'), 'ruta_id', tests.id('ruta_a'),
  'cobrador_id', tests.id('cob_a'), 'monto_solicitado', 500, 'monto_total_pagar', 600, 'num_cuotas', 2,
  'frecuencia', 'semanal', 'modalidad', 'fijo', 'tasa_interes', 20) AS p,
  jsonb_build_array(
    jsonb_build_object('num_cuota', 1, 'fecha_vencimiento', '2026-10-19', 'capital', 250, 'interes', 50, 'capital_interes', 300,
                       'saldo_capital', 250, 'saldo_interes', 50, 'saldo_total', 300, 'status', 'Pendiente'),
    jsonb_build_object('num_cuota', 2, 'fecha_vencimiento', '2026-10-26', 'capital', 250, 'interes', 50, 'capital_interes', 300,
                       'saldo_capital', 250, 'saldo_interes', 50, 'saldo_total', 300, 'status', 'Pendiente')) AS c;

-- Atomicidad: la 2.ª cuota es inválida (sin fecha_vencimiento, NOT NULL) → no queda nada.
SELECT tests.throws(format($$SELECT public.crear_prestamo(%L::jsonb, %L::jsonb, %L::jsonb)$$,
                           (SELECT p || '{"notas": "atomico"}' FROM base),
                           (SELECT jsonb_build_array(c->0, (c->1) - 'fecha_vencimiento') FROM base),
                           jsonb_build_object('caja_id', tests.id('caja_a1'), 'monto', 500)),
                    '23502', NULL, 'crear_prestamo: cuota inválida aborta la operación');
SELECT tests.throws(format($$SELECT public.crear_prestamo(%L::jsonb, %L::jsonb, %L::jsonb)$$,
                           (SELECT p || '{"notas": "atomico", "monto_solicitado": 9400.01}' FROM base), (SELECT c FROM base),
                           jsonb_build_object('caja_id', tests.id('caja_a1'), 'monto', 9400.01)),
                    'P0001', 'Saldo insuficiente%', 'crear_prestamo: desembolso mayor al saldo de la caja');
SELECT tests.throws(format($$SELECT public.crear_prestamo(%L::jsonb, %L::jsonb)$$,
                           (SELECT p || '{"notas": "atomico", "monto_solicitado": 0}' FROM base), (SELECT c FROM base)),
                    NULL, '%monto del préstamo%', 'crear_prestamo: monto 0 rechazado');
SELECT tests.throws(format($$SELECT public.crear_prestamo(%L::jsonb, %L::jsonb)$$,
                           (SELECT p || '{"notas": "atomico", "num_cuotas": 0}' FROM base), (SELECT c FROM base)),
                    NULL, '%número de cuotas%', 'crear_prestamo: 0 cuotas rechazado');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT count(*) FROM public.prestamos WHERE notas = 'atomico'), 0::bigint, 'ningún préstamo parcial quedó guardado');
SELECT tests.eq((SELECT count(*) FROM public.amortizacion), 6::bigint, 'ninguna cuota huérfana');
SELECT tests.eq((SELECT count(*) FROM public.movimientos_caja), 7::bigint, 'ningún desembolso huérfano');

-- Alta correcta (empresa_id / id / generado_por del cliente se ignoran).
SELECT tests.as_user(tests.id('admin_a'));
CREATE TEMP TABLE r AS
SELECT public.crear_prestamo(
  (SELECT p || jsonb_build_object('empresa_id', tests.id('emp_b'), 'id', tests.id('pre_b'), 'generado_por', tests.id('cob_b'),
                                  'codigo_interno', '', 'columna_que_no_existe', 1) FROM base),
  (SELECT c FROM base),
  jsonb_build_object('caja_id', tests.id('caja_a1'), 'monto', 500, 'concepto', 'Desembolso prueba')) AS j;
SELECT tests.as_postgres();
CREATE TEMP TABLE np AS SELECT * FROM public.prestamos WHERE id = (SELECT (j->>'prestamo_id')::uuid FROM r);
SELECT tests.eq((SELECT empresa_id FROM np), tests.id('emp_a'), 'préstamo creado en la empresa del usuario (ignora empresa_id)');
SELECT tests.ok((SELECT id FROM np) <> tests.id('pre_b'), 'id del cliente ignorado');
SELECT tests.eq((SELECT generado_por FROM np), tests.id('admin_a'), 'generado_por = auth.uid()');
SELECT tests.eq((SELECT codigo_interno FROM np), 'PRE-0002', 'codigo_interno vacío → PRE-XXXX siguiente de la empresa');
SELECT tests.eq((SELECT count(*) FROM public.amortizacion WHERE prestamo_id = (SELECT id FROM np) AND empresa_id = tests.id('emp_a')),
                2::bigint, 'cuotas creadas con prestamo_id y empresa_id');
SELECT tests.eq((SELECT tipo::text || ':' || monto || ':' || concepto FROM public.movimientos_caja WHERE id = (SELECT (j->>'movimiento_id')::uuid FROM r)),
                'salida:500.00:Desembolso prueba', 'movimiento de desembolso');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT saldo FROM public.caja_saldos(ARRAY[tests.id('caja_a1')])), 8900::numeric, 'caja_a1: 9400 − 500 desembolsado');

-- Solicitudes
SELECT tests.as_user(tests.id('cob_a'));
SELECT tests.throws(format($$SELECT public.crear_prestamo(%L::jsonb, %L::jsonb, NULL, %L)$$, (SELECT p FROM base), (SELECT c FROM base), tests.id('sol_a')),
                    '42501', '%permiso%', 'un cobrador no puede aprobar solicitudes');
SELECT tests.as_user(tests.id('sup_a'));
SELECT tests.lives(format($$SELECT public.crear_prestamo(%L::jsonb, %L::jsonb, NULL, %L)$$, (SELECT p FROM base), (SELECT c FROM base), tests.id('sol_a')),
                   'supervisor aprueba la solicitud');
SELECT tests.eq((SELECT status || ':' || (aprobado_por = tests.id('sup_a'))::text || ':' || (prestamo_generado_id IS NOT NULL)::text
                   FROM public.solicitudes_prestamo WHERE id = tests.id('sol_a')),
                'Aprobada:true:true', 'solicitud marcada Aprobada con aprobador y préstamo');
SELECT tests.throws(format($$SELECT public.crear_prestamo(%L::jsonb, %L::jsonb, NULL, %L)$$, (SELECT p FROM base), (SELECT c FROM base), tests.id('sol_a')),
                    NULL, '%ya fue resuelta%', 'una solicitud no se aprueba dos veces');

-- cancelar_prestamo
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.throws(format($$SELECT public.cancelar_prestamo(%L, '  ')$$, tests.id('pre_a')), NULL, '%motivo%', 'cancelar exige motivo');
SELECT tests.lives(format($$SELECT public.cancelar_prestamo(%L, 'Error de captura')$$, tests.id('pre_a')), 'cancelar préstamo propio');
SELECT tests.eq((SELECT estado::text || ':' || cancelado_por::text || ':' || motivo_cancelacion FROM public.prestamos WHERE id = tests.id('pre_a')),
                'Cancelado:' || tests.id('admin_a') || ':Error de captura', 'préstamo cancelado con auditoría');
SELECT tests.eq((SELECT count(*) FROM public.amortizacion WHERE prestamo_id = tests.id('pre_a') AND (status <> 'Pagada' OR saldo_total <> 0)),
                0::bigint, 'cuotas del préstamo cancelado en 0');
SELECT tests.eq((SELECT sum(monto) FROM public.movimientos_caja WHERE prestamo_id = tests.id('pre_a') AND tipo = 'entrada'), 1000::numeric,
                'reintegro del desembolso a la caja');
SELECT tests.throws(format($$SELECT public.cancelar_prestamo(%L, 'otra vez')$$, tests.id('pre_a')), NULL, '%ya está cancelado%',
                    'no se cancela dos veces');
SELECT tests.throws(format($$SELECT public.reestructurar_prestamo(%L, '{}'::jsonb, '[]'::jsonb)$$, tests.id('pre_a')), NULL, '%no se puede reestructurar%',
                    'no se reestructura un préstamo cancelado');
ROLLBACK;

-- reestructurar_prestamo
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.throws(format($$SELECT public.reestructurar_prestamo(%L, %L::jsonb, '[]'::jsonb)$$, tests.id('pre_a'),
                           jsonb_build_object('monto_solicitado', 900, 'num_cuotas', 1, 'frecuencia', 'semanal', 'modalidad', 'fijo')),
                    NULL, '%no tiene cuotas%', 'reestructurar sin cuotas falla');
SELECT tests.eq((SELECT estado::text FROM public.prestamos WHERE id = tests.id('pre_a')), 'Activo', 'el original sigue Activo tras el fallo');
CREATE TEMP TABLE r AS SELECT public.reestructurar_prestamo(tests.id('pre_a'),
  jsonb_build_object('monto_solicitado', 900, 'num_cuotas', 1, 'frecuencia', 'semanal', 'modalidad', 'fijo',
                     'cliente_id', tests.id('cli_b'), 'codigo_interno', 'X', 'id_prestamo', 'PRE-9999'),
  jsonb_build_array(jsonb_build_object('num_cuota', 1, 'fecha_vencimiento', '2026-11-01', 'saldo_total', 900)),
  'Cliente pidió plazo') AS j;
SELECT tests.as_postgres();
SELECT tests.eq((SELECT cliente_id::text || ':' || reestructurado_de::text || ':' || empresa_id::text || ':' || (id_prestamo <> 'PRE-9999')::text
                   FROM public.prestamos WHERE id = (SELECT (j->>'prestamo_id')::uuid FROM r)),
                tests.id('cli_a') || ':' || tests.id('pre_a') || ':' || tests.id('emp_a') || ':true',
                'nuevo préstamo: mismo cliente, reestructurado_de, empresa propia, folio propio');
SELECT tests.eq((SELECT estado::text || ':' || motivo_cancelacion FROM public.prestamos WHERE id = tests.id('pre_a')),
                'Reestructurado:Cliente pidió plazo', 'original marcado Reestructurado');
SELECT tests.eq((SELECT sum(saldo_total) FROM public.amortizacion WHERE prestamo_id = tests.id('pre_a')), 0::numeric,
                'saldos del original en 0');
ROLLBACK;

-- editar_prestamo
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.throws(format($$SELECT public.editar_prestamo(%L, '{"valor_mora": -1}'::jsonb)$$, tests.id('pre_a')), NULL, '%negativos%',
                    'editar_prestamo rechaza valores negativos');
SELECT tests.lives(format($$SELECT public.editar_prestamo(%L, '{"tasa_interes": 25, "notas": "nota", "tipo_mora": "fijo"}'::jsonb)$$, tests.id('pre_a')),
                   'editar_prestamo cambia condiciones');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT tasa_interes::text || ':' || notas || ':' || tipo_mora::text || ':' || caja_id::text FROM public.prestamos WHERE id = tests.id('pre_a')),
                '25:nota:fijo:' || tests.id('caja_a1'), 'solo cambian las claves enviadas');
SELECT tests.eq((SELECT count(*) FROM public._mock_rebuild_log WHERE prestamo_id = tests.id('pre_a')), 1::bigint, 'reconstruye la amortización');

-- Cambio de caja: caja_a2 tiene 600 < 1000 → saldo insuficiente, sin cambios.
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.throws(format($$SELECT public.editar_prestamo(%L, %L::jsonb)$$, tests.id('pre_a'), jsonb_build_object('caja_id', tests.id('caja_a2'))),
                    'P0001', 'Saldo insuficiente%', 'editar_prestamo: caja nueva sin saldo');
SELECT tests.eq((SELECT caja_id FROM public.prestamos WHERE id = tests.id('pre_a')), tests.id('caja_a1'), 'la caja no cambió');

-- Con 1500 disponibles en caja_a2 el cambio (1000) debe proceder y dejarla en 500.
SELECT tests.as_postgres();
INSERT INTO public.movimientos_caja (caja_id, empresa_id, tipo, monto, concepto) VALUES (tests.id('caja_a2'), tests.id('emp_a'), 'entrada', 900, 'Depósito');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT saldo FROM public.caja_saldos(ARRAY[tests.id('caja_a2')])), 1500::numeric, 'caja_a2 con 1500');
SELECT tests.lives(format($$SELECT public.editar_prestamo(%L, %L::jsonb)$$, tests.id('pre_a'), jsonb_build_object('caja_id', tests.id('caja_a2'))),
              'editar_prestamo: mover desembolso de 1000 a una caja con 1500');
SELECT tests.eq((SELECT saldo FROM public.caja_saldos(ARRAY[tests.id('caja_a1')])) + (SELECT saldo FROM public.caja_saldos(ARRAY[tests.id('caja_a2')])),
                9400::numeric + 1500, 'la suma de saldos de ambas cajas no cambia al mover el desembolso');
ROLLBACK;
