-- prestamos_listado (20261027130000): lista de Préstamos en una sola llamada.
BEGIN;
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT count(*) FROM jsonb_array_elements(public.prestamos_listado(NULL, NULL, '2026-10-20'))), 1::bigint,
  'solo los préstamos de la empresa del usuario');
SELECT tests.eq((SELECT e->>'idPrestamo' || '|' || (e->>'cliente') || '|' || (e->>'ruta') || '|' || (e->>'cobrador') || '|' || (e->>'estado')
                 FROM jsonb_array_elements(public.prestamos_listado(NULL, NULL, '2026-10-20')) e),
  'PRE-0001|Cliente A|Ruta A|Cobrador A|Vencido', 'datos del préstamo y estado visual (atraso > días de gracia)');
SELECT tests.eq((SELECT (e->>'saldo')::numeric FROM jsonb_array_elements(public.prestamos_listado(NULL, NULL, '2026-10-20')) e),
  (SELECT saldo FROM public.prestamos_resumen(ARRAY[tests.id('pre_a')], '2026-10-20')),
  'el saldo coincide con prestamos_resumen');
SELECT tests.eq(public.prestamos_listado(ARRAY[tests.id('ruta_b')], NULL, '2026-10-20'), '[]'::jsonb, 'filtro por ruta');
SELECT tests.eq(public.prestamos_listado(NULL, tests.id('cob_b'), '2026-10-20'), '[]'::jsonb, 'filtro por cobrador');
SELECT tests.eq((SELECT count(*) FROM jsonb_array_elements(public.prestamos_listado('{}', tests.id('cob_a'), '2026-10-20'))), 1::bigint,
  'lista de rutas vacía = sin filtro de ruta');
ROLLBACK;

BEGIN;
SELECT tests.as_postgres();
UPDATE public.empresas SET dias_gracia = 999 WHERE id = tests.id('emp_a');
SELECT tests.as_user(tests.id('admin_a'));
SELECT tests.eq((SELECT e->>'estado' FROM jsonb_array_elements(public.prestamos_listado(NULL, NULL, '2026-10-20')) e), 'Activo',
  'dentro de los días de gracia: Activo');
ROLLBACK;
