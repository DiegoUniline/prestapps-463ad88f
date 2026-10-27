-- Cartera por caja (pantalla Cajas): antes el navegador descargaba todos los préstamos y todas sus
-- cuotas (~12k filas) para sumarlas. Mismo cálculo que hacía CajasPage, ahora en el servidor:
--   mora pendiente por cuota = max(saldo_mora, mora dinámica por días de atraso − mora pagada)
--   por cobrar = saldo capital + saldo interés + mora pendiente
--   ganancia   = (total a pagar − monto) + mora cobrada + mora pendiente
-- Devuelve {"global": {...}, "byCaja": {"<caja_id>|sin-caja": {...}}}.
CREATE OR REPLACE FUNCTION public.cajas_cartera_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
DECLARE
  v_emp uuid := public.get_user_empresa_id();
  v_res jsonb;
BEGIN
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;

  WITH pr AS (
    SELECT p.id, coalesce(p.caja_id::text, 'sin-caja') AS caja,
           p.estado::text <> 'Liquidado' AS activo,
           coalesce(p.monto_solicitado, 0) AS monto,
           coalesce(p.monto_total_pagar, 0) AS total_pagar,
           p.tipo_mora::text AS tipo_mora,
           coalesce(p.valor_mora, 0) AS valor_mora
    FROM prestamos p
    WHERE p.empresa_id = v_emp AND p.estado::text <> 'Cancelado'
  ),
  cu AS (
    SELECT a.prestamo_id,
           coalesce(a.saldo_capital, 0) AS sc,
           coalesce(a.saldo_interes, 0) AS si,
           coalesce(a.mora_pagada, 0) AS mp,
           a.fecha_vencimiento < current_date AND coalesce(a.saldo_total, 0) > 0 AS atraso,
           CASE
             WHEN a.fecha_vencimiento < current_date AND coalesce(a.saldo_total, 0) > 0 AND pr.valor_mora > 0 THEN
               greatest(coalesce(a.saldo_mora, 0), greatest(0,
                 CASE WHEN pr.tipo_mora = 'porcentaje'
                      THEN coalesce(a.capital_interes, 0) * (pr.valor_mora / 100) * (current_date - a.fecha_vencimiento)
                      ELSE pr.valor_mora * (current_date - a.fecha_vencimiento)
                 END - coalesce(a.mora_pagada, 0)))
             ELSE coalesce(a.saldo_mora, 0)
           END AS mora
    FROM amortizacion a
    JOIN pr ON pr.id = a.prestamo_id
    WHERE a.empresa_id = v_emp
  ),
  ag AS (
    SELECT prestamo_id, sum(sc) AS sc, sum(si) AS si, sum(mp) AS mp, sum(mora) AS mora, bool_or(atraso) AS atraso
    FROM cu GROUP BY prestamo_id
  ),
  x AS (
    SELECT pr.caja, pr.activo, pr.monto,
           coalesce(ag.sc, 0) + coalesce(ag.si, 0) + coalesce(ag.mora, 0) AS por_cobrar,
           (pr.total_pagar - pr.monto) + coalesce(ag.mp, 0) + coalesce(ag.mora, 0) AS ganancia,
           coalesce(ag.atraso, false) AS atraso,
           coalesce(ag.mora, 0) AS mora
    FROM pr LEFT JOIN ag ON ag.prestamo_id = pr.id
  ),
  por_caja AS (
    SELECT caja,
           jsonb_build_object(
             'activos', count(*) FILTER (WHERE activo),
             'colocado', sum(monto),
             'totalPagar', sum(por_cobrar),
             'porCobrar', sum(por_cobrar),
             'gananciaProyectada', sum(ganancia),
             'enMora', count(*) FILTER (WHERE atraso),
             'moraTotal', coalesce(sum(mora) FILTER (WHERE atraso), 0)) AS s
    FROM x GROUP BY caja
  )
  SELECT jsonb_build_object(
    'global', (SELECT jsonb_build_object(
                 'activos', count(*) FILTER (WHERE activo),
                 'colocado', coalesce(sum(monto), 0),
                 'totalPagar', coalesce(sum(por_cobrar), 0),
                 'porCobrar', coalesce(sum(por_cobrar), 0),
                 'gananciaProyectada', coalesce(sum(ganancia), 0),
                 'enMora', count(*) FILTER (WHERE atraso),
                 'moraTotal', coalesce(sum(mora) FILTER (WHERE atraso), 0)) FROM x),
    'byCaja', coalesce((SELECT jsonb_object_agg(caja, s) FROM por_caja), '{}'::jsonb))
  INTO v_res;

  RETURN v_res;
END $$;

REVOKE ALL ON FUNCTION public.cajas_cartera_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cajas_cartera_stats() TO authenticated;
