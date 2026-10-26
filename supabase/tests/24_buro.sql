-- Buró (20261026120000): la consulta y su autorización sobreviven al borrado del cliente; tipo_persona acotado.
BEGIN;
SELECT tests.as_postgres();
INSERT INTO tests.ids VALUES ('cli_buro', gen_random_uuid()), ('consulta_buro', gen_random_uuid());

INSERT INTO public.clientes (id, empresa_id, id_cliente, nombre_completo, tipo_persona, rfc, nombres, apellido_paterno, curp)
VALUES (tests.id('cli_buro'), tests.id('emp_a'), 'CLI-0900', 'Jose Perez', 'fisica', 'PEXJ800107AB1', 'Jose', 'Perez', 'PEXJ800107HDFRSS09');
INSERT INTO public.buro_consultas (id, empresa_id, cliente_id, tipo_persona, rfc, estatus, autorizacion_fecha, autorizacion_path)
VALUES (tests.id('consulta_buro'), tests.id('emp_a'), tests.id('cli_buro'), 'fisica', 'PEXJ800107AB1', 'exitosa', '2026-10-01',
        tests.id('emp_a') || '/x/aut.pdf');

DELETE FROM public.clientes WHERE id = tests.id('cli_buro');
SELECT tests.eq((SELECT cliente_id FROM public.buro_consultas WHERE id = tests.id('consulta_buro')), NULL::uuid,
                'borrar cliente: la consulta queda con cliente_id NULL');
SELECT tests.eq((SELECT autorizacion_path FROM public.buro_consultas WHERE id = tests.id('consulta_buro')), tests.id('emp_a') || '/x/aut.pdf',
                'borrar cliente: se conserva la autorización');

SELECT tests.throws(format('INSERT INTO public.buro_consultas (empresa_id, tipo_persona, rfc, autorizacion_fecha) VALUES (%L, %L, %L, %L)',
                           tests.id('emp_a'), 'otro', 'X', '2026-10-01'),
                    '23514', '%tipo_persona%', 'buro_consultas.tipo_persona solo fisica/moral');
SELECT tests.lives($$UPDATE public.circulo_config SET api_url_pf = 'https://x' WHERE id = 1$$, 'circulo_config.api_url_pf existe');
ROLLBACK;
