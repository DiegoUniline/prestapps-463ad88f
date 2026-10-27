-- Vista del cobrador: tres cálculos que el celular hacía descargando tablas completas.
-- Mismo criterio que src/pages/cobrador-view/hooks.ts. Todas SECURITY INVOKER + empresa_id = get_user_empresa_id().

-- 1) Cobranza del rango (useCobranzaRango). p_cobrador NULL = toda la empresa.
--    Cuotas del rango, vencidas sin pagar y pagadas en el rango; con cobrador, también las cuotas
--    ya tocadas de los préstamos con pagos en el rango. Los pagos del rango por préstamo se reparten
--    en cuotas sin pago directo (pagadas en el rango o parciales), en orden de vencimiento.
CREATE OR REPLACE FUNCTION public.cobrador_cobranza(p_desde date, p_hasta date, p_cobrador uuid DEFAULT NULL)
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
  v_rest jsonb;
  v_out jsonb := '[]'::jsonb;
  r record;
  v_monto numeric;
  v_disp numeric;
  v_ref numeric;
  v_en_rango boolean;
BEGIN
  IF v_emp IS NULL OR p_desde IS NULL OR p_hasta IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Pagos del rango por préstamo
  SELECT coalesce(jsonb_object_agg(x.prestamo_id, x.total), '{}'::jsonb) INTO v_rest
  FROM (
    SELECT pg.prestamo_id, sum(coalesce(pg.monto_recibido, 0)) AS total
    FROM pagos pg
    JOIN prestamos p ON p.id = pg.prestamo_id
    WHERE pg.empresa_id = v_emp AND pg.anulado = false
      AND pg.fecha_pago >= p_desde AND pg.fecha_pago <= p_hasta
      AND pg.prestamo_id IS NOT NULL
      AND (p_cobrador IS NULL OR (pg.cobrador_id = p_cobrador AND p.cobrador_id = p_cobrador AND p.empresa_id = v_emp))
    GROUP BY pg.prestamo_id
  ) x;

  FOR r IN
    WITH base AS (
      SELECT a.*
      FROM amortizacion a
      JOIN prestamos p ON p.id = a.prestamo_id
      WHERE (CASE WHEN p_cobrador IS NULL THEN a.empresa_id = v_emp
                  ELSE p.empresa_id = v_emp AND p.cobrador_id = p_cobrador END)
    ),
    sel AS (
      SELECT b.id FROM base b
      WHERE (b.fecha_vencimiento >= p_desde AND b.fecha_vencimiento <= p_hasta)
         OR (b.fecha_vencimiento < p_desde AND b.status <> 'Pagada')
         OR (b.fecha_pagada >= p_desde AND b.fecha_pagada <= p_hasta)
      UNION
      SELECT b.id FROM base b
      WHERE p_cobrador IS NOT NULL
        AND v_rest ? b.prestamo_id::text
        AND (b.status IN ('Pagada', 'Parcial') OR b.capital_pagado > 0 OR b.interes_pagado > 0 OR b.mora_pagada > 0)
    )
    SELECT b.*, p.num_cuotas, p.cliente_id, p.ruta_id, p.cobrador_id, p.caja_id,
           cl.nombre_completo AS cliente_nombre, cl.telefono, cl.direccion, cl.gps_lat, cl.gps_lng,
           ru.nombre AS ruta_nombre,
           (SELECT coalesce(sum(pg.monto_recibido), 0) FROM pagos pg
             WHERE pg.cuota_id = b.id AND coalesce(pg.anulado, false) = false) AS pagado_cuota
    FROM base b
    JOIN sel ON sel.id = b.id
    JOIN prestamos p ON p.id = b.prestamo_id
    LEFT JOIN clientes cl ON cl.id = p.cliente_id
    LEFT JOIN rutas ru ON ru.id = p.ruta_id
    ORDER BY b.fecha_vencimiento, b.num_cuota
  LOOP
    v_monto := r.pagado_cuota;
    v_en_rango := r.fecha_pagada IS NOT NULL AND r.fecha_pagada >= p_desde AND r.fecha_pagada <= p_hasta;
    v_disp := coalesce((v_rest->>r.prestamo_id::text)::numeric, 0);
    IF v_monto <= 0 AND v_disp > 0 AND (v_en_rango OR r.status = 'Parcial') THEN
      v_ref := greatest(coalesce(r.capital_pagado, 0) + coalesce(r.interes_pagado, 0) + coalesce(r.mora_pagada, 0),
                        coalesce(r.capital_interes, 0) - coalesce(r.saldo_total, 0), 0);
      v_monto := least(v_disp, CASE WHEN v_ref > 0 THEN v_ref ELSE v_disp END);
      v_rest := jsonb_set(v_rest, ARRAY[r.prestamo_id::text], to_jsonb(greatest(0, v_disp - v_monto)));
    END IF;

    v_out := v_out || jsonb_build_object(
      'cuotaId', r.id,
      'prestamoId', r.prestamo_id,
      'clienteNombre', coalesce(r.cliente_nombre, '—'),
      'clienteId', coalesce(r.cliente_id::text, ''),
      'clienteTelefono', nullif(r.telefono, ''),
      'clienteDireccion', nullif(r.direccion, ''),
      'gpsLat', nullif(r.gps_lat::numeric, 0),
      'gpsLng', nullif(r.gps_lng::numeric, 0),
      'numCuota', r.num_cuota,
      'totalCuotas', coalesce(r.num_cuotas, 0),
      'capitalInteres', coalesce(r.capital_interes, 0),
      'saldoTotal', coalesce(r.saldo_total, 0),
      'saldoMora', coalesce(r.saldo_mora, 0),
      'saldoCapital', coalesce(r.saldo_capital, 0),
      'saldoInteres', coalesce(r.saldo_interes, 0),
      'moraPagada', coalesce(r.mora_pagada, 0),
      'interesPagado', coalesce(r.interes_pagado, 0),
      'capitalPagado', coalesce(r.capital_pagado, 0),
      'fechaVencimiento', r.fecha_vencimiento,
      'status', coalesce(r.status::text, 'Pendiente'),
      'diasAtraso', coalesce(r.dias_atraso, 0),
      'ruta', coalesce(r.ruta_nombre, 'Sin ruta'),
      'rutaId', r.ruta_id,
      'cobradorId', r.cobrador_id,
      'cajaId', r.caja_id,
      'pagada', r.status::text = 'Pagada',
      'cobradaEnRango', v_monto > 0 OR v_en_rango,
      'montoPagado', v_monto);
  END LOOP;

  RETURN v_out;
END $$;

-- 2) Resumen de la semana (useResumenSemanal): esperado = Σ capital_interes de las cuotas que vencen
--    en el rango; cobrado = Σ pagos no anulados de esas cuotas.
CREATE OR REPLACE FUNCTION public.cobrador_resumen_semanal(p_desde date, p_hasta date, p_cobrador uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH e AS (SELECT public.get_user_empresa_id() AS emp),
  cu AS (
    SELECT a.id, coalesce(a.capital_interes, 0) AS ci
    FROM amortizacion a
    JOIN prestamos p ON p.id = a.prestamo_id
    CROSS JOIN e
    WHERE a.fecha_vencimiento >= p_desde AND a.fecha_vencimiento <= p_hasta
      AND (CASE WHEN p_cobrador IS NULL THEN a.empresa_id = e.emp
                ELSE p.empresa_id = e.emp AND p.cobrador_id = p_cobrador END)
  )
  SELECT jsonb_build_object(
    'total', coalesce((SELECT sum(ci) FROM cu), 0),
    'cobrado', coalesce((SELECT sum(coalesce(pg.monto_recibido, 0)) FROM pagos pg CROSS JOIN e
                         WHERE pg.cuota_id IN (SELECT id FROM cu) AND pg.anulado = false AND pg.empresa_id = e.emp), 0))
  FROM e WHERE e.emp IS NOT NULL;
$$;

-- 3) Cartera del cobrador (usePerfilCobrador): préstamos vigentes con cuotas pagadas, saldo y mora.
CREATE OR REPLACE FUNCTION public.cobrador_cartera(p_cobrador uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'cliente', coalesce(cl.nombre_completo, '—'),
    'ruta', coalesce(ru.nombre, 'Sin ruta'),
    'monto', coalesce(p.monto_solicitado, 0),
    'montoPagar', coalesce(p.monto_total_pagar, 0),
    'cuotas', p.num_cuotas,
    'estado', p.estado,
    'frecuencia', p.frecuencia,
    'pagadas', coalesce(am.pagadas, 0),
    'saldo', coalesce(am.saldo, 0),
    'mora', coalesce(am.mora, 0)
  ) ORDER BY p.created_at DESC), '[]'::jsonb)
  FROM prestamos p
  LEFT JOIN clientes cl ON cl.id = p.cliente_id
  LEFT JOIN rutas ru ON ru.id = p.ruta_id
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE a.status = 'Pagada') AS pagadas,
           sum(coalesce(a.saldo_total, 0)) AS saldo,
           sum(coalesce(a.saldo_mora, 0)) AS mora
    FROM amortizacion a WHERE a.prestamo_id = p.id
  ) am ON true
  WHERE p.empresa_id = public.get_user_empresa_id()
    AND p.cobrador_id = p_cobrador
    AND p.estado::text IN ('Activo', 'Al día', 'Vencido');
$$;

REVOKE ALL ON FUNCTION public.cobrador_cobranza(date, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cobrador_resumen_semanal(date, date, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cobrador_cartera(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cobrador_cobranza(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cobrador_resumen_semanal(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cobrador_cartera(uuid) TO authenticated;
