-- Datos fijos (se cargan DESPUÉS de las migraciones, como superusuario, y se confirman).
-- Cada archivo de prueba corre en BEGIN ... ROLLBACK, así que todos parten de este estado.
-- Ids deterministas: tests.id('nombre') = md5('nombre')::uuid.
--
-- Empresa A: admin_a (admin), sup_a (supervisor de ruta_a), cob_a (cobrador, 10% comisión),
--            super (diego.leon@uniline.mx, sin user_roles), cajas caja_a1 / caja_a2, cliente cli_a,
--            préstamo pre_a (4 cuotas) y pagos pago_a1..pago_a4.
-- Empresa B: admin_b, cob_b, caja_b1, cli_b, pre_b (2 cuotas), pago_b1.
--
-- Saldos esperados (caja_saldos = pagos no anulados − desembolsos + movimientos manuales sin
-- las entradas de liquidación): caja_a1 = 450 − 1000 + 9950 = 9400; caja_a2 = 100 + 500 = 600;
-- caja_b1 = 600 − 1000 + 5000 = 4600.

SET client_min_messages = warning;

INSERT INTO tests.ids (nombre, id)
SELECT n, md5(n)::uuid
FROM unnest(ARRAY[
  'emp_a', 'emp_b', 'emp_c',
  'admin_a', 'sup_a', 'cob_a', 'admin_b', 'cob_b', 'super', 'sinemp',
  'caja_a1', 'caja_a2', 'caja_b1', 'ruta_a', 'ruta_b', 'cli_a', 'cli_b',
  'pre_a', 'pre_b', 'cuota_a1', 'cuota_a2', 'cuota_a3', 'cuota_a4', 'cuota_b1', 'cuota_b2',
  'corte_a', 'pago_a1', 'pago_a2', 'pago_a3', 'pago_a4', 'pago_b1',
  'cobx_a', 'sol_a', 'sol_b'
]) AS n;

INSERT INTO public.empresas (id, nombre, telefono, direccion)
VALUES (tests.id('emp_a'), 'Empresa A', '5550000001', 'Calle A 1'),
       (tests.id('emp_b'), 'Empresa B', '5550000002', 'Calle B 2'),
       (tests.id('emp_c'), 'Empresa C', NULL, NULL);

INSERT INTO auth.users (id, email)
VALUES (tests.id('admin_a'), 'admin.a@test.mx'),
       (tests.id('sup_a'), 'sup.a@test.mx'),
       (tests.id('cob_a'), 'cob.a@test.mx'),
       (tests.id('admin_b'), 'admin.b@test.mx'),
       (tests.id('cob_b'), 'cob.b@test.mx'),
       (tests.id('super'), 'diego.leon@uniline.mx'),
       (tests.id('sinemp'), 'sin.empresa@test.mx');

INSERT INTO public.profiles (id, empresa_id, nombre_completo, porcentaje_comision, efectivo_en_mano)
VALUES (tests.id('admin_a'), tests.id('emp_a'), 'Admin A', 0, 0),
       (tests.id('sup_a'), tests.id('emp_a'), 'Supervisor A', 0, 0),
       (tests.id('cob_a'), tests.id('emp_a'), 'Cobrador A', 10, 500),
       (tests.id('admin_b'), tests.id('emp_b'), 'Admin B', 0, 0),
       (tests.id('cob_b'), tests.id('emp_b'), 'Cobrador B', 5, 0),
       (tests.id('super'), tests.id('emp_a'), 'Super Admin', 0, 0),
       (tests.id('sinemp'), NULL, 'Sin Empresa', 0, 0);

INSERT INTO public.user_roles (user_id, role)
VALUES (tests.id('admin_a'), 'admin'),
       (tests.id('sup_a'), 'supervisor'),
       (tests.id('cob_a'), 'cobrador'),
       (tests.id('admin_b'), 'admin'),
       (tests.id('cob_b'), 'cobrador');

INSERT INTO public.cobradores (id, empresa_id, nombre, porcentaje_comision, efectivo_en_mano)
VALUES (tests.id('cobx_a'), tests.id('emp_a'), 'Cobrador externo A', 0, 0);

INSERT INTO public.cajas (id, empresa_id, nombre, saldo_actual)
VALUES (tests.id('caja_a1'), tests.id('emp_a'), 'Caja A1', 0),
       (tests.id('caja_a2'), tests.id('emp_a'), 'Caja A2', 0),
       (tests.id('caja_b1'), tests.id('emp_b'), 'Caja B1', 0);

INSERT INTO public.rutas (id, empresa_id, nombre, cobrador_id)
VALUES (tests.id('ruta_a'), tests.id('emp_a'), 'Ruta A', tests.id('cob_a')),
       (tests.id('ruta_b'), tests.id('emp_b'), 'Ruta B', tests.id('cob_b'));

INSERT INTO public.supervisor_rutas (ruta_id, supervisor_id)
VALUES (tests.id('ruta_a'), tests.id('sup_a'));

INSERT INTO public.clientes (id, empresa_id, id_cliente, nombre_completo, telefono, gps_lat, gps_lng)
VALUES (tests.id('cli_a'), tests.id('emp_a'), 'CLI-0007', 'Cliente A', '5551112222', 19.4, -99.1),
       (tests.id('cli_b'), tests.id('emp_b'), 'CLI-0001', 'Cliente B', '5553334444', 20.6, -103.3);

INSERT INTO public.prestamos (id, id_prestamo, empresa_id, cliente_id, caja_id, ruta_id, cobrador_id, generado_por,
                              monto_solicitado, monto_total_pagar, frecuencia, modalidad, num_cuotas, tasa_interes,
                              fecha_registro, estado)
VALUES (tests.id('pre_a'), 'PRE-0001', tests.id('emp_a'), tests.id('cli_a'), tests.id('caja_a1'), tests.id('ruta_a'),
        tests.id('cob_a'), tests.id('admin_a'), 1000, 1200, 'semanal', 'fijo', 4, 20, '2026-09-01', 'Activo'),
       (tests.id('pre_b'), 'PRE-0002', tests.id('emp_b'), tests.id('cli_b'), tests.id('caja_b1'), tests.id('ruta_b'),
        tests.id('cob_b'), tests.id('admin_b'), 1000, 1200, 'semanal', 'fijo', 2, 20, '2026-09-01', 'Activo');

INSERT INTO public.amortizacion (id, prestamo_id, empresa_id, num_cuota, fecha_vencimiento, capital, interes, capital_interes,
                                 saldo_capital, saldo_interes, saldo_mora, mora, saldo_total, status)
VALUES (tests.id('cuota_a1'), tests.id('pre_a'), tests.id('emp_a'), 1, '2026-09-08', 250, 50, 300, 250, 50, 20, 20, 320, 'Vencida'),
       (tests.id('cuota_a2'), tests.id('pre_a'), tests.id('emp_a'), 2, '2026-09-15', 250, 50, 300, 250, 50, 0, 0, 300, 'Pendiente'),
       (tests.id('cuota_a3'), tests.id('pre_a'), tests.id('emp_a'), 3, '2026-10-20', 250, 50, 300, 250, 50, 0, 0, 300, 'Pendiente'),
       (tests.id('cuota_a4'), tests.id('pre_a'), tests.id('emp_a'), 4, '2026-10-27', 250, 50, 300, 250, 50, 0, 0, 300, 'Pendiente'),
       (tests.id('cuota_b1'), tests.id('pre_b'), tests.id('emp_b'), 1, '2026-09-08', 500, 100, 600, 500, 100, 30, 30, 630, 'Vencida'),
       (tests.id('cuota_b2'), tests.id('pre_b'), tests.id('emp_b'), 2, '2026-10-20', 500, 100, 600, 500, 100, 0, 0, 600, 'Pendiente');

INSERT INTO public.movimientos_caja (caja_id, empresa_id, tipo, monto, concepto, prestamo_id, created_at)
VALUES (tests.id('caja_a1'), tests.id('emp_a'), 'entrada', 10000, 'Depósito inicial', NULL, '2026-08-01 10:00-06'),
       (tests.id('caja_a2'), tests.id('emp_a'), 'entrada', 500, 'Depósito inicial', NULL, '2026-08-01 10:00-06'),
       (tests.id('caja_b1'), tests.id('emp_b'), 'entrada', 5000, 'Depósito inicial', NULL, '2026-08-01 10:00-06'),
       (tests.id('caja_a1'), tests.id('emp_a'), 'salida', 1000, 'Desembolso préstamo', tests.id('pre_a'), '2026-09-01 10:00-06'),
       (tests.id('caja_b1'), tests.id('emp_b'), 'salida', 1000, 'Desembolso préstamo', tests.id('pre_b'), '2026-09-01 10:00-06'),
       (tests.id('caja_a1'), tests.id('emp_a'), 'entrada', 150, 'Liquidación ruta Cobrador A — 1 pagos hasta 14/09/2026', NULL, '2026-09-14 18:00-06'),
       (tests.id('caja_a1'), tests.id('emp_a'), 'salida', 50, '[Oficina] Papelería', NULL, '2026-09-20 10:00-06');

INSERT INTO public.cortes (id, empresa_id, caja_id, cobrador_id, total_cobrado, monto_efectivo, monto_depositado)
VALUES (tests.id('corte_a'), tests.id('emp_a'), tests.id('caja_a1'), tests.id('cob_a'), 150, 150, 150);

INSERT INTO public.pagos (id, prestamo_id, empresa_id, caja_id, cobrador_id, ruta_id, cuota_id, monto_recibido, metodo_pago,
                          fecha_pago, created_at, anulado, corte_id, aplicado_capital, aplicado_interes, aplicado_mora)
VALUES (tests.id('pago_a1'), tests.id('pre_a'), tests.id('emp_a'), tests.id('caja_a1'), tests.id('cob_a'), tests.id('ruta_a'),
        tests.id('cuota_a1'), 300, 'Efectivo', '2026-09-15', '2026-09-15 23:30-06', false, NULL, 250, 50, 0),
       (tests.id('pago_a2'), tests.id('pre_a'), tests.id('emp_a'), tests.id('caja_a1'), tests.id('cob_a'), tests.id('ruta_a'),
        tests.id('cuota_a1'), 200, 'Efectivo', '2026-09-10', '2026-09-10 12:00-06', true, NULL, 200, 0, 0),
       (tests.id('pago_a3'), tests.id('pre_a'), tests.id('emp_a'), tests.id('caja_a1'), tests.id('cob_a'), tests.id('ruta_a'),
        tests.id('cuota_a1'), 150, 'Transferencia', '2026-09-14', '2026-09-14 10:00-06', false, tests.id('corte_a'), 100, 50, 0),
       (tests.id('pago_a4'), tests.id('pre_a'), tests.id('emp_a'), tests.id('caja_a2'), tests.id('cob_a'), tests.id('ruta_a'),
        tests.id('cuota_a2'), 100, 'Efectivo', '2026-09-16', '2026-09-16 09:00-06', false, NULL, 80, 20, 0),
       (tests.id('pago_b1'), tests.id('pre_b'), tests.id('emp_b'), tests.id('caja_b1'), tests.id('cob_b'), tests.id('ruta_b'),
        tests.id('cuota_b1'), 600, 'Efectivo', '2026-09-15', '2026-09-15 12:00-06', false, NULL, 500, 100, 0);

INSERT INTO public.promesas_pago (prestamo_id, cuota_id, empresa_id, monto_prometido, fecha_prometida, status)
VALUES (tests.id('pre_a'), tests.id('cuota_a2'), tests.id('emp_a'), 300, '2026-10-01', 'Pendiente'),
       (tests.id('pre_b'), tests.id('cuota_b1'), tests.id('emp_b'), 600, '2026-10-01', 'Pendiente');

INSERT INTO public.crm_gestiones (prestamo_id, cliente_id, empresa_id, tipo_gestion, resultado, created_at)
VALUES (tests.id('pre_a'), tests.id('cli_a'), tests.id('emp_a'), 'Visita', 'sin_contacto', '2026-09-20 10:00-06'),
       (tests.id('pre_b'), tests.id('cli_b'), tests.id('emp_b'), 'Visita', 'sin_contacto', '2026-09-21 10:00-06');

INSERT INTO public.solicitudes_prestamo (id, empresa_id, cliente_id, monto_solicitado, num_cuotas, modalidad, status)
VALUES (tests.id('sol_a'), tests.id('emp_a'), tests.id('cli_a'), 500, 2, 'fijo', 'Pendiente'),
       (tests.id('sol_b'), tests.id('emp_b'), tests.id('cli_b'), 500, 2, 'fijo', 'Pendiente');

ANALYZE;
