-- liquidar_ruta: corte de un cobrador (rol, doble liquidación, efectivo en mano, movimientos).
-- cob_a tiene sin corte: pago_a1 (300 Efectivo) y pago_a4 (100 Efectivo); efectivo_en_mano = 500; comisión 10 %.
BEGIN;

SELECT tests.as_user(tests.id('cob_a'));
SELECT tests.throws(format('SELECT public.liquidar_ruta(%L, ARRAY[%L]::uuid[], %L)', tests.id('cob_a'), tests.id('pago_a1'), tests.id('caja_a1')),
                    '42501', '%permiso%', 'un cobrador no puede liquidar rutas');

SELECT tests.as_user(tests.id('sup_a'));
SELECT tests.throws(format('SELECT public.liquidar_ruta(%L, ARRAY[]::uuid[], %L)', tests.id('cob_a'), tests.id('caja_a1')),
                    NULL, 'No hay pagos%', 'lista vacía rechazada');
SELECT tests.throws(format('SELECT public.liquidar_ruta(%L, ARRAY[%L, %L]::uuid[], %L)', tests.id('cob_a'), tests.id('pago_a1'), tests.id('pago_a2'), tests.id('caja_a1')),
                    '40001', NULL, 'pago anulado en la lista: falla todo');
SELECT tests.throws(format('SELECT public.liquidar_ruta(%L, ARRAY[%L, %L]::uuid[], %L)', tests.id('cob_a'), tests.id('pago_a1'), tests.id('pago_a3'), tests.id('caja_a1')),
                    '40001', NULL, 'pago ya liquidado (con corte) en la lista: falla todo');
SELECT tests.throws(format('SELECT public.liquidar_ruta(%L, ARRAY[%L]::uuid[], %L)', tests.id('sup_a'), tests.id('pago_a1'), tests.id('caja_a1')),
                    '40001', NULL, 'pago de otro cobrador: falla');
SELECT tests.eq((SELECT count(*) FROM public.cortes), 1::bigint, 'los intentos fallidos no crearon cortes');

CREATE TEMP TABLE r AS
SELECT public.liquidar_ruta(tests.id('cob_a'), ARRAY[tests.id('pago_a1'), tests.id('pago_a4'), tests.id('pago_a1')],
                            tests.id('caja_a1'), '2026-09-30 12:00-06', NULL, 'Comisión Cobrador A') AS j;
SELECT tests.eq((SELECT (j->>'pagos')::int FROM r), 2, 'liquida 2 pagos (ids duplicados ignorados)');
SELECT tests.eq((SELECT (j->>'total_cobrado')::numeric FROM r), 400::numeric, 'total_cobrado = 400');
SELECT tests.eq((SELECT (j->>'monto_efectivo')::numeric FROM r), 400::numeric, 'monto_efectivo = 400');
SELECT tests.eq((SELECT (j->>'monto_comision')::numeric FROM r), 40::numeric, 'comisión 10 % = 40');

SELECT tests.as_postgres();
SELECT tests.eq((SELECT count(*) FROM public.pagos WHERE corte_id = (SELECT (j->>'corte_id')::uuid FROM r)), 2::bigint,
                'los 2 pagos quedan con corte_id');
SELECT tests.eq((SELECT empresa_id FROM public.cortes WHERE id = (SELECT (j->>'corte_id')::uuid FROM r)), tests.id('emp_a'),
                'corte con empresa del usuario');
SELECT tests.eq((SELECT efectivo_en_mano FROM public.profiles WHERE id = tests.id('cob_a')), 100::numeric,
                'efectivo_en_mano del cobrador 500 − 400 = 100');
SELECT tests.eq((SELECT concepto FROM public.movimientos_caja WHERE id = (SELECT (j->>'movimiento_id')::uuid FROM r)),
                'Liquidación ruta Cobrador A — 2 pagos hasta 30/09/2026', 'concepto de la entrada de liquidación');
SELECT tests.eq((SELECT tipo::text || ':' || monto FROM public.movimientos_caja WHERE id = (SELECT (j->>'movimiento_comision_id')::uuid FROM r)),
                'salida:40.00', 'salida por comisión');

SELECT tests.as_user(tests.id('sup_a'));
SELECT tests.eq((SELECT saldo FROM public.caja_saldos(ARRAY[tests.id('caja_a1')])), 9360::numeric,
                'caja_saldos no duplica la entrada de liquidación (9400 − 40 de comisión)');

-- Doble liquidación
SELECT tests.throws(format('SELECT public.liquidar_ruta(%L, ARRAY[%L, %L]::uuid[], %L)', tests.id('cob_a'), tests.id('pago_a1'), tests.id('pago_a4'), tests.id('caja_a1')),
                    '40001', '%ya fueron liquidados%', 'doble liquidación de los mismos pagos rechazada');
SELECT tests.throws(format('SELECT public.liquidar_ruta(%L, ARRAY[%L]::uuid[], %L)', tests.id('cob_a'), tests.id('pago_a4'), tests.id('caja_a2')),
                    '40001', NULL, 'doble liquidación parcial rechazada');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT count(*) FROM public.cortes), 2::bigint, 'solo se creó un corte');
SELECT tests.eq((SELECT efectivo_en_mano FROM public.profiles WHERE id = tests.id('cob_a')), 100::numeric,
                'efectivo_en_mano no se descontó dos veces');

-- Sin comisión explícita no hay salida; efectivo nunca negativo.
UPDATE public.profiles SET efectivo_en_mano = 50 WHERE id = tests.id('cob_a');
INSERT INTO public.pagos (id, prestamo_id, empresa_id, caja_id, cobrador_id, monto_recibido, metodo_pago)
VALUES ('00000000-0000-0000-0000-0000000000d1', tests.id('pre_a'), tests.id('emp_a'), tests.id('caja_a1'), tests.id('cob_a'), 80, 'Efectivo');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((public.liquidar_ruta(tests.id('cob_a'), ARRAY['00000000-0000-0000-0000-0000000000d1'::uuid], tests.id('caja_a1'))
                 ->> 'movimiento_comision_id'), NULL, 'sin concepto de comisión no se registra la salida');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT efectivo_en_mano FROM public.profiles WHERE id = tests.id('cob_a')), 0::numeric,
                'efectivo_en_mano no queda negativo (50 − 80 → 0)');

-- Cobrador de la tabla cobradores (no profiles).
INSERT INTO public.pagos (id, prestamo_id, empresa_id, caja_id, cobrador_id, monto_recibido, metodo_pago)
VALUES ('00000000-0000-0000-0000-0000000000d2', tests.id('pre_a'), tests.id('emp_a'), tests.id('caja_a1'), tests.id('cobx_a'), 60, 'Efectivo');
UPDATE public.cobradores SET efectivo_en_mano = 60 WHERE id = tests.id('cobx_a');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.lives(format('SELECT public.liquidar_ruta(%L, ARRAY[%L]::uuid[], %L)', tests.id('cobx_a'), '00000000-0000-0000-0000-0000000000d2', tests.id('caja_a1')),
                   'liquidar_ruta acepta cobradores de la tabla cobradores');
SELECT tests.as_postgres();
SELECT tests.eq((SELECT efectivo_en_mano FROM public.cobradores WHERE id = tests.id('cobx_a')), 0::numeric,
                'efectivo_en_mano de cobradores ajustado');

ROLLBACK;

-- ── Doble liquidación concurrente (dblink): la 2.ª sesión espera el bloqueo y, al confirmarse
-- la 1.ª, falla con 40001 en vez de liquidar otra vez. Esta sección confirma y luego limpia.
SELECT CASE WHEN to_regprocedure('tests.dblink_connect(text, text)') IS NULL
            THEN tests.skip('liquidar_ruta: doble liquidación concurrente', 'dblink no disponible') END;
DO $$
DECLARE
  v_corte uuid;
  v_saldo numeric := (SELECT saldo_actual FROM public.cajas WHERE id = tests.id('caja_a1'));
BEGIN
  IF to_regprocedure('tests.dblink_connect(text, text)') IS NULL THEN RETURN; END IF;
  PERFORM tests.dblink_connect('s2', current_setting('tests.dblink_dsn'));
  CREATE TEMP TABLE conc (corte uuid, err text, saldo_caja numeric);
  -- Sesión 1: liquida y retiene los bloqueos hasta el COMMIT de este bloque.
  PERFORM tests.as_user(tests.id('sup_a'));
  v_corte := (public.liquidar_ruta(tests.id('cob_a'), ARRAY[tests.id('pago_a1'), tests.id('pago_a4')], tests.id('caja_a1')) ->> 'corte_id')::uuid;
  PERFORM tests.as_postgres();
  INSERT INTO conc (corte, saldo_caja) VALUES (v_corte, v_saldo);
  -- Sesión 2: la misma liquidación, en paralelo (queda esperando el bloqueo).
  PERFORM tests.dblink_send_query('s2', format($q$
    SET lock_timeout = '10s';
    SELECT set_config('request.jwt.claim.sub', %L, false);
    SET ROLE authenticated;
    SELECT public.liquidar_ruta(%L, ARRAY[%L, %L]::uuid[], %L)::text;
  $q$, tests.id('admin_a'), tests.id('cob_a'), tests.id('pago_a1'), tests.id('pago_a4'), tests.id('caja_a2')));
END $$;
-- (el DO anterior se confirmó: la sesión 2 ahora puede continuar)
DO $$
DECLARE
  r text;
  n int;
  i int := 0;
BEGIN
  IF to_regprocedure('tests.dblink_connect(text, text)') IS NULL THEN RETURN; END IF;
  -- Un resultado por sentencia enviada; el último es el de liquidar_ruta (o su error).
  LOOP
    i := i + 1;
    BEGIN
      SELECT count(*), max(x) INTO n, r FROM tests.dblink_get_result('s2') AS t(x text);
    EXCEPTION WHEN OTHERS THEN
      UPDATE conc SET err = SQLSTATE || ' ' || SQLERRM;
      EXIT;
    END;
    EXIT WHEN n = 0 OR i > 10;
    UPDATE conc SET err = 'sin error: ' || coalesce(r, 'null');
  END LOOP;
  PERFORM tests.dblink_disconnect('s2');
END $$;
SELECT CASE WHEN to_regprocedure('tests.dblink_connect(text, text)') IS NOT NULL THEN
  tests.ok((SELECT err FROM conc) LIKE '%ya fueron liquidados%', 'liquidación concurrente de los mismos pagos: la segunda falla',
           (SELECT err FROM conc)) END;
SELECT CASE WHEN to_regprocedure('tests.dblink_connect(text, text)') IS NOT NULL THEN
  tests.eq((SELECT count(*) FROM public.cortes WHERE cobrador_id = tests.id('cob_a')), 2::bigint, 'solo un corte nuevo') END;
-- Limpieza de lo confirmado.
DO $$
BEGIN
  IF to_regprocedure('tests.dblink_connect(text, text)') IS NULL THEN RETURN; END IF;
  UPDATE public.pagos SET corte_id = NULL WHERE corte_id = (SELECT corte FROM conc);
  DELETE FROM public.movimientos_caja WHERE concepto LIKE 'Liquidación ruta Cobrador A — 2 pagos%';
  DELETE FROM public.cortes WHERE id = (SELECT corte FROM conc);
  UPDATE public.profiles SET efectivo_en_mano = 500 WHERE id = tests.id('cob_a');
  UPDATE public.cajas SET saldo_actual = (SELECT saldo_caja FROM conc) WHERE id = tests.id('caja_a1');
  DROP TABLE conc;
END $$;
