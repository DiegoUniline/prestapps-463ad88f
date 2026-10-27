-- Cobranza Diaria: la lista del día armada en el servidor. Antes el navegador descargaba todas las
-- cuotas vencidas con préstamo, cliente, ruta, caja y pagos embebidos por cuota, más perfiles y
-- gestiones aparte. Mismo criterio que hacía CobranzaDiariaPage:
--   cuotas que vencen en p_fecha, vencidas sin pagar, pagadas en p_fecha
--   + cuotas con promesa pendiente para p_fecha.
-- Devuelve un arreglo JSON con los campos de CuotaDiaria (camelCase).
CREATE OR REPLACE FUNCTION public.cobranza_diaria(p_fecha date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_emp uuid := public.get_user_empresa_id();
BEGIN
  IF v_emp IS NULL OR p_fecha IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    WITH ids AS (
      SELECT a.id
      FROM amortizacion a
      WHERE a.empresa_id = v_emp
        AND (a.fecha_vencimiento = p_fecha
             OR (a.fecha_vencimiento < p_fecha AND a.status <> 'Pagada')
             OR a.fecha_pagada = p_fecha)
      UNION
      SELECT pp.cuota_id
      FROM promesas_pago pp
      WHERE pp.empresa_id = v_emp AND pp.fecha_prometida = p_fecha AND pp.status = 'Pendiente'
        AND pp.cuota_id IS NOT NULL
    ),
    cu AS (
      SELECT a.*
      FROM amortizacion a
      JOIN ids ON ids.id = a.id
      WHERE a.empresa_id = v_emp
    ),
    pg AS (
      SELECT p.cuota_id, sum(coalesce(p.monto_recibido, 0)) AS total
      FROM pagos p
      JOIN cu ON cu.id = p.cuota_id
      WHERE p.empresa_id = v_emp AND coalesce(p.anulado, false) = false
      GROUP BY p.cuota_id
    ),
    ge AS (
      SELECT g.prestamo_id, count(*) AS n, max(g.created_at) AS ultima
      FROM crm_gestiones g
      WHERE g.empresa_id = v_emp
        AND g.prestamo_id IN (SELECT DISTINCT cu.prestamo_id FROM cu)
      GROUP BY g.prestamo_id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'cuotaId', cu.id,
      'prestamoId', cu.prestamo_id,
      'clienteNombre', coalesce(cl.nombre_completo, '—'),
      'clienteFoto', cl.foto_cliente,
      'clienteId', coalesce(pr.cliente_id::text, ''),
      'numCuota', cu.num_cuota,
      'totalCuotas', coalesce(pr.num_cuotas, 0),
      'montoSolicitado', coalesce(pr.monto_solicitado, 0),
      'capitalInteres', coalesce(cu.capital_interes, 0),
      'saldoTotal', coalesce(cu.saldo_total, 0),
      'saldoMora', coalesce(cu.saldo_mora, 0),
      'saldoCapital', coalesce(cu.saldo_capital, 0),
      'saldoInteres', coalesce(cu.saldo_interes, 0),
      'moraPagada', coalesce(cu.mora_pagada, 0),
      'interesPagado', coalesce(cu.interes_pagado, 0),
      'capitalPagado', coalesce(cu.capital_pagado, 0),
      'fechaVencimiento', cu.fecha_vencimiento,
      'status', coalesce(cu.status::text, 'Pendiente'),
      'diasAtraso', coalesce(cu.dias_atraso, 0),
      'ruta', coalesce(ru.nombre, 'Sin ruta'),
      'rutaId', pr.ruta_id,
      'cobrador', CASE WHEN pr.cobrador_id IS NULL THEN 'Sin asignar' ELSE coalesce(pf.nombre_completo, '—') END,
      'cobradorId', pr.cobrador_id,
      'caja', coalesce(cj.nombre, '—'),
      'cajaId', pr.caja_id,
      'pagada', cu.status::text = 'Pagada',
      'montoPagado', coalesce(pg.total, 0),
      'fechaPago', cu.fecha_pagada,
      'gestiones', coalesce(ge.n, 0),
      'ultimaGestion', ge.ultima,
      'tipoCuenta', coalesce(pr.tipo_cuenta::text, 'prestamo')
    ) ORDER BY cu.fecha_vencimiento, cu.num_cuota), '[]'::jsonb)
    FROM cu
    LEFT JOIN prestamos pr ON pr.id = cu.prestamo_id
    LEFT JOIN clientes cl ON cl.id = pr.cliente_id
    LEFT JOIN rutas ru ON ru.id = pr.ruta_id
    LEFT JOIN cajas cj ON cj.id = pr.caja_id
    LEFT JOIN profiles pf ON pf.id = pr.cobrador_id
    LEFT JOIN pg ON pg.cuota_id = cu.id
    LEFT JOIN ge ON ge.prestamo_id = cu.prestamo_id
  );
END $$;

REVOKE ALL ON FUNCTION public.cobranza_diaria(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cobranza_diaria(date) TO authenticated;
