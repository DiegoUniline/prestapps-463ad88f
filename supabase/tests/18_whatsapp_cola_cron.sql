-- Cola de WhatsApp (RLS, privilegios de columna, claim/resultado/liberar) y cron_claim.
BEGIN;

-- ── RLS / privilegios del cliente ──
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.lives(format($$INSERT INTO public.whatsapp_cola (empresa_id, telefono, tipo, mensaje) VALUES (%L, '5215551112222', 'recibo', 'Hola')$$,
                          tests.id('emp_a')), 'authenticated encola un mensaje de su empresa');
SELECT tests.throws(format($$INSERT INTO public.whatsapp_cola (empresa_id, telefono, mensaje) VALUES (%L, '5215551112222', 'Hola')$$, tests.id('emp_b')),
                    '42501', '%row-level security%', 'no puede encolar para otra empresa');
SELECT tests.throws(format($$INSERT INTO public.whatsapp_cola (empresa_id, telefono, mensaje, estado) VALUES (%L, '5215551112222', 'Hola', 'enviado')$$, tests.id('emp_a')),
                    '42501', '%permission denied%', 'no puede fijar estado al encolar');
SELECT tests.throws(format($$INSERT INTO public.whatsapp_cola (empresa_id, telefono, mensaje, intentos) VALUES (%L, '5215551112222', 'Hola', 99)$$, tests.id('emp_a')),
                    '42501', '%permission denied%', 'no puede fijar intentos al encolar');
SELECT tests.throws(format($$INSERT INTO public.whatsapp_cola (empresa_id, telefono, mensaje, creado_por) VALUES (%L, '5215551112222', 'Hola', %L)$$,
                           tests.id('emp_a'), tests.id('sup_a')),
                    '42501', '%permission denied%', 'no puede suplantar creado_por');
SELECT tests.throws($$UPDATE public.whatsapp_cola SET estado = 'enviado'$$, '42501', '%permission denied%', 'no puede cambiar el estado de la cola');
SELECT tests.throws($$DELETE FROM public.whatsapp_cola$$, '42501', '%permission denied%', 'no puede borrar de la cola');
SELECT tests.throws(format($$INSERT INTO public.whatsapp_cola (empresa_id, telefono, mensaje, media_url, media_tipo) VALUES (%L, '5215551112222', 'x', 'http://x/y.pdf', 'file')$$, tests.id('emp_a')),
                    '23514', NULL, 'media_url debe ser https');
SELECT tests.throws(format($$INSERT INTO public.whatsapp_cola (empresa_id, telefono, mensaje) VALUES (%L, '5215551112222', '  ')$$, tests.id('emp_a')),
                    '23514', NULL, 'mensaje vacío sin media rechazado');
SELECT tests.throws(format($$INSERT INTO public.whatsapp_cola (empresa_id, telefono, mensaje) VALUES (%L, '123', 'x')$$, tests.id('emp_a')),
                    '23514', NULL, 'teléfono demasiado corto rechazado');

SELECT tests.as_postgres();
INSERT INTO public.whatsapp_cola (empresa_id, telefono, mensaje) VALUES (tests.id('emp_b'), '5215553334444', 'De B');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT array_agg(estado || ':' || intentos || ':' || (creado_por = tests.id('admin_a'))::text) FROM public.whatsapp_cola),
                ARRAY['pendiente:0:true'], 'solo ve su empresa; estado/intentos/creado_por por defecto');
SELECT tests.throws('SELECT * FROM public.whatsapp_cola_claim(10)', '42501', NULL, 'authenticated no puede reclamar la cola');
ROLLBACK;

-- ── claim / resultado / liberar (service_role) ──
BEGIN;
SELECT tests.as_postgres();
INSERT INTO public.whatsapp_cola (id, empresa_id, telefono, mensaje, estado, intentos, proximo_intento, created_at) VALUES
  ('00000000-0000-0000-0000-00000000aa01', tests.id('emp_a'), '5215550000001', 'q1', 'pendiente', 0, now() - interval '1 min', now() - interval '3 min'),
  ('00000000-0000-0000-0000-00000000aa02', tests.id('emp_a'), '5215550000002', 'q2', 'pendiente', 0, now(), now() - interval '2 min'),
  ('00000000-0000-0000-0000-00000000aa03', tests.id('emp_b'), '5215550000003', 'q3', 'pendiente', 0, now(), now()),
  ('00000000-0000-0000-0000-00000000aa04', tests.id('emp_a'), '5215550000004', 'q4', 'pendiente', 1, now() + interval '5 min', now()),
  ('00000000-0000-0000-0000-00000000aa05', tests.id('emp_a'), '5215550000005', 'q5', 'enviando', 6, now() - interval '1 min', now()),
  ('00000000-0000-0000-0000-00000000aa06', tests.id('emp_a'), '5215550000006', 'q6', 'enviando', 2, now() - interval '1 min', now() - interval '1 min'),
  ('00000000-0000-0000-0000-00000000aa07', tests.id('emp_a'), '5215550000007', 'q7', 'enviado', 1, now() - interval '1 min', now()),
  ('00000000-0000-0000-0000-00000000aa08', tests.id('emp_a'), '5215550000008', 'q8', 'enviando', 1, now() + interval '9 min', now());

SELECT tests.as_service();
CREATE TEMP TABLE c1 AS SELECT * FROM public.whatsapp_cola_claim(10, tests.id('emp_a'));
SELECT tests.eq((SELECT array_agg(mensaje ORDER BY mensaje) FROM c1), ARRAY['q1', 'q2', 'q6'],
                'claim: pendientes vencidas + "enviando" con lease expirado, solo de la empresa pedida');
SELECT tests.eq((SELECT array_agg(DISTINCT estado || ':' || (proximo_intento = now() + interval '10 minutes')::text) FROM c1),
                ARRAY['enviando:true'], 'claim: quedan "enviando" con lease de 10 min');
SELECT tests.eq((SELECT array_agg(mensaje || ':' || intentos ORDER BY mensaje) FROM c1), ARRAY['q1:1', 'q2:1', 'q6:3'], 'claim: cuenta un intento');
SELECT tests.eq((SELECT estado || ':' || ultimo_error FROM public.whatsapp_cola WHERE mensaje = 'q5'), 'error:Sin confirmación de envío',
                'claim: "enviando" con 6 intentos y lease vencido pasa a error');
SELECT tests.eq((SELECT count(*) FROM public.whatsapp_cola_claim(10, tests.id('emp_a'))), 0::bigint, 'claim inmediato: nada (lease vigente)');
SELECT tests.eq((SELECT array_agg(mensaje) FROM public.whatsapp_cola_claim(0)), ARRAY['q3'], 'claim sin empresa toma otras empresas; límite mínimo 1');

SELECT tests.eq(public.whatsapp_cola_resultado('00000000-0000-0000-0000-00000000aa01', true), 'enviado', 'resultado ok → enviado');
SELECT tests.eq((SELECT (enviado_at IS NOT NULL)::text || ':' || coalesce(ultimo_error, '-') FROM public.whatsapp_cola WHERE mensaje = 'q1'),
                'true:-', 'enviado_at fijado y sin error');
SELECT tests.eq(public.whatsapp_cola_resultado('00000000-0000-0000-0000-00000000aa01', false, 'tarde'), NULL,
                'resultado sobre una fila que ya no está "enviando": sin efecto');
SELECT tests.eq(public.whatsapp_cola_resultado('00000000-0000-0000-0000-00000000aa02', false, 'timeout'), 'pendiente',
                'resultado fallido transitorio → pendiente');
SELECT tests.eq((SELECT proximo_intento - now() FROM public.whatsapp_cola WHERE mensaje = 'q2'), interval '2 minutes',
                'backoff tras el 1.er intento: 2 min');
SELECT tests.eq(public.whatsapp_cola_resultado('00000000-0000-0000-0000-00000000aa06', false, 'x'), 'pendiente', 'q6 (3 intentos) → pendiente');
SELECT tests.eq((SELECT proximo_intento - now() FROM public.whatsapp_cola WHERE mensaje = 'q6'), interval '8 minutes', 'backoff tras 3 intentos: 8 min');
SELECT tests.eq(public.whatsapp_cola_resultado('00000000-0000-0000-0000-00000000aa08', false, 'número inválido', true), 'error',
                'error permanente → error sin reintento');
SELECT tests.as_postgres();
UPDATE public.whatsapp_cola SET estado = 'enviando', intentos = 6 WHERE mensaje = 'q4';
SELECT tests.as_service();
SELECT tests.eq(public.whatsapp_cola_resultado('00000000-0000-0000-0000-00000000aa04', false, 'x'), 'error', 'al 6.º intento fallido → error');
SELECT tests.eq(public.whatsapp_cola_resultado('00000000-0000-0000-0000-00000000aa03', false, repeat('e', 2000)), 'pendiente', 'q3 → pendiente');
SELECT tests.eq((SELECT length(ultimo_error) FROM public.whatsapp_cola WHERE mensaje = 'q3'), 1000, 'ultimo_error truncado a 1000');

SELECT tests.as_postgres();
UPDATE public.whatsapp_cola SET estado = 'enviando', intentos = 2 WHERE mensaje = 'q2';
SELECT tests.as_service();
SELECT tests.eq(public.whatsapp_cola_liberar(ARRAY['00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-00000000aa07']::uuid[]), 1,
                'liberar: solo filas "enviando"');
SELECT tests.eq((SELECT estado || ':' || intentos || ':' || (proximo_intento = now())::text FROM public.whatsapp_cola WHERE mensaje = 'q2'),
                'pendiente:1:true', 'liberar devuelve a pendiente sin contar el intento');
ROLLBACK;

-- ── cron_claim ──
BEGIN;
SELECT tests.as_service();
SELECT tests.eq(public.cron_claim('whatsapp-cron', 60), true, 'cron_claim: primera ejecución permitida');
SELECT tests.eq(public.cron_claim('whatsapp-cron', 60), false, 'cron_claim: segunda dentro del intervalo rechazada');
SELECT tests.eq(public.cron_claim('otro-job', 60), true, 'cron_claim: otro nombre es independiente');
SELECT tests.eq(public.cron_claim('', 1), false, 'cron_claim: nombre vacío → false');
SELECT tests.eq(public.cron_claim(NULL, 1), false, 'cron_claim: nombre nulo → false');
SELECT tests.as_postgres();
UPDATE public.cron_runs SET ultimo = now() - interval '59 minutes' WHERE nombre = 'whatsapp-cron';
SELECT tests.as_service();
SELECT tests.eq(public.cron_claim('whatsapp-cron', 60), false, 'cron_claim: 59 min después sigue rechazada');
SELECT tests.as_postgres();
UPDATE public.cron_runs SET ultimo = now() - interval '61 minutes' WHERE nombre = 'whatsapp-cron';
SELECT tests.as_service();
SELECT tests.eq(public.cron_claim('whatsapp-cron', 60), true, 'cron_claim: pasado el intervalo vuelve a permitir');
SELECT tests.eq(public.cron_claim('whatsapp-cron', 60), false, 'cron_claim: y vuelve a bloquear');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.throws($$SELECT public.cron_claim('whatsapp-cron', 0)$$, '42501', NULL, 'authenticated no puede ejecutar cron_claim');
ROLLBACK;

-- ── SKIP LOCKED entre sesiones (dblink) ──
SELECT CASE WHEN to_regprocedure('tests.dblink_connect(text, text)') IS NULL
            THEN tests.skip('whatsapp_cola_claim: SKIP LOCKED entre sesiones', 'dblink no disponible') END;
DO $$
BEGIN
  IF to_regprocedure('tests.dblink_connect(text, text)') IS NULL THEN RETURN; END IF;
  INSERT INTO public.whatsapp_cola (id, empresa_id, telefono, mensaje, created_at) VALUES
    ('00000000-0000-0000-0000-00000000bb01', tests.id('emp_c'), '5215550000011', 'k1', now() - interval '1 min'),
    ('00000000-0000-0000-0000-00000000bb02', tests.id('emp_c'), '5215550000012', 'k2', now());
  PERFORM tests.dblink_connect('otra', current_setting('tests.dblink_dsn'));
END $$;
BEGIN;
SELECT 1 FROM public.whatsapp_cola WHERE id = '00000000-0000-0000-0000-00000000bb01' FOR UPDATE \g /dev/null
SELECT CASE WHEN to_regprocedure('tests.dblink_connect(text, text)') IS NOT NULL THEN
  tests.eq((SELECT array_agg(m) FROM tests.dblink('otra', format(
              $q$SET lock_timeout = '2s'; SET ROLE service_role; SELECT mensaje FROM public.whatsapp_cola_claim(10, %L)$q$,
              tests.id('emp_c'))) AS t(m text)),
           ARRAY['k2'], 'whatsapp_cola_claim salta (SKIP LOCKED) la fila bloqueada por otro proceso sin esperar') END;
ROLLBACK;
DO $$
BEGIN
  IF to_regprocedure('tests.dblink_connect(text, text)') IS NULL THEN RETURN; END IF;
  PERFORM tests.dblink_disconnect('otra');
  DELETE FROM public.whatsapp_cola WHERE empresa_id = tests.id('emp_c');
END $$;
