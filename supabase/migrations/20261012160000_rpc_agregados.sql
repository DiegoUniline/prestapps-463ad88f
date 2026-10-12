-- RPCs de agregación (solo lectura) para reemplazar descargas masivas + cálculos en el navegador.
-- SECURITY INVOKER: RLS sigue aplicando igual que en las consultas PostgREST que reemplazan;
-- además se filtra explícitamente por empresa_id = get_user_empresa_id().
-- Idempotente y aditivo: el frontend anterior sigue funcionando sin cambios.

-- ── Índices de soporte ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pagos_cuota                ON public.pagos (cuota_id);
CREATE INDEX IF NOT EXISTS idx_pagos_ruta_created         ON public.pagos (ruta_id, created_at);
CREATE INDEX IF NOT EXISTS idx_prestamos_empresa_created  ON public.prestamos (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prestamos_caja             ON public.prestamos (caja_id);
CREATE INDEX IF NOT EXISTS idx_crm_gestiones_cliente_fecha ON public.crm_gestiones (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervisor_rutas_supervisor ON public.supervisor_rutas (supervisor_id);

-- ── 1) Dashboard ─────────────────────────────────────────────────
-- p_filters: { desde, hasta: 'YYYY-MM-DD' | null, ruta_id, cobrador_id, caja_id: uuid | null,
--              today: 'YYYY-MM-DD' (UTC, como new Date().toISOString()), today_local: 'YYYY-MM-DD',
--              meses: ['YYYY-MM', ...] }
CREATE OR REPLACE FUNCTION public.dashboard_kpis(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_emp uuid := public.get_user_empresa_id();
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_desde text := nullif(v_f->>'desde', '');
  v_hasta text := nullif(v_f->>'hasta', '');
  v_ruta uuid := nullif(v_f->>'ruta_id', '')::uuid;
  v_cob uuid := nullif(v_f->>'cobrador_id', '')::uuid;
  v_caja uuid := nullif(v_f->>'caja_id', '')::uuid;
  v_today date := coalesce(nullif(v_f->>'today', '')::date, (now() AT TIME ZONE 'UTC')::date);
  v_today_local date;
  v_today_txt text;
  v_mes text;
  v_meses text[];
  v_result jsonb;
BEGIN
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  v_today_local := coalesce(nullif(v_f->>'today_local', '')::date, v_today);
  v_today_txt := to_char(v_today, 'YYYY-MM-DD');
  v_mes := to_char(v_today, 'YYYY-MM');
  SELECT coalesce(array_agg(x), ARRAY[]::text[]) INTO v_meses
  FROM jsonb_array_elements_text(coalesce(v_f->'meses', '[]'::jsonb)) AS x;
  IF cardinality(v_meses) = 0 THEN
    v_meses := ARRAY(
      SELECT to_char(date_trunc('month', v_today::timestamp) - make_interval(months => g), 'YYYY-MM')
      FROM generate_series(5, 0, -1) AS g
    );
  END IF;

  WITH pr AS (
    SELECT p.id, p.cliente_id, p.ruta_id, p.cobrador_id,
           p.estado::text AS estado,
           p.frecuencia::text AS frecuencia,
           coalesce(p.monto_solicitado, 0) AS monto,
           coalesce(p.monto_total_pagar, 0) AS total_pagar,
           coalesce(to_jsonb(p.fecha_registro) #>> '{}', '') AS freg,
           p.estado::text IN ('Activo', 'Al día', 'Vencido') AS activo
    FROM prestamos p
    WHERE p.empresa_id = v_emp
      AND (v_ruta IS NULL OR p.ruta_id = v_ruta)
      AND (v_cob IS NULL OR p.cobrador_id = v_cob)
      AND (v_caja IS NULL OR p.caja_id = v_caja)
      AND (v_desde IS NULL OR coalesce(to_jsonb(p.fecha_registro) #>> '{}', '') COLLATE "C" >= v_desde)
      AND (v_hasta IS NULL OR coalesce(to_jsonb(p.fecha_registro) #>> '{}', '') COLLATE "C" <= v_hasta)
  ),
  am AS (
    SELECT a.prestamo_id, pr.activo, pr.cobrador_id, pr.ruta_id,
           coalesce(a.saldo_total, 0) AS st,
           coalesce(a.saldo_mora, 0) AS sm,
           coalesce(a.saldo_capital, 0) AS sc,
           coalesce(a.saldo_interes, 0) AS si,
           coalesce(a.capital_pagado, 0) AS cp,
           coalesce(a.interes_pagado, 0) AS ip,
           coalesce(a.mora_pagada, 0) AS mp,
           a.status::text AS status,
           a.fecha_vencimiento::date AS fv,
           a.status IS DISTINCT FROM 'Pagada' AS pendiente
    FROM amortizacion a
    JOIN pr ON pr.id = a.prestamo_id
    WHERE a.empresa_id = v_emp
  ),
  pg AS (
    SELECT p.cobrador_id,
           coalesce(p.monto_recibido, 0) AS m,
           coalesce(p.aplicado_capital, 0) AS c,
           coalesce(p.aplicado_interes, 0) AS i,
           coalesce(p.aplicado_mora, 0) AS mo,
           coalesce(left(p.created_at::text, 10), '') AS d
    FROM pagos p
    JOIN pr ON pr.id = p.prestamo_id
    WHERE p.empresa_id = v_emp
      AND (v_cob IS NULL OR p.cobrador_id = v_cob)
      AND (v_caja IS NULL OR p.caja_id = v_caja)
      AND (v_ruta IS NULL OR p.ruta_id = v_ruta)
      AND (v_desde IS NULL OR coalesce(left(p.created_at::text, 10), '') COLLATE "C" >= v_desde)
      AND (v_hasta IS NULL OR coalesce(left(p.created_at::text, 10), '') COLLATE "C" <= v_hasta)
  ),
  k_pr AS (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE activo) AS activos,
           count(*) FILTER (WHERE estado = 'Liquidado') AS liquidados,
           count(*) FILTER (WHERE estado = 'Juridico') AS juridicos,
           count(*) FILTER (WHERE estado = 'Vencido') AS vencidos,
           coalesce(sum(monto) FILTER (WHERE activo), 0) AS capital_colocado,
           coalesce(sum(total_pagar) FILTER (WHERE activo), 0) AS total_pagar
    FROM pr
  ),
  k_am AS (
    SELECT coalesce(sum(st) FILTER (WHERE pendiente), 0) AS saldo_por_cobrar,
           coalesce(sum(sc) FILTER (WHERE pendiente), 0) AS saldo_capital,
           coalesce(sum(si) FILTER (WHERE pendiente), 0) AS saldo_interes,
           coalesce(sum(sm), 0) AS mora_total,
           coalesce(sum(cp), 0) AS capital_recuperado,
           coalesce(sum(ip), 0) AS interes_recuperado,
           coalesce(sum(mp), 0) AS mora_recuperada,
           count(*) FILTER (WHERE status = 'Vencida' OR (fv < v_today AND pendiente)) AS cuotas_vencidas,
           count(*) FILTER (WHERE pendiente) AS cuotas_pendientes,
           count(*) FILTER (WHERE status = 'Pagada') AS cuotas_pagadas,
           count(*) AS total_cuotas,
           coalesce(sum(st) FILTER (WHERE fv < v_today AND pendiente), 0) AS monto_vencido,
           coalesce(sum(st) FILTER (WHERE fv = v_today AND pendiente), 0) AS monto_vence_hoy,
           count(*) FILTER (WHERE fv = v_today AND pendiente) AS cuotas_vencen_hoy,
           count(DISTINCT prestamo_id) FILTER (WHERE fv < v_today AND pendiente) AS prestamos_en_riesgo
    FROM am
    WHERE activo
  ),
  k_pg AS (
    SELECT coalesce(sum(m), 0) AS total_cobrado,
           coalesce(sum(c), 0) AS capital_cobrado,
           coalesce(sum(i), 0) AS interes_cobrado,
           coalesce(sum(mo), 0) AS mora_cobrada,
           coalesce(sum(m) FILTER (WHERE d = v_today_txt), 0) AS cobrado_hoy,
           count(*) FILTER (WHERE d = v_today_txt) AS num_pagos_hoy,
           coalesce(sum(m) FILTER (WHERE left(d, 7) = v_mes), 0) AS cobrado_mes,
           coalesce(sum(i + mo) FILTER (WHERE left(d, 7) = v_mes), 0) AS ingreso_financiero_mes
    FROM pg
  ),
  k_mv AS (
    SELECT coalesce(sum(coalesce(m.monto, 0)), 0) AS gastos_mes
    FROM movimientos_caja m
    WHERE m.empresa_id = v_emp
      AND (v_caja IS NULL OR m.caja_id = v_caja)
      AND (v_desde IS NULL OR coalesce(left(m.created_at::text, 10), '') COLLATE "C" >= v_desde)
      AND (v_hasta IS NULL OR coalesce(left(m.created_at::text, 10), '') COLLATE "C" <= v_hasta)
      AND m.tipo::text = 'salida'
      AND left(coalesce(m.created_at::text, ''), 7) = v_mes
      AND lower(translate(coalesce(m.concepto, ''), 'ÁÉÍÓÚ', 'áéíóú'))
          !~ '(desembolso|préstamo|prestamo|retiro|transferencia|recurso|anulación|anulacion|corrección|correccion)'
  ),
  k_misc AS (
    SELECT
      (SELECT coalesce(sum(coalesce(pf.efectivo_en_mano, 0)), 0) FROM profiles pf WHERE pf.empresa_id = v_emp) AS efectivo_calle,
      (SELECT coalesce(sum(coalesce(cj.saldo_actual, 0)), 0) FROM cajas cj WHERE cj.empresa_id = v_emp) AS capital_cajas,
      (SELECT count(*) FROM promesas_pago pp WHERE pp.empresa_id = v_emp AND pp.status = 'Pendiente') AS promesas_pendientes,
      (SELECT count(*) FROM promesas_pago pp WHERE pp.empresa_id = v_emp AND pp.status = 'Pendiente'
          AND pp.fecha_prometida::date <= v_today) AS promesas_por_atender,
      (SELECT coalesce(sum(coalesce(pp.monto_prometido, 0)), 0) FROM promesas_pago pp WHERE pp.empresa_id = v_emp
          AND pp.status = 'Pendiente' AND pp.fecha_prometida::date <= v_today) AS monto_promesas_hoy,
      (SELECT count(*) FROM clientes cl WHERE cl.empresa_id = v_emp AND cl.estado::text = 'Activo') AS clientes_activos,
      (SELECT count(*) FROM clientes cl WHERE cl.empresa_id = v_emp AND cl.estado::text = 'En mora') AS clientes_mora
  ),
  deud AS (
    SELECT am.prestamo_id,
           sum(am.st) AS saldo,
           coalesce(sum(am.st) FILTER (WHERE am.fv < v_today), 0) AS vencido,
           sum(am.sm) AS mora,
           greatest(coalesce(max(v_today_local - am.fv) FILTER (WHERE am.fv < v_today), 0), 0) AS dias
    FROM am
    WHERE am.activo AND am.pendiente
    GROUP BY am.prestamo_id
    HAVING sum(am.st) > 0
  ),
  top_deud AS (
    SELECT jsonb_agg(jsonb_build_object(
             'id', d.prestamo_id,
             'cliente', coalesce(nullif(cl.nombre_completo, ''), 'Cliente sin nombre'),
             'telefono', nullif(cl.telefono, ''),
             'direccion', nullif(cl.direccion, ''),
             'gpsLat', nullif(cl.gps_lat, 0),
             'gpsLng', nullif(cl.gps_lng, 0),
             'saldo', d.saldo,
             'vencido', d.vencido,
             'mora', d.mora,
             'diasAtraso', d.dias,
             'ruta', coalesce(nullif(r.nombre, ''), 'Sin ruta'),
             'cobrador', coalesce(nullif(pf.nombre_completo, ''), 'Sin cobrador')
           ) ORDER BY d.vencido DESC, d.saldo DESC, d.prestamo_id) AS items
    FROM (SELECT * FROM deud ORDER BY vencido DESC, saldo DESC, prestamo_id LIMIT 8) d
    JOIN pr ON pr.id = d.prestamo_id
    LEFT JOIN clientes cl ON cl.id = pr.cliente_id
    LEFT JOIN rutas r ON r.id = pr.ruta_id AND r.empresa_id = v_emp
    LEFT JOIN profiles pf ON pf.id = pr.cobrador_id AND pf.empresa_id = v_emp
  ),
  meses AS (
    SELECT jsonb_agg(jsonb_build_object(
             'ym', u.ym,
             'colocado', coalesce(col.colocado, 0),
             'cobrado', coalesce(pm.cobrado, 0),
             'mora', coalesce(pm.mora, 0),
             'interes', coalesce(pm.interes, 0),
             'capital', coalesce(pm.capital, 0)
           ) ORDER BY u.ord) AS items
    FROM unnest(v_meses) WITH ORDINALITY AS u(ym, ord)
    LEFT JOIN (SELECT left(freg, 7) AS ym, sum(monto) AS colocado FROM pr GROUP BY 1) col ON col.ym = u.ym
    LEFT JOIN (SELECT left(d, 7) AS ym, sum(m) AS cobrado, sum(mo) AS mora, sum(i) AS interes, sum(c) AS capital
               FROM pg GROUP BY 1) pm ON pm.ym = u.ym
  ),
  pies AS (
    SELECT
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value) ORDER BY value DESC, name), '[]'::jsonb)
         FROM (SELECT coalesce(estado, 'Activo') AS name, count(*) AS value FROM pr GROUP BY 1) x) AS estado,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value) ORDER BY value DESC, name), '[]'::jsonb)
         FROM (SELECT coalesce(nullif(frecuencia, ''), 'semanal') AS name, count(*) AS value FROM pr WHERE activo GROUP BY 1) x) AS frecuencia,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value) ORDER BY value DESC, name), '[]'::jsonb)
         FROM (SELECT coalesce(nullif(status, ''), 'Pendiente') AS name, count(*) AS value FROM am WHERE activo GROUP BY 1) x) AS cuota_status
  ),
  cob_stats AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', pf.id,
             'nombre', pf.nombre_completo,
             'cobrado', coalesce(pc.cobrado, 0),
             'prestamos', coalesce(prc.n, 0),
             'efectivo', coalesce(pf.efectivo_en_mano, 0),
             'saldo', coalesce(ac.saldo, 0),
             'mora', coalesce(ac.mora, 0)
           ) ORDER BY coalesce(pc.cobrado, 0) DESC, pf.nombre_completo, pf.id), '[]'::jsonb) AS items
    FROM profiles pf
    LEFT JOIN (SELECT cobrador_id, sum(m) AS cobrado FROM pg GROUP BY 1) pc ON pc.cobrador_id = pf.id
    LEFT JOIN (SELECT cobrador_id, count(*) AS n FROM pr WHERE activo GROUP BY 1) prc ON prc.cobrador_id = pf.id
    LEFT JOIN (SELECT cobrador_id, sum(st) FILTER (WHERE pendiente) AS saldo, sum(sm) AS mora FROM am GROUP BY 1) ac
      ON ac.cobrador_id = pf.id
    WHERE pf.empresa_id = v_emp AND pf.activo
  ),
  ruta_stats AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'nombre', r.nombre,
             'prestamos', coalesce(prc.n, 0),
             'saldo', coalesce(ar.saldo, 0),
             'mora', coalesce(ar.mora, 0)
           ) ORDER BY coalesce(ar.saldo, 0) DESC, r.nombre, r.id), '[]'::jsonb) AS items
    FROM rutas r
    LEFT JOIN (SELECT ruta_id, count(*) AS n FROM pr WHERE activo GROUP BY 1) prc ON prc.ruta_id = r.id
    LEFT JOIN (SELECT ruta_id, coalesce(sum(st) FILTER (WHERE pendiente), 0) AS saldo, sum(sm) AS mora
               FROM am WHERE activo GROUP BY 1) ar ON ar.ruta_id = r.id
    WHERE r.empresa_id = v_emp
  ),
  opciones AS (
    SELECT
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nombre', r.nombre) ORDER BY r.nombre, r.id), '[]'::jsonb)
         FROM rutas r WHERE r.empresa_id = v_emp) AS rutas,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', pf.id, 'nombre_completo', pf.nombre_completo) ORDER BY pf.nombre_completo, pf.id), '[]'::jsonb)
         FROM profiles pf WHERE pf.empresa_id = v_emp AND pf.activo) AS cobradores,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', cj.id, 'nombre', cj.nombre, 'saldo', coalesce(cj.saldo_actual, 0)) ORDER BY cj.nombre, cj.id), '[]'::jsonb)
         FROM cajas cj WHERE cj.empresa_id = v_emp) AS cajas
  )
  SELECT jsonb_build_object(
    'today', v_today_txt,
    'prestamos', to_jsonb(k_pr),
    'cuotas', to_jsonb(k_am),
    'pagos', to_jsonb(k_pg),
    'gastosMes', k_mv.gastos_mes,
    'misc', to_jsonb(k_misc),
    'topDeudores', coalesce(top_deud.items, '[]'::jsonb),
    'meses', coalesce(meses.items, '[]'::jsonb),
    'pies', to_jsonb(pies),
    'cobradorStats', cob_stats.items,
    'rutaStats', ruta_stats.items,
    'opciones', to_jsonb(opciones)
  )
  INTO v_result
  FROM k_pr, k_am, k_pg, k_mv, k_misc, top_deud, meses, pies, cob_stats, ruta_stats, opciones;

  RETURN v_result;
END;
$$;

-- ── 2) Préstamos: agregados por préstamo (lista) ─────────────────
-- p_ids viaja en el body (POST), sin límite de URL. Devuelve 1 fila por préstamo:
-- el cliente debe trocear p_ids en lotes de <= 1000 (límite de filas de PostgREST).
CREATE OR REPLACE FUNCTION public.prestamos_resumen(p_ids uuid[] DEFAULT NULL, p_today date DEFAULT NULL)
RETURNS TABLE (
  prestamo_id uuid,
  cliente_nombre text,
  cliente_foto text,
  caja_nombre text,
  ruta_nombre text,
  cobrador_nombre text,
  saldo numeric,
  saldo_capital numeric,
  saldo_interes numeric,
  mora numeric,
  saldo_atrasado numeric,
  mora_atrasada numeric,
  cuotas_pagadas integer,
  tiene_atraso boolean,
  dias_atraso integer,
  proximo_vencimiento text,
  ultimo_pago_fecha text,
  ultimo_pago_monto numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH t AS (
    SELECT coalesce(p_today, (now() AT TIME ZONE 'UTC')::date) AS hoy
  ),
  p AS (
    SELECT pr.id, pr.cliente_id, pr.caja_id, pr.ruta_id, pr.cobrador_id
    FROM prestamos pr
    WHERE pr.empresa_id = public.get_user_empresa_id()
      AND (p_ids IS NULL OR pr.id = ANY (p_ids))
  )
  SELECT p.id,
         c.nombre_completo::text,
         c.foto_cliente::text,
         cj.nombre::text,
         r.nombre::text,
         pf.nombre_completo::text,
         coalesce(a.saldo, 0),
         coalesce(a.saldo_capital, 0),
         coalesce(a.saldo_interes, 0),
         coalesce(a.mora, 0),
         coalesce(a.saldo_atrasado, 0),
         coalesce(a.mora_atrasada, 0),
         coalesce(a.pagadas, 0)::integer,
         coalesce(a.tiene_atraso, false),
         greatest(coalesce(a.dias_atraso, 0), 0)::integer,
         to_char(a.proximo, 'YYYY-MM-DD'),
         u.fecha,
         u.monto
  FROM p
  CROSS JOIN t
  LEFT JOIN clientes c ON c.id = p.cliente_id
  LEFT JOIN cajas cj ON cj.id = p.caja_id
  LEFT JOIN rutas r ON r.id = p.ruta_id
  LEFT JOIN profiles pf ON pf.id = p.cobrador_id
  LEFT JOIN LATERAL (
    SELECT sum(coalesce(am.saldo_total, 0)) AS saldo,
           sum(coalesce(am.saldo_capital, 0)) AS saldo_capital,
           sum(coalesce(am.saldo_interes, 0)) AS saldo_interes,
           sum(coalesce(am.saldo_mora, 0)) AS mora,
           sum(coalesce(am.saldo_total, 0)) FILTER (WHERE am.fecha_vencimiento::date < t.hoy AND coalesce(am.saldo_total, 0) > 0) AS saldo_atrasado,
           sum(coalesce(am.saldo_mora, 0)) FILTER (WHERE am.fecha_vencimiento::date < t.hoy AND coalesce(am.saldo_total, 0) > 0) AS mora_atrasada,
           count(*) FILTER (WHERE am.status = 'Pagada') AS pagadas,
           bool_or(am.fecha_vencimiento::date < t.hoy AND coalesce(am.saldo_total, 0) > 0) AS tiene_atraso,
           max(t.hoy - am.fecha_vencimiento::date) FILTER (WHERE am.fecha_vencimiento::date < t.hoy AND coalesce(am.saldo_total, 0) > 0) AS dias_atraso,
           min(am.fecha_vencimiento::date) FILTER (WHERE am.fecha_vencimiento::date >= t.hoy AND coalesce(am.saldo_total, 0) > 0) AS proximo
    FROM amortizacion am
    WHERE am.prestamo_id = p.id
  ) a ON true
  LEFT JOIN LATERAL (
    SELECT to_jsonb(pg.fecha_pago) #>> '{}' AS fecha,
           nullif(coalesce(pg.monto_recibido, 0), 0) AS monto
    FROM pagos pg
    WHERE pg.prestamo_id = p.id AND pg.anulado = false
    ORDER BY pg.fecha_pago DESC, pg.created_at DESC, pg.id DESC
    LIMIT 1
  ) u ON true;
$$;

-- ── 3) Saldo real de cajas (desde tablas fuente, sin tope de 1000 filas) ──
-- + pagos no anulados − desembolsos no cancelados ± movimientos manuales (prestamo_id IS NULL)
-- EXCLUYENDO las entradas de corte/liquidación de cobrador: ese efectivo ya entró a la caja
-- con el pago (pagos.caja_id), volver a sumarlo lo duplicaba.
CREATE OR REPLACE FUNCTION public.caja_saldos(p_caja_ids uuid[])
RETURNS TABLE (caja_id uuid, saldo numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.id,
         coalesce((SELECT sum(coalesce(p.monto_recibido, 0)) FROM pagos p
                   WHERE p.caja_id = c.id AND p.anulado = false), 0)
       - coalesce((SELECT sum(coalesce(pr.monto_solicitado, 0)) FROM prestamos pr
                   WHERE pr.caja_id = c.id AND pr.estado::text <> 'Cancelado'), 0)
       + coalesce((SELECT sum(CASE WHEN m.tipo::text = 'entrada' THEN coalesce(m.monto, 0) ELSE -coalesce(m.monto, 0) END)
                   FROM movimientos_caja m
                   WHERE m.caja_id = c.id
                     AND m.prestamo_id IS NULL
                     AND NOT (m.tipo::text = 'entrada'
                              AND (coalesce(m.concepto, '') ILIKE 'Corte cobrador%'
                                   OR coalesce(m.concepto, '') ILIKE 'Liquidación ruta%'
                                   OR coalesce(m.concepto, '') ILIKE 'Liquidacion ruta%'))), 0)
  FROM cajas c
  WHERE c.empresa_id = public.get_user_empresa_id()
    AND c.id = ANY (p_caja_ids);
$$;

-- ── 4) Comisiones: cobros del equipo de un supervisor ───────────
CREATE OR REPLACE FUNCTION public.cobros_equipo_total(p_supervisor_id uuid, p_desde timestamptz DEFAULT NULL, p_hasta timestamptz DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(sum(coalesce(p.monto_recibido, 0)), 0)
  FROM pagos p
  WHERE p.empresa_id = public.get_user_empresa_id()
    AND p.anulado = false
    AND p.ruta_id IN (SELECT sr.ruta_id FROM supervisor_rutas sr WHERE sr.supervisor_id = p_supervisor_id)
    AND (p_desde IS NULL OR p.created_at >= p_desde)
    AND (p_hasta IS NULL OR p.created_at <= p_hasta);
$$;

-- ── 6) Clientes: estados de cuenta ───────────────────────────────
CREATE OR REPLACE FUNCTION public.estados_cuenta_clientes()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH emp AS (SELECT public.get_user_empresa_id() AS id),
  pr AS (
    SELECT p.id, p.cliente_id, p.cobrador_id
    FROM prestamos p, emp
    WHERE p.empresa_id = emp.id AND p.estado::text IN ('Activo', 'Al día', 'Vencido')
  ),
  cu AS (
    SELECT pr.cliente_id,
           sum(coalesce(a.saldo_total, 0)) AS saldo_total,
           count(*) FILTER (WHERE a.status = 'Vencida') AS cuotas_vencidas,
           coalesce(sum(coalesce(a.saldo_total, 0)) FILTER (WHERE a.status = 'Vencida'), 0) AS saldo_moroso
    FROM amortizacion a
    JOIN pr ON pr.id = a.prestamo_id
    WHERE a.status <> 'Pagada'
    GROUP BY pr.cliente_id
  ),
  cob AS (
    SELECT DISTINCT ON (pr.cliente_id) pr.cliente_id, pf.nombre_completo
    FROM pr
    JOIN profiles pf ON pf.id = pr.cobrador_id
    WHERE coalesce(pf.nombre_completo, '') <> ''
    ORDER BY pr.cliente_id, pr.id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'cliente_id', c.id,
           'id_cliente', c.id_cliente,
           'nombre_completo', c.nombre_completo,
           'saldo_total', cu.saldo_total,
           'cuotas_vencidas', cu.cuotas_vencidas,
           'saldo_moroso', cu.saldo_moroso,
           'cobrador_nombre', cob.nombre_completo
         ) ORDER BY c.nombre_completo, c.id), '[]'::jsonb)
  FROM clientes c
  CROSS JOIN emp
  JOIN cu ON cu.cliente_id = c.id
  LEFT JOIN cob ON cob.cliente_id = c.id
  WHERE c.empresa_id = emp.id
    AND c.activo = true
    AND (cu.saldo_total > 0 OR cu.cuotas_vencidas > 0);
$$;

-- ── 8a) Rentabilidad ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rentabilidad_resumen()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH emp AS (SELECT public.get_user_empresa_id() AS id),
  pg AS (
    SELECT p.prestamo_id,
           sum(coalesce(p.aplicado_capital, 0)) AS capital,
           sum(coalesce(p.aplicado_interes, 0)) AS interes,
           sum(coalesce(p.aplicado_mora, 0)) AS mora,
           sum(coalesce(p.monto_recibido, 0)) AS total
    FROM pagos p, emp
    WHERE p.empresa_id = emp.id AND p.anulado = false
    GROUP BY p.prestamo_id
  ),
  bp AS (
    SELECT pr.id, pr.estado::text AS estado, pr.ruta_id, pr.cobrador_id, pr.cliente_id,
           coalesce(pr.monto_solicitado, 0) AS capital_colocado,
           coalesce(pg.capital, 0) AS capital_recuperado,
           coalesce(pg.interes, 0) AS interes_ganado,
           coalesce(pg.mora, 0) AS mora_ganada,
           coalesce(pg.total, 0) AS total_recibido,
           coalesce(pg.interes, 0) + coalesce(pg.mora, 0) AS utilidad_bruta
    FROM prestamos pr
    CROSS JOIN emp
    LEFT JOIN pg ON pg.prestamo_id = pr.id
    WHERE pr.empresa_id = emp.id
      AND pr.estado::text IN ('Activo', 'Al día', 'Vencido', 'Liquidado')
  ),
  grp_ruta AS (
    SELECT coalesce(bp.ruta_id::text, 'sin-ruta') AS key, bp.ruta_id, count(*) AS prestamos,
           sum(capital_colocado) AS capital_colocado, sum(capital_recuperado) AS capital_recuperado,
           sum(utilidad_bruta) AS utilidad_bruta
    FROM bp GROUP BY 1, 2
  ),
  grp_cob AS (
    SELECT coalesce(bp.cobrador_id::text, 'sin-cobrador') AS key, bp.cobrador_id, count(*) AS prestamos,
           sum(capital_colocado) AS capital_colocado, sum(capital_recuperado) AS capital_recuperado,
           sum(utilidad_bruta) AS utilidad_bruta
    FROM bp GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'totales', (SELECT jsonb_build_object(
                  'totalCapital', coalesce(sum(capital_colocado), 0),
                  'totalUtilidad', coalesce(sum(utilidad_bruta), 0),
                  'totalRecuperado', coalesce(sum(capital_recuperado), 0),
                  'totalInteres', coalesce(sum(interes_ganado), 0),
                  'totalMora', coalesce(sum(mora_ganada), 0))
                FROM bp),
    'porRuta', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'rutaId', g.key, 'nombre', coalesce(nullif(r.nombre, ''), 'Sin ruta'), 'prestamos', g.prestamos,
                  'capitalColocado', g.capital_colocado, 'capitalRecuperado', g.capital_recuperado,
                  'utilidadBruta', g.utilidad_bruta) ORDER BY g.utilidad_bruta DESC, g.key), '[]'::jsonb)
                FROM grp_ruta g CROSS JOIN emp
                LEFT JOIN rutas r ON r.id = g.ruta_id AND r.empresa_id = emp.id),
    'porCobrador', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'cobId', g.key, 'nombre', coalesce(nullif(pf.nombre_completo, ''), 'Sin asignar'), 'prestamos', g.prestamos,
                  'capitalColocado', g.capital_colocado, 'capitalRecuperado', g.capital_recuperado,
                  'utilidadBruta', g.utilidad_bruta) ORDER BY g.utilidad_bruta DESC, g.key), '[]'::jsonb)
                FROM grp_cob g CROSS JOIN emp
                LEFT JOIN profiles pf ON pf.id = g.cobrador_id AND pf.empresa_id = emp.id),
    'porPrestamo', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'id', x.id, 'cliente', coalesce(nullif(cl.nombre_completo, ''), '—'),
                  'capitalColocado', x.capital_colocado, 'capitalRecuperado', x.capital_recuperado,
                  'interesGanado', x.interes_ganado, 'moraGanada', x.mora_ganada, 'totalRecibido', x.total_recibido,
                  'utilidadBruta', x.utilidad_bruta, 'estado', x.estado) ORDER BY x.utilidad_bruta DESC, x.id), '[]'::jsonb)
                FROM (SELECT * FROM bp ORDER BY utilidad_bruta DESC, id LIMIT 100) x
                LEFT JOIN clientes cl ON cl.id = x.cliente_id)
  );
$$;

-- ── 8b) Productividad: mora vencida por asesor ──────────────────
-- asesor = coalesce(cobrador_id, generado_por); NULL => "Sin asignar".
CREATE OR REPLACE FUNCTION public.productividad_mora(p_today date DEFAULT NULL)
RETURNS TABLE (advisor_id text, clientes_morosos integer, monto_mora numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(p.cobrador_id::text, p.generado_por::text) AS advisor_id,
         count(DISTINCT p.cliente_id)::integer,
         sum(coalesce(a.saldo_mora, 0))
  FROM amortizacion a
  JOIN prestamos p ON p.id = a.prestamo_id
  WHERE p.empresa_id = public.get_user_empresa_id()
    AND p.estado::text IN ('Activo', 'Al día', 'Vencido')
    AND a.fecha_vencimiento::date < coalesce(p_today, (now() AT TIME ZONE 'UTC')::date)
    AND coalesce(a.saldo_total, 0) > 0
  GROUP BY 1;
$$;

-- ── 8c) Productividad: última visita por cliente ────────────────
CREATE OR REPLACE FUNCTION public.clientes_ultima_visita()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_object_agg(x.cliente_id, x.ultima), '{}'::jsonb)
  FROM (
    SELECT g.cliente_id, max(g.created_at) AS ultima
    FROM crm_gestiones g
    WHERE g.empresa_id = public.get_user_empresa_id()
      AND g.tipo_gestion = 'Visita'
      AND g.cliente_id IS NOT NULL
    GROUP BY g.cliente_id
  ) x;
$$;

-- ── 9) Cobranza: gestiones por préstamo (conteo + última) ───────
CREATE OR REPLACE FUNCTION public.gestiones_resumen(p_prestamo_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_object_agg(x.prestamo_id, jsonb_build_object('count', x.n, 'ultima', x.ultima)), '{}'::jsonb)
  FROM (
    SELECT g.prestamo_id, count(*) AS n, max(g.created_at) AS ultima
    FROM crm_gestiones g
    WHERE g.empresa_id = public.get_user_empresa_id()
      AND g.prestamo_id = ANY (p_prestamo_ids)
    GROUP BY g.prestamo_id
  ) x;
$$;

-- ── 10) Rutas: préstamos vigentes por ruta ──────────────────────
CREATE OR REPLACE FUNCTION public.prestamos_por_ruta()
RETURNS TABLE (ruta_id uuid, total integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p.ruta_id, count(*)::integer
  FROM prestamos p
  WHERE p.empresa_id = public.get_user_empresa_id()
    AND p.ruta_id IS NOT NULL
    AND p.estado::text NOT IN ('Cancelado', 'Liquidado')
  GROUP BY p.ruta_id;
$$;

-- ── 11) Pagos: listado paginado con filtros, orden y totales ────
-- p_filtros: { search, metodos[], cajas[] (nombres), rutas[] (nombres), desde, hasta (ISO instantes),
--              sort_key, sort_dir: 'asc'|'desc' }. p_limit NULL = todas las filas filtradas.
CREATE OR REPLACE FUNCTION public.pagos_listado(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_emp uuid := public.get_user_empresa_id();
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_q text := lower(nullif(v_f->>'search', ''));
  v_metodos text[];
  v_cajas text[];
  v_rutas text[];
  v_desde timestamptz := nullif(v_f->>'desde', '')::timestamptz;
  v_hasta timestamptz := nullif(v_f->>'hasta', '')::timestamptz;
  v_dir text := CASE WHEN v_f->>'sort_dir' = 'desc' THEN 'DESC' ELSE 'ASC' END;
  v_order text;
  v_sql text;
  v_result jsonb;
BEGIN
  IF v_emp IS NULL THEN
    RETURN jsonb_build_object('total', 0, 'rows', '[]'::jsonb);
  END IF;
  SELECT nullif(array_agg(x), '{}') INTO v_metodos FROM jsonb_array_elements_text(coalesce(v_f->'metodos', '[]'::jsonb)) x;
  SELECT nullif(array_agg(x), '{}') INTO v_cajas FROM jsonb_array_elements_text(coalesce(v_f->'cajas', '[]'::jsonb)) x;
  SELECT nullif(array_agg(x), '{}') INTO v_rutas FROM jsonb_array_elements_text(coalesce(v_f->'rutas', '[]'::jsonb)) x;

  v_order := CASE v_f->>'sort_key'
    WHEN 'fecha' THEN 'created_at ' || v_dir || CASE WHEN v_dir = 'ASC' THEN ' NULLS FIRST' ELSE ' NULLS LAST' END
    WHEN 'cliente' THEN 'cliente ' || v_dir
    WHEN 'shortId' THEN 'short_id ' || v_dir
    WHEN 'montoRecibido' THEN 'monto_recibido ' || v_dir
    WHEN 'aplicadoMora' THEN 'aplicado_mora ' || v_dir
    WHEN 'aplicadoInteres' THEN 'aplicado_interes ' || v_dir
    WHEN 'aplicadoCapital' THEN 'aplicado_capital ' || v_dir
    WHEN 'metodo' THEN 'metodo ' || v_dir
    WHEN 'caja' THEN 'caja ' || v_dir
    WHEN 'ruta' THEN 'ruta ' || v_dir
    ELSE NULL
  END;
  v_order := coalesce(v_order || ', ', '') || 'created_at DESC, id';

  v_sql := $q$
    WITH base AS (
      SELECT p.id, p.prestamo_id, p.created_at, p.anulado, p.cuota_id, p.caja_id, p.cobrador_id,
             to_jsonb(p.fecha_pago) #>> '{}' AS fecha_pago,
             coalesce(p.monto_recibido, 0) AS monto_recibido,
             coalesce(p.aplicado_mora, 0) AS aplicado_mora,
             coalesce(p.aplicado_interes, 0) AS aplicado_interes,
             coalesce(p.aplicado_capital, 0) AS aplicado_capital,
             coalesce(nullif(p.metodo_pago::text, ''), 'Efectivo') AS metodo,
             coalesce(nullif(cl.nombre_completo, ''), '—') AS cliente,
             nullif(cl.telefono, '') AS cliente_telefono,
             coalesce(nullif(pr.id_prestamo, ''), 'PRE-' || left(coalesce(p.prestamo_id::text, ''), 8)) AS short_id,
             coalesce(nullif(cj.nombre, ''), '—') AS caja,
             coalesce(nullif(r.nombre, ''), '—') AS ruta,
             coalesce(pr.num_cuotas, 0) AS num_cuotas
      FROM pagos p
      LEFT JOIN prestamos pr ON pr.id = p.prestamo_id
      LEFT JOIN clientes cl ON cl.id = pr.cliente_id
      LEFT JOIN rutas r ON r.id = pr.ruta_id
      LEFT JOIN cajas cj ON cj.id = p.caja_id
      WHERE p.empresa_id = $1
    ),
    filt AS (
      SELECT * FROM base
      WHERE ($2::text IS NULL OR strpos(lower(cliente), $2) > 0 OR strpos(lower(short_id), $2) > 0)
        AND ($3::text[] IS NULL OR metodo = ANY ($3))
        AND ($4::text[] IS NULL OR caja = ANY ($4))
        AND ($5::text[] IS NULL OR ruta = ANY ($5))
        AND (created_at IS NULL OR (($6::timestamptz IS NULL OR created_at >= $6) AND ($7::timestamptz IS NULL OR created_at <= $7)))
    ),
    tot AS (
      SELECT count(*) AS total,
             coalesce(sum(monto_recibido), 0) AS sum_monto,
             coalesce(sum(aplicado_mora), 0) AS sum_mora,
             coalesce(sum(aplicado_interes), 0) AS sum_interes,
             coalesce(sum(aplicado_capital), 0) AS sum_capital
      FROM filt
    ),
    pagina AS (
      SELECT filt.*, row_number() OVER (ORDER BY $q$ || v_order || $q$) AS rn
      FROM filt ORDER BY $q$ || v_order || $q$ LIMIT $8 OFFSET $9
    )
    SELECT jsonb_build_object(
      'total', tot.total,
      'sum_monto', tot.sum_monto,
      'sum_mora', tot.sum_mora,
      'sum_interes', tot.sum_interes,
      'sum_capital', tot.sum_capital,
      'empresa', (SELECT jsonb_build_object('nombre', e.nombre, 'telefono', e.telefono, 'direccion', e.direccion, 'logo_url', e.logo_url)
                  FROM empresas e WHERE e.id = $1),
      'rows', coalesce((SELECT jsonb_agg(to_jsonb(pagina) - 'rn' ORDER BY pagina.rn) FROM pagina), '[]'::jsonb)
    )
    FROM tot
  $q$;

  EXECUTE v_sql INTO v_result
    USING v_emp, v_q, v_metodos, v_cajas, v_rutas, v_desde, v_hasta, p_limit, greatest(coalesce(p_offset, 0), 0);
  RETURN v_result;
END;
$$;

-- ── Permisos ─────────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.dashboard_kpis(jsonb)',
    'public.prestamos_resumen(uuid[], date)',
    'public.caja_saldos(uuid[])',
    'public.cobros_equipo_total(uuid, timestamptz, timestamptz)',
    'public.estados_cuenta_clientes()',
    'public.rentabilidad_resumen()',
    'public.productividad_mora(date)',
    'public.clientes_ultima_visita()',
    'public.gestiones_resumen(uuid[])',
    'public.prestamos_por_ruta()',
    'public.pagos_listado(jsonb, integer, integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

ANALYZE public.pagos;
ANALYZE public.prestamos;
ANALYZE public.crm_gestiones;
