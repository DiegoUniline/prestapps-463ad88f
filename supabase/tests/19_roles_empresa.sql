-- has_role por empresa (20261013100000): el rol solo cuenta en la empresa actual del usuario;
-- el super admin conserva admin en cualquier empresa.
BEGIN;
SELECT tests.as_postgres();

SELECT tests.eq((SELECT count(*) FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
                  WHERE ur.empresa_id IS DISTINCT FROM p.empresa_id), 0::bigint,
                'trigger: user_roles.empresa_id = empresa del perfil al insertar');
SELECT tests.eq(public.has_role(tests.id('admin_a'), 'admin'), true, 'admin de A es admin (en A)');
SELECT tests.eq(public.has_role(tests.id('admin_a'), 'supervisor'), false, 'admin de A no es supervisor');
SELECT tests.eq(public.has_role(tests.id('cob_a'), 'admin'), false, 'cobrador no es admin');

-- Rol registrado en otra empresa: no cuenta.
INSERT INTO public.user_roles (user_id, role, empresa_id) VALUES (tests.id('cob_a'), 'admin', tests.id('emp_b'));
SELECT tests.eq(public.has_role(tests.id('cob_a'), 'admin'), false, 'rol admin registrado en B no cuenta mientras el usuario está en A');

UPDATE public.user_roles SET empresa_id = tests.id('emp_b') WHERE user_id = tests.id('sup_a');
SELECT tests.as_user(tests.id('sup_a'));
SELECT tests.throws(format('SELECT public.liquidar_ruta(%L, ARRAY[%L]::uuid[], %L)', tests.id('cob_a'), tests.id('pago_a1'), tests.id('caja_a1')),
                    '42501', '%permiso%', 'liquidar_ruta: rol de supervisor de otra empresa no autoriza');
SELECT tests.as_postgres();
UPDATE public.user_roles SET empresa_id = tests.id('emp_a') WHERE user_id = tests.id('sup_a');

-- Mover a un usuario de empresa: sus roles lo siguen.
UPDATE public.profiles SET empresa_id = tests.id('emp_b') WHERE id = tests.id('cob_a');
SELECT tests.eq((SELECT array_agg(DISTINCT empresa_id) FROM public.user_roles WHERE user_id = tests.id('cob_a')), ARRAY[tests.id('emp_b')],
                'trigger: al cambiar profiles.empresa_id los roles del usuario se mueven');
SELECT tests.eq(public.has_role(tests.id('cob_a'), 'cobrador'), true, 'el cobrador sigue siendo cobrador en la nueva empresa');

-- Super admin: sin filas en user_roles, admin en cualquier empresa.
SELECT tests.eq(public.has_role(tests.id('super'), 'admin'), true, 'super admin es admin sin user_roles');
SELECT tests.eq(public.has_role(tests.id('super'), 'supervisor'), false, 'super admin no obtiene otros roles por el correo');
INSERT INTO public.user_roles (user_id, role) VALUES (tests.id('super'), 'supervisor');
SELECT tests.as_user(tests.id('super'));
SELECT public.switch_empresa(tests.id('emp_b')) \g /dev/null
SELECT tests.as_postgres();
SELECT tests.eq((SELECT empresa_id FROM public.user_roles WHERE user_id = tests.id('super')), tests.id('emp_a'),
                'los roles del super admin no se mueven con switch_empresa');
SELECT tests.eq(public.has_role(tests.id('super'), 'admin'), true, 'super admin conserva admin tras cambiar a B');
SELECT tests.eq(public.has_role(tests.id('super'), 'supervisor'), false, 'su rol de supervisor (de A) no cuenta en B');
SELECT tests.as_user(tests.id('super'));
SELECT tests.lives(format('SELECT public.liquidar_ruta(%L, ARRAY[%L]::uuid[], %L)', tests.id('cob_b'), tests.id('pago_b1'), tests.id('caja_b1')),
                   'super admin puede liquidar rutas en la empresa que está viendo');
SELECT public.switch_empresa(tests.id('emp_a')) \g /dev/null
SELECT tests.eq(public.has_role(tests.id('super'), 'supervisor'), true, 'de vuelta en A recupera supervisor');

-- Correo en mayúsculas sigue identificando al super admin.
SELECT tests.as_postgres();
UPDATE auth.users SET email = 'Diego.Leon@Uniline.MX' WHERE id = tests.id('super');
SELECT tests.eq(public.has_role(tests.id('super'), 'admin'), true, 'has_role compara el correo del super admin sin distinguir mayúsculas');
ROLLBACK;
