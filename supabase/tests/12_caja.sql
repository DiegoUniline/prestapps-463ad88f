-- Cajas: transferir_caja / registrar_movimiento_caja (saldo = caja_saldos, bloqueo, atomicidad)
-- y fórmula de caja_saldos. Saldos iniciales: caja_a1 = 9400, caja_a2 = 600 (ver 05_fixtures.sql).
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));

-- caja_saldos: pagos no anulados − desembolsos + movimientos manuales, SIN entradas de liquidación.
SELECT tests.eq((SELECT saldo FROM public.caja_saldos(ARRAY[tests.id('caja_a1')])), 9400::numeric,
                'caja_saldos(caja_a1) = 450 pagos − 1000 desembolso + 9950 manuales (excluye "Liquidación ruta")');
SELECT tests.eq((SELECT saldo FROM public.caja_saldos(ARRAY[tests.id('caja_a2')])), 600::numeric, 'caja_saldos(caja_a2) = 600');

SELECT tests.as_postgres();
INSERT INTO public.movimientos_caja (caja_id, empresa_id, tipo, monto, concepto)
VALUES (tests.id('caja_a2'), tests.id('emp_a'), 'entrada', 70, 'Corte cobrador Cobrador A'),
       (tests.id('caja_a2'), tests.id('emp_a'), 'entrada', 30, 'Liquidacion ruta sin acento'),
       (tests.id('caja_a2'), tests.id('emp_a'), 'salida', 20, 'Liquidación ruta (salida: sí cuenta)');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT saldo FROM public.caja_saldos(ARRAY[tests.id('caja_a2')])), 580::numeric,
                'caja_saldos excluye entradas "Corte cobrador%" y "Liquidacion ruta%" pero no salidas');

SELECT tests.as_postgres();
UPDATE public.prestamos SET estado = 'Cancelado' WHERE id = tests.id('pre_a');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT saldo FROM public.caja_saldos(ARRAY[tests.id('caja_a1')])), 10400::numeric,
                'caja_saldos no descuenta desembolsos de préstamos cancelados');
SELECT tests.as_postgres();
UPDATE public.prestamos SET estado = 'Activo' WHERE id = tests.id('pre_a');
DELETE FROM public.movimientos_caja WHERE caja_id = tests.id('caja_a2') AND concepto <> 'Depósito inicial';
SELECT tests.as_user(tests.id('admin_a'));

-- transferir_caja
SELECT tests.throws(format('SELECT public.transferir_caja(%L, %L, 9400.01)', tests.id('caja_a1'), tests.id('caja_a2')),
                    'P0001', 'Saldo insuficiente%', 'transferir_caja: saldo insuficiente (9400.01 > 9400)');
SELECT tests.throws(format('SELECT public.transferir_caja(%L, %L, 0)', tests.id('caja_a1'), tests.id('caja_a2')),
                    NULL, '%mayor a 0%', 'transferir_caja: monto 0 rechazado');
SELECT tests.throws(format('SELECT public.transferir_caja(%L, %L, -5)', tests.id('caja_a1'), tests.id('caja_a2')),
                    NULL, '%mayor a 0%', 'transferir_caja: monto negativo rechazado');
SELECT tests.throws(format('SELECT public.transferir_caja(%L, %L, 5)', tests.id('caja_a1'), tests.id('caja_a1')),
                    NULL, '%distintas%', 'transferir_caja: misma caja rechazada');
SELECT tests.throws(format('SELECT public.transferir_caja(%L, %L, 5)', tests.id('caja_a1'), gen_random_uuid()),
                    '42501', NULL, 'transferir_caja: destino inexistente rechazado');
SELECT tests.eq((SELECT count(*) FROM public.movimientos_caja WHERE caja_id IN (tests.id('caja_a1'), tests.id('caja_a2'))), 5::bigint,
                'transferencias fallidas no dejaron movimientos (atomicidad)');

SELECT tests.lives(format($$SELECT public.transferir_caja(%L, %L, 400.004, 'Prueba')$$, tests.id('caja_a1'), tests.id('caja_a2')),
                   'transferir_caja: transferencia válida');
SELECT tests.eq((SELECT saldo FROM public.caja_saldos(ARRAY[tests.id('caja_a1')])), 9000::numeric, 'origen −400 (monto redondeado a 2 decimales)');
SELECT tests.eq((SELECT saldo FROM public.caja_saldos(ARRAY[tests.id('caja_a2')])), 1000::numeric, 'destino +400');
SELECT tests.eq((SELECT saldo_actual FROM public.cajas WHERE id = tests.id('caja_a1')), 8700::numeric,
                'cajas.saldo_actual (trigger) refleja la salida');
SELECT tests.eq((SELECT array_agg(tipo::text || ':' || monto::text || ':' || concepto ORDER BY tipo)
                   FROM public.movimientos_caja WHERE concepto = 'Prueba'),
                ARRAY['entrada:400.00:Prueba', 'salida:400.00:Prueba'], 'un movimiento de salida y uno de entrada, con el tenant');
SELECT tests.eq((SELECT count(*) FROM public.movimientos_caja WHERE concepto = 'Prueba' AND empresa_id = tests.id('emp_a')), 2::bigint,
                'movimientos de la transferencia con empresa_id del usuario');
SELECT tests.throws(format('SELECT public.transferir_caja(%L, %L, 1000.01)', tests.id('caja_a2'), tests.id('caja_a1')),
                    'P0001', 'Saldo insuficiente%', 'transferir_caja: el saldo nuevo también se valida');
SELECT tests.lives(format('SELECT public.transferir_caja(%L, %L, 1000)', tests.id('caja_a2'), tests.id('caja_a1')),
                   'transferir_caja: transferir el saldo exacto está permitido');

-- registrar_movimiento_caja
SELECT tests.throws(format($$SELECT public.registrar_movimiento_caja(%L, 'salida', 0.01, 'Gasto')$$, tests.id('caja_a2')),
                    'P0001', 'Saldo insuficiente%', 'registrar_movimiento_caja: salida sin saldo');
SELECT tests.throws(format($$SELECT public.registrar_movimiento_caja(%L, 'otro', 1, 'x')$$, tests.id('caja_a2')),
                    NULL, '%inválido%', 'registrar_movimiento_caja: tipo inválido');
SELECT tests.lives(format($$SELECT public.registrar_movimiento_caja(%L, 'entrada', 25, '')$$, tests.id('caja_a2')),
                   'registrar_movimiento_caja: depósito sin saldo previo');
SELECT tests.eq((SELECT concepto FROM public.movimientos_caja WHERE caja_id = tests.id('caja_a2') ORDER BY created_at DESC, monto LIMIT 1),
                'Depósito manual', 'concepto por defecto del depósito');
SELECT tests.lives(format($$SELECT public.registrar_movimiento_caja(%L, 'salida', 25, '[Oficina] Luz')$$, tests.id('caja_a2')),
                   'registrar_movimiento_caja: retiro dentro del saldo');
SELECT tests.eq((SELECT saldo FROM public.caja_saldos(ARRAY[tests.id('caja_a2')])), 0::numeric, 'caja_a2 queda en 0');

-- Concurrencia: el bloqueo FOR UPDATE de la caja serializa dos retiros (dblink, otra sesión).
ROLLBACK;

SELECT CASE WHEN to_regprocedure('tests.dblink_connect(text, text)') IS NULL
            THEN tests.skip('transferir_caja: bloqueo de caja entre sesiones', 'dblink no disponible') END;

BEGIN;
DO $$
BEGIN
  IF to_regprocedure('tests.dblink_connect(text, text)') IS NULL THEN RETURN; END IF;
  PERFORM tests.dblink_connect('otra', current_setting('tests.dblink_dsn'));
END $$;
-- Esta sesión bloquea caja_a1 (como lo haría transferir_caja) y la otra intenta transferir con timeout.
SELECT 1 FROM public.cajas WHERE id = tests.id('caja_a1') FOR UPDATE \g /dev/null
SELECT CASE WHEN to_regprocedure('tests.dblink_connect(text, text)') IS NOT NULL THEN
  tests.ok(
    (SELECT r FROM tests.dblink('otra', format($q$
       SET lock_timeout = '300ms';
       SELECT set_config('request.jwt.claim.sub', %L, false);
       SET ROLE authenticated;
       DO $d$ BEGIN
         PERFORM public.transferir_caja(%L, %L, 1);
         RAISE EXCEPTION 'no esperó';
       EXCEPTION WHEN lock_not_available THEN
         RAISE NOTICE 'bloqueada';
       END $d$;
       SELECT 'bloqueada'::text
     $q$, tests.id('admin_a'), tests.id('caja_a1'), tests.id('caja_a2'))) AS t(r text)) = 'bloqueada',
    'transferir_caja espera el bloqueo FOR UPDATE de la caja tomado por otra transacción') END;
DO $$
BEGIN
  IF to_regprocedure('tests.dblink_connect(text, text)') IS NOT NULL THEN
    PERFORM tests.dblink_disconnect('otra');
  END IF;
END $$;
ROLLBACK;
