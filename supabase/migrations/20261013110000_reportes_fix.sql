-- Correcciones de reportes (ronda 2):
--  1) Pagos anulados (pagos.anulado = true) ya no suman en cobrado/totales/KPIs.
--  2) Filtros "hasta" inclusivos del día completo (timestamptz: < hasta + 1 día; date: <=).
--  3) Día de negocio en hora de México (America/Mexico_City), igual que el frontend (src/lib/fechaNegocio.ts).
-- Solo CREATE OR REPLACE con la misma firma (idempotente, compatible con el frontend anterior).

-- ── 1) Dashboard ─────────────────────────────────────────────────
-- p_filters: { desde, hasta: 'YYYY-MM-DD' (días de negocio, ambos inclusivos) | null,
--              ruta_id, cobrador_id, caja_id: uuid | null, meses: ['YYYY-MM', ...] }
-- "Hoy" y las fechas de pagos/movimientos se calculan en hora de México en el servidor
-- (se ignoran today/today_local que manda el frontend anterior). Pagos anulados excluidos.
CREATE OR REPLACE FUNCTION public.dashboard_kpis(p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
SET plan_cache_mode = force_custom_plan
SET "TimeZone" = 'America/Mexico_City'
AS $$
DECLARE
  v_emp uuid := public.get_user_empresa_id();
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_tz constant text := 'America/Mexico_City';
  v_desde_d date := left(nullif(v_f->>'desde', ''), 10)::date;
  v_hasta_d date := left(nullif(v_f->>'hasta', ''), 10)::date;
  v_desde_ts timestamptz;
  v_hasta_ts timestamptz;
  v_ruta uuid := nullif(v_f->>'ruta_id', '')::uuid;
  v_cob uuid := nullif(v_f->>'cobrador_id', '')::uuid;
  v_caja uuid := nullif(v_f->>'caja_id', '')::uuid;
  v_today date := coalesce(nullif(v_f->>'hoy', '')::date, (now() AT TIME ZONE 'America/Mexico_City')::date);
  v_today_local date;
  v_mes_ini date;
  v_meses text[];
  v_sin_filtros boolean;
  v_result jsonb;
BEGIN
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  v_sin_filtros := v_desde_d IS NULL AND v_hasta_d IS NULL AND v_ruta IS NULL AND v_cob IS NULL AND v_caja IS NULL;
  v_desde_ts := v_desde_d::timestamp AT TIME ZONE v_tz;
  v_hasta_ts := (v_hasta_d + 1)::timestamp AT TIME ZONE v_tz;
  v_today_local := v_today;
  v_mes_ini := date_trunc('month', v_today)::date;
  SELECT coalesce(array_agg(x), ARRAY[]::text[]) INTO v_meses
  FROM jsonb_array_elements_text(coalesce(v_f->'meses', '[]'::jsonb)) AS x;
  IF cardinality(v_meses) = 0 THEN
    v_meses := ARRAY(
      SELECT to_char(v_mes_ini - make_interval(months => g), 'YYYY-MM')
      FROM generate_series(5, 0, -1) AS g
    );
  END IF;

  --  * fechas de pagos/movimientos = día de negocio (México) de created_at; "hasta" incluye el día completo;
  --  * prestamos.fecha_registro se compara como fecha (inclusiva);
  --  * pagos anulados NO cuentan en ningún cobrado/KPI.
  WITH pr AS (
    SELECT p.id, p.cliente_id, p.ruta_id, p.cobrador_id,
           p.estado::text AS estado,
           p.frecuencia::text AS frecuencia,
           coalesce(p.monto_solicitado, 0) AS monto,
           coalesce(p.monto_total_pagar, 0) AS total_pagar,
           to_char(p.fecha_registro::date, 'YYYY-MM') AS ym_reg,
           p.estado::text IN ('Activo', 'Al día', 'Vencido') AS activo
    FROM prestamos p
    WHERE p.empresa_id = v_emp
      AND (v_ruta IS NULL OR p.ruta_id = v_ruta)
      AND (v_cob IS NULL OR p.cobrador_id = v_cob)
      AND (v_caja IS NULL OR p.caja_id = v_caja)
      AND (v_desde_d IS NULL OR p.fecha_registro::date >= v_desde_d)
      AND (v_hasta_d IS NULL OR p.fecha_registro::date <= v_hasta_d)
  ),
  -- Amortización pre-agregada por (préstamo, status): todo lo demás se acumula desde aquí.
  am AS (
    SELECT g.*, g.status IS DISTINCT FROM 'Pagada' AS pendiente, pr.activo, pr.cobrador_id, pr.ruta_id
    FROM (
      SELECT a.prestamo_id,
             a.status::text AS status,
             count(*) AS n,
             sum(coalesce(a.saldo_total, 0)) AS st,
             sum(coalesce(a.saldo_capital, 0)) AS sc,
             sum(coalesce(a.saldo_interes, 0)) AS si,
             sum(coalesce(a.saldo_mora, 0)) AS sm,
             sum(coalesce(a.capital_pagado, 0)) AS cp,
             sum(coalesce(a.interes_pagado, 0)) AS ip,
             sum(coalesce(a.mora_pagada, 0)) AS mp,
             count(*) FILTER (WHERE a.fecha_vencimiento::date < v_today) AS n_venc,
             coalesce(sum(coalesce(a.saldo_total, 0)) FILTER (WHERE a.fecha_vencimiento::date < v_today), 0) AS st_venc,
             count(*) FILTER (WHERE a.fecha_vencimiento::date = v_today) AS n_hoy,
             coalesce(sum(coalesce(a.saldo_total, 0)) FILTER (WHERE a.fecha_vencimiento::date = v_today), 0) AS st_hoy,
             max(v_today_local - a.fecha_vencimiento::date) FILTER (WHERE a.fecha_vencimiento::date < v_today) AS dias
      FROM amortizacion a
      WHERE a.empresa_id = v_emp
        AND (v_sin_filtros OR a.prestamo_id IN (SELECT pr.id FROM pr))
      GROUP BY a.prestamo_id, a.status
    ) g
    JOIN pr ON pr.id = g.prestamo_id
  ),
  -- Pagos pre-agregados por (cobrador, día)
  pg AS (
    SELECT x.cobrador_id, x.d,
           count(*) AS n,
           sum(x.m) AS m, sum(x.c) AS c, sum(x.i) AS i, sum(x.mo) AS mo
    FROM (
      SELECT p.cobrador_id,
             (p.created_at AT TIME ZONE v_tz)::date AS d,
             coalesce(p.monto_recibido, 0) AS m,
             coalesce(p.aplicado_capital, 0) AS c,
             coalesce(p.aplicado_interes, 0) AS i,
             coalesce(p.aplicado_mora, 0) AS mo
      FROM pagos p
      JOIN pr ON pr.id = p.prestamo_id
      WHERE p.empresa_id = v_emp
        AND p.anulado = false
        AND (v_cob IS NULL OR p.cobrador_id = v_cob)
        AND (v_caja IS NULL OR p.caja_id = v_caja)
        AND (v_ruta IS NULL OR p.ruta_id = v_ruta)
        AND (v_desde_ts IS NULL OR p.created_at >= v_desde_ts)
        AND (v_hasta_ts IS NULL OR p.created_at < v_hasta_ts)
    ) x
    GROUP BY x.cobrador_id, x.d
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
  -- Por préstamo activo, solo cuotas no pagadas (top deudores y préstamos en riesgo)
  deud AS (
    SELECT am.prestamo_id,
           sum(am.st) AS saldo,
           sum(am.st_venc) AS vencido,
           sum(am.sm) AS mora,
           greatest(coalesce(max(am.dias), 0), 0) AS dias,
           sum(am.n_venc) > 0 AS en_riesgo
    FROM am
    WHERE am.activo AND am.pendiente
    GROUP BY am.prestamo_id
  ),
  k_am AS (
    SELECT coalesce(sum(st) FILTER (WHERE pendiente), 0) AS saldo_por_cobrar,
           coalesce(sum(sc) FILTER (WHERE pendiente), 0) AS saldo_capital,
           coalesce(sum(si) FILTER (WHERE pendiente), 0) AS saldo_interes,
           coalesce(sum(sm), 0) AS mora_total,
           coalesce(sum(cp), 0) AS capital_recuperado,
           coalesce(sum(ip), 0) AS interes_recuperado,
           coalesce(sum(mp), 0) AS mora_recuperada,
           coalesce(sum(CASE WHEN status = 'Vencida' THEN n WHEN pendiente THEN n_venc ELSE 0 END), 0) AS cuotas_vencidas,
           coalesce(sum(n) FILTER (WHERE pendiente), 0) AS cuotas_pendientes,
           coalesce(sum(n) FILTER (WHERE status = 'Pagada'), 0) AS cuotas_pagadas,
           coalesce(sum(n), 0) AS total_cuotas,
           coalesce(sum(st_venc) FILTER (WHERE pendiente), 0) AS monto_vencido,
           coalesce(sum(st_hoy) FILTER (WHERE pendiente), 0) AS monto_vence_hoy,
           coalesce(sum(n_hoy) FILTER (WHERE pendiente), 0) AS cuotas_vencen_hoy,
           (SELECT count(*) FROM deud WHERE en_riesgo) AS prestamos_en_riesgo
    FROM am
    WHERE activo
  ),
  k_pg AS (
    SELECT coalesce(sum(m), 0) AS total_cobrado,
           coalesce(sum(c), 0) AS capital_cobrado,
           coalesce(sum(i), 0) AS interes_cobrado,
           coalesce(sum(mo), 0) AS mora_cobrada,
           coalesce(sum(m) FILTER (WHERE d = v_today), 0) AS cobrado_hoy,
           coalesce(sum(n) FILTER (WHERE d = v_today), 0) AS num_pagos_hoy,
           coalesce(sum(m) FILTER (WHERE date_trunc('month', d) = v_mes_ini), 0) AS cobrado_mes,
           coalesce(sum(i + mo) FILTER (WHERE date_trunc('month', d) = v_mes_ini), 0) AS ingreso_financiero_mes
    FROM pg
  ),
  k_mv AS (
    SELECT coalesce(sum(coalesce(x.monto, 0)), 0) AS gastos_mes
    FROM (
      SELECT m.monto, m.concepto, m.tipo, (m.created_at AT TIME ZONE v_tz)::date AS d
      FROM movimientos_caja m
      WHERE m.empresa_id = v_emp
        AND (v_caja IS NULL OR m.caja_id = v_caja)
        AND m.tipo::text = 'salida'
        AND (v_desde_ts IS NULL OR m.created_at >= v_desde_ts)
        AND (v_hasta_ts IS NULL OR m.created_at < v_hasta_ts)
    ) x
    WHERE date_trunc('month', x.d) = v_mes_ini
      AND lower(translate(coalesce(x.concepto, ''), 'ÁÉÍÓÚ', 'áéíóú'))
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
    FROM (SELECT * FROM deud WHERE saldo > 0 ORDER BY vencido DESC, saldo DESC, prestamo_id LIMIT 8) d
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
    LEFT JOIN (SELECT ym_reg AS ym, sum(monto) AS colocado FROM pr GROUP BY 1) col ON col.ym = u.ym
    LEFT JOIN (SELECT to_char(d, 'YYYY-MM') AS ym, sum(m) AS cobrado, sum(mo) AS mora, sum(i) AS interes, sum(c) AS capital
               FROM pg WHERE d IS NOT NULL GROUP BY 1) pm ON pm.ym = u.ym
  ),
  pies AS (
    SELECT
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value) ORDER BY value DESC, name), '[]'::jsonb)
         FROM (SELECT coalesce(estado, 'Activo') AS name, count(*) AS value FROM pr GROUP BY 1) x) AS estado,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value) ORDER BY value DESC, name), '[]'::jsonb)
         FROM (SELECT coalesce(nullif(frecuencia, ''), 'semanal') AS name, count(*) AS value FROM pr WHERE activo GROUP BY 1) x) AS frecuencia,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value) ORDER BY value DESC, name), '[]'::jsonb)
         FROM (SELECT coalesce(nullif(status, ''), 'Pendiente') AS name, sum(n) AS value FROM am WHERE activo GROUP BY 1) x) AS cuota_status
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
    'today', to_char(v_today, 'YYYY-MM-DD'),
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

-- ── 11) Pagos: listado paginado con filtros, orden y totales ────
-- p_filtros: { search, metodos[], cajas[] (nombres), rutas[] (nombres),
--              desde, hasta: 'YYYY-MM-DD' (día de negocio, México; ambos inclusivos) o instante ISO
--              (frontend anterior: se toma su fecha en hora de México), sort_key, sort_dir: 'asc'|'desc' }.
-- p_limit NULL = todas las filas filtradas. total = filas listadas (incluye anuladas, para paginar);
-- total_validos y sum_* excluyen pagos anulados.
CREATE OR REPLACE FUNCTION public.pagos_listado(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
DECLARE
  v_emp uuid := public.get_user_empresa_id();
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_q text := lower(nullif(v_f->>'search', ''));
  v_metodos text[];
  v_cajas text[];
  v_rutas text[];
  v_tz constant text := 'America/Mexico_City';
  v_desde_raw text := nullif(v_f->>'desde', '');
  v_hasta_raw text := nullif(v_f->>'hasta', '');
  v_desde timestamptz;
  v_hasta timestamptz;
  v_dir text := CASE WHEN v_f->>'sort_dir' = 'desc' THEN 'DESC' ELSE 'ASC' END;
  v_order text;
  v_sql text;
  v_result jsonb;
BEGIN
  IF v_emp IS NULL THEN
    RETURN jsonb_build_object('total', 0, 'rows', '[]'::jsonb);
  END IF;
  IF v_desde_raw IS NOT NULL THEN
    v_desde := (CASE WHEN v_desde_raw ~ '^\d{4}-\d{2}-\d{2}$' THEN v_desde_raw::date
                     ELSE (v_desde_raw::timestamptz AT TIME ZONE v_tz)::date END)::timestamp AT TIME ZONE v_tz;
  END IF;
  IF v_hasta_raw IS NOT NULL THEN
    v_hasta := ((CASE WHEN v_hasta_raw ~ '^\d{4}-\d{2}-\d{2}$' THEN v_hasta_raw::date
                      ELSE (v_hasta_raw::timestamptz AT TIME ZONE v_tz)::date END) + 1)::timestamp AT TIME ZONE v_tz;
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
      SELECT p.id, p.created_at, coalesce(p.anulado, false) AS anulado,
             coalesce(p.monto_recibido, 0) AS monto_recibido,
             coalesce(p.aplicado_mora, 0) AS aplicado_mora,
             coalesce(p.aplicado_interes, 0) AS aplicado_interes,
             coalesce(p.aplicado_capital, 0) AS aplicado_capital,
             coalesce(nullif(p.metodo_pago::text, ''), 'Efectivo') AS metodo,
             coalesce(nullif(cl.nombre_completo, ''), '—') AS cliente,
             coalesce(nullif(pr.id_prestamo, ''), 'PRE-' || left(coalesce(p.prestamo_id::text, ''), 8)) AS short_id,
             coalesce(nullif(cj.nombre, ''), '—') AS caja,
             coalesce(nullif(r.nombre, ''), '—') AS ruta
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
        AND (created_at IS NULL OR (($6::timestamptz IS NULL OR created_at >= $6) AND ($7::timestamptz IS NULL OR created_at < $7)))
    ),
    tot AS (
      SELECT count(*) AS total,
             count(*) FILTER (WHERE NOT anulado) AS total_validos,
             count(*) FILTER (WHERE anulado) AS total_anulados,
             coalesce(sum(monto_recibido) FILTER (WHERE NOT anulado), 0) AS sum_monto,
             coalesce(sum(aplicado_mora) FILTER (WHERE NOT anulado), 0) AS sum_mora,
             coalesce(sum(aplicado_interes) FILTER (WHERE NOT anulado), 0) AS sum_interes,
             coalesce(sum(aplicado_capital) FILTER (WHERE NOT anulado), 0) AS sum_capital
      FROM filt
    ),
    pagina AS (
      SELECT filt.*, row_number() OVER (ORDER BY $q$ || v_order || $q$) AS rn
      FROM filt ORDER BY $q$ || v_order || $q$ LIMIT $8 OFFSET $9
    ),
    filas AS (
      SELECT pg.rn, pg.id, p.prestamo_id, pg.created_at, p.anulado, p.cuota_id, p.caja_id, p.cobrador_id,
             to_jsonb(p.fecha_pago) #>> '{}' AS fecha_pago,
             pg.monto_recibido, pg.aplicado_mora, pg.aplicado_interes, pg.aplicado_capital,
             pg.metodo, pg.cliente, nullif(cl.telefono, '') AS cliente_telefono, pg.short_id, pg.caja, pg.ruta,
             coalesce(pr.num_cuotas, 0) AS num_cuotas
      FROM pagina pg
      JOIN pagos p ON p.id = pg.id
      LEFT JOIN prestamos pr ON pr.id = p.prestamo_id
      LEFT JOIN clientes cl ON cl.id = pr.cliente_id
    )
    SELECT jsonb_build_object(
      'total', tot.total,
      'total_validos', tot.total_validos,
      'total_anulados', tot.total_anulados,
      'sum_monto', tot.sum_monto,
      'sum_mora', tot.sum_mora,
      'sum_interes', tot.sum_interes,
      'sum_capital', tot.sum_capital,
      'empresa', (SELECT jsonb_build_object('nombre', e.nombre, 'telefono', e.telefono, 'direccion', e.direccion, 'logo_url', e.logo_url)
                  FROM empresas e WHERE e.id = $1),
      'rows', coalesce((SELECT jsonb_agg(to_jsonb(filas) - 'rn' ORDER BY filas.rn) FROM filas), '[]'::jsonb)
    )
    FROM tot
  $q$;

  EXECUTE v_sql INTO v_result
    USING v_emp, v_q, v_metodos, v_cajas, v_rutas, v_desde, v_hasta, p_limit, greatest(coalesce(p_offset, 0), 0);
  RETURN v_result;
END;
$$;

-- ── 8b) Productividad: mora vencida por asesor ──────────────────
-- p_today NULL => hoy en hora de México (antes: fecha UTC).
CREATE OR REPLACE FUNCTION public.productividad_mora(p_today date DEFAULT NULL)
RETURNS TABLE (advisor_id text, clientes_morosos integer, monto_mora numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  SELECT coalesce(p.cobrador_id::text, p.generado_por::text) AS advisor_id,
         count(DISTINCT p.cliente_id)::integer,
         sum(coalesce(a.saldo_mora, 0))
  FROM amortizacion a
  JOIN prestamos p ON p.id = a.prestamo_id
  WHERE p.empresa_id = public.get_user_empresa_id()
    AND p.estado::text IN ('Activo', 'Al día', 'Vencido')
    AND a.fecha_vencimiento::date < coalesce(p_today, (now() AT TIME ZONE 'America/Mexico_City')::date)
    AND coalesce(a.saldo_total, 0) > 0
  GROUP BY 1;
$$;

-- ── Permisos (se conservan con CREATE OR REPLACE; se reafirman) ──
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.dashboard_kpis(jsonb)',
    'public.pagos_listado(jsonb, integer, integer)',
    'public.productividad_mora(date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;
