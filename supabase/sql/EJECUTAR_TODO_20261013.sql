-- EJECUTAR TODO ronda 2 (2026-10-13): roles por empresa, reportes, integridad de pagos, cola WhatsApp, paginación, monitoreo, permisos por rol. Idempotente.

-- ===== 20261013100000_roles_empresa.sql =====
-- Roles por empresa: user_roles.empresa_id y has_role() valida la empresa actual del usuario.

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS empresa_id uuid;

UPDATE public.user_roles ur
SET empresa_id = p.empresa_id
FROM public.profiles p
WHERE p.id = ur.user_id AND ur.empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_empresa ON public.user_roles (user_id, empresa_id, role);

CREATE OR REPLACE FUNCTION public.trg_user_roles_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    SELECT empresa_id INTO NEW.empresa_id FROM public.profiles WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_roles_empresa ON public.user_roles;
CREATE TRIGGER user_roles_empresa BEFORE INSERT OR UPDATE OF user_id ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_user_roles_empresa();

-- Al mover un usuario de empresa (solo super admin vía manage-users) sus roles lo siguen.
CREATE OR REPLACE FUNCTION public.trg_profiles_roles_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
     AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.id AND lower(u.email) = 'diego.leon@uniline.mx') THEN
    UPDATE public.user_roles SET empresa_id = NEW.empresa_id WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_roles_empresa ON public.profiles;
CREATE TRIGGER profiles_roles_empresa AFTER UPDATE OF empresa_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profiles_roles_empresa();

REVOKE ALL ON FUNCTION public.trg_user_roles_empresa() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_profiles_roles_empresa() FROM PUBLIC, anon, authenticated;

-- El super admin conserva admin en cualquier empresa a la que cambie (switch_empresa).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (ur.empresa_id IS NULL
           OR ur.empresa_id = (SELECT p.empresa_id FROM public.profiles p WHERE p.id = _user_id))
  )
  OR (_role = 'admin' AND EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = _user_id AND lower(u.email) = 'diego.leon@uniline.mx'
  ))
$$;

-- ===== 20261013110000_reportes_fix.sql =====
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

-- ===== 20261013120000_pagos_integridad.sql =====
-- Pagos: flujos multi-paso en UNA transacción, bloqueo de columnas de saldo para el
-- cliente y cola de WhatsApp (outbox) procesada por la Edge Function whatsapp-sender.
-- Idempotente (CREATE OR REPLACE / IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- ORDEN DE DESPLIEGUE: la sección 6 (bloqueo de columnas) deja sin efecto las escrituras
-- directas del frontend anterior (descuento en PagoModal, descuentos de LiquidarModal,
-- estado "Prometida", EditPrestamoModal). Publica el frontend nuevo en cuanto corras esto.
-- Para correr todo MENOS el bloqueo:  SET prestapp.omitir_bloqueo_saldos = 'on';  antes del script.

-- ── 0) Llamada a registrar_pago (firma real no está en el repo) ────────────────
-- Se invoca por nombre de parámetro con literales sin tipo, así funciona sea cual sea
-- el tipo exacto de cada parámetro (date/text, numeric/float, json/jsonb).
CREATE OR REPLACE FUNCTION public._pagos_registrar_pago(
  p_prestamo_id uuid,
  p_empresa_id uuid,
  p_caja_id uuid,
  p_cobrador_id uuid,
  p_ruta_id uuid,
  p_monto numeric,
  p_metodo text,
  p_fecha_pago date,
  p_gps_lat double precision,
  p_gps_lng double precision,
  p_distribution jsonb
)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_res jsonb;
BEGIN
  EXECUTE format(
    'SELECT to_jsonb(public.registrar_pago(p_prestamo_id => %L, p_empresa_id => %L, p_caja_id => %L, '
    'p_cobrador_id => %L, p_ruta_id => %L, p_registrado_por => %L, p_monto => %L, p_metodo => %L, '
    'p_fecha_pago => %L, p_gps_lat => %L, p_gps_lng => %L, p_distribution => %L))',
    p_prestamo_id, p_empresa_id, p_caja_id, p_cobrador_id, p_ruta_id, auth.uid(), p_monto, p_metodo,
    to_char(p_fecha_pago, 'YYYY-MM-DD'), p_gps_lat, p_gps_lng, p_distribution)
    INTO v_res;
  RETURN v_res;
END $$;

-- ── 1) Pago con descuento de mora (PagoModal) ──────────────────────────────────
-- p_descuentos: [{"cuota_id": uuid, "monto": numeric}] — fija amortizacion.descuento_mora
-- (igual que hacía la UI) y luego registra el pago, todo en la misma transacción.
CREATE OR REPLACE FUNCTION public.registrar_pago_completo(
  p_prestamo_id uuid,
  p_empresa_id uuid,
  p_caja_id uuid,
  p_cobrador_id uuid,
  p_ruta_id uuid,
  p_registrado_por uuid,
  p_monto numeric,
  p_metodo text,
  p_fecha_pago date,
  p_gps_lat double precision DEFAULT NULL,
  p_gps_lng double precision DEFAULT NULL,
  p_distribution jsonb DEFAULT NULL,
  p_descuentos jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  v_d jsonb;
  v_monto numeric;
  a public.amortizacion;
BEGIN
  IF p_empresa_id IS NOT NULL AND p_empresa_id IS DISTINCT FROM v_emp THEN
    RAISE EXCEPTION 'No autorizado: empresa' USING ERRCODE = '42501';
  END IF;
  IF p_registrado_por IS NOT NULL AND p_registrado_por IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado: usuario' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_monto, 0) <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a 0'; END IF;
  IF p_fecha_pago IS NULL THEN RAISE EXCEPTION 'Indica la fecha de pago'; END IF;

  PERFORM 1 FROM public.prestamos WHERE id = p_prestamo_id AND empresa_id = v_emp FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El préstamo no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF p_ruta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.rutas WHERE id = p_ruta_id AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'La ruta no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;

  IF p_distribution IS NOT NULL AND jsonb_typeof(p_distribution) = 'array' AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_distribution) e
        WHERE NOT EXISTS (SELECT 1 FROM public.amortizacion am
                           WHERE am.id = nullif(e->>'cuotaId', '')::uuid AND am.prestamo_id = p_prestamo_id)) THEN
    RAISE EXCEPTION 'La distribución incluye cuotas que no pertenecen al préstamo' USING ERRCODE = '42501';
  END IF;

  IF p_descuentos IS NOT NULL AND jsonb_typeof(p_descuentos) <> 'null' THEN
    IF jsonb_typeof(p_descuentos) <> 'array' THEN RAISE EXCEPTION 'Descuentos inválidos'; END IF;
    FOR v_d IN SELECT value FROM jsonb_array_elements(p_descuentos) LOOP
      v_monto := round(coalesce((v_d->>'monto')::numeric, 0), 2);
      CONTINUE WHEN v_monto = 0;
      IF v_monto < 0 THEN RAISE EXCEPTION 'El descuento no puede ser negativo'; END IF;
      SELECT * INTO a FROM public.amortizacion
       WHERE id = nullif(v_d->>'cuota_id', '')::uuid AND prestamo_id = p_prestamo_id
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'La cuota del descuento no pertenece al préstamo' USING ERRCODE = '42501';
      END IF;
      IF v_monto > round(coalesce(a.saldo_mora, 0), 2) THEN
        RAISE EXCEPTION 'El descuento (%) no puede ser mayor a la mora pendiente de la cuota #% (%)',
          public._integ_fmt(v_monto), a.num_cuota, public._integ_fmt(coalesce(a.saldo_mora, 0));
      END IF;
      UPDATE public.amortizacion SET descuento_mora = v_monto WHERE id = a.id;
    END LOOP;
  END IF;

  RETURN public._pagos_registrar_pago(p_prestamo_id, v_emp, p_caja_id, p_cobrador_id, p_ruta_id,
                                      round(p_monto, 2), p_metodo, p_fecha_pago, p_gps_lat, p_gps_lng, p_distribution);
END $$;

-- ── 2) Liquidación (LiquidarModal) ─────────────────────────────────────────────
-- Replica lo que hacía la UI: condona mora/interés por cuota (descuento_mora, saldos),
-- registra el pago con la distribución, anota el préstamo y reconstruye la amortización.
-- p_modo: completo | solo_capital | descuento (con % de mora e interés).
CREATE OR REPLACE FUNCTION public.liquidar_prestamo(
  p_prestamo_id uuid,
  p_caja_id uuid,
  p_modo text,
  p_desc_mora_pct numeric DEFAULT 0,
  p_desc_interes_pct numeric DEFAULT 0,
  p_cobrador_id uuid DEFAULT NULL,
  p_ruta_id uuid DEFAULT NULL,
  p_fecha_pago date DEFAULT NULL,
  p_gps_lat double precision DEFAULT NULL,
  p_gps_lng double precision DEFAULT NULL,
  p_monto_esperado numeric DEFAULT NULL,
  p_nota text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  p public.prestamos;
  c public.amortizacion;
  v_pm numeric;
  v_pi numeric;
  s_mora numeric;
  s_int numeric;
  s_cap numeric;
  m_apl numeric;
  i_apl numeric;
  c_apl numeric;
  v_desc numeric;
  v_dist jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_cond numeric := 0;
  v_n integer := 0;
  v_nota text;
  v_res jsonb;
BEGIN
  IF p_modo NOT IN ('completo', 'solo_capital', 'descuento') THEN
    RAISE EXCEPTION 'Tipo de liquidación inválido';
  END IF;
  IF p_modo = 'descuento' AND (coalesce(p_desc_mora_pct, 0) NOT BETWEEN 0 AND 100
                               OR coalesce(p_desc_interes_pct, 0) NOT BETWEEN 0 AND 100) THEN
    RAISE EXCEPTION 'El porcentaje de descuento debe estar entre 0 y 100';
  END IF;

  SELECT * INTO p FROM public.prestamos WHERE id = p_prestamo_id AND empresa_id = v_emp FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El préstamo no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF p.estado IN ('Liquidado', 'Cancelado', 'Reestructurado') THEN
    RAISE EXCEPTION 'El préstamo ya está %', lower(p.estado::text);
  END IF;
  PERFORM public._integ_lock_caja(p_caja_id, v_emp);
  IF p_ruta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.rutas WHERE id = p_ruta_id AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'La ruta no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;

  v_pm := CASE p_modo WHEN 'solo_capital' THEN 1 WHEN 'descuento' THEN coalesce(p_desc_mora_pct, 0) / 100 ELSE 0 END;
  v_pi := CASE p_modo WHEN 'solo_capital' THEN 1 WHEN 'descuento' THEN coalesce(p_desc_interes_pct, 0) / 100 ELSE 0 END;

  FOR c IN
    SELECT * FROM public.amortizacion
     WHERE prestamo_id = p.id AND coalesce(saldo_total, 0) > 0
     ORDER BY num_cuota
     FOR UPDATE
  LOOP
    s_mora := coalesce(c.saldo_mora, 0);
    s_int := coalesce(c.saldo_interes, 0);
    s_cap := coalesce(c.saldo_capital, 0);
    m_apl := round(s_mora * (1 - v_pm), 2);
    i_apl := round(s_int * (1 - v_pi), 2);
    c_apl := round(s_cap, 2);
    v_desc := GREATEST(0, s_mora - m_apl) + GREATEST(0, s_int - i_apl);

    IF v_pm > 0 OR v_pi > 0 THEN
      IF v_desc > 0 THEN
        UPDATE public.amortizacion
           SET descuento_mora = round(v_desc, 2),
               saldo_mora = GREATEST(0, m_apl),
               saldo_interes = GREATEST(0, i_apl),
               saldo_total = GREATEST(0, s_cap + GREATEST(0, i_apl) + GREATEST(0, m_apl))
         WHERE id = c.id;
      END IF;
      v_cond := v_cond + v_desc;
    END IF;

    IF c_apl > 0 OR i_apl > 0 OR m_apl > 0 THEN
      v_dist := v_dist || jsonb_build_array(jsonb_build_object(
        'cuotaId', c.id, 'capital', GREATEST(c_apl, 0), 'interes', GREATEST(i_apl, 0), 'mora', GREATEST(m_apl, 0)));
      v_total := v_total + GREATEST(c_apl, 0) + GREATEST(i_apl, 0) + GREATEST(m_apl, 0);
      v_n := v_n + 1;
    END IF;
  END LOOP;

  IF v_total <= 0 THEN RAISE EXCEPTION 'El préstamo no tiene saldo por liquidar'; END IF;
  IF p_monto_esperado IS NOT NULL AND abs(round(p_monto_esperado, 2) - v_total) > GREATEST(0.01, 0.01 * v_n) THEN
    RAISE EXCEPTION 'Los saldos del préstamo cambiaron (a cobrar ahora: %). Recarga e intenta de nuevo', public._integ_fmt(v_total);
  END IF;

  v_res := public._pagos_registrar_pago(p.id, v_emp, p_caja_id, p_cobrador_id, p_ruta_id, v_total, 'Efectivo',
                                        coalesce(p_fecha_pago, (now() AT TIME ZONE 'America/Mexico_City')::date),
                                        p_gps_lat, p_gps_lng, v_dist);

  v_nota := nullif(btrim(left(coalesce(p_nota, ''), 500)), '');
  IF v_nota IS NULL THEN
    v_nota := CASE p_modo
      WHEN 'completo' THEN 'Liquidación total'
      WHEN 'solo_capital' THEN format('Liquidación solo capital (condonado: %s)', public._integ_fmt(v_cond))
      ELSE format('Liquidación con descuento mora %s%%%s (condonado: %s)', round(coalesce(p_desc_mora_pct, 0), 2),
                  CASE WHEN coalesce(p_desc_interes_pct, 0) > 0 THEN format(' + interés %s%%', round(p_desc_interes_pct, 2)) ELSE '' END,
                  public._integ_fmt(v_cond))
    END;
  END IF;
  UPDATE public.prestamos SET notas = v_nota WHERE id = p.id;

  PERFORM public.rebuild_amortizacion(p.id);

  RETURN jsonb_build_object('prestamo_id', p.id, 'monto', v_total, 'condonado', round(v_cond, 2),
                            'cuotas', v_n, 'pago', v_res);
END $$;

-- ── 3) Promesas y visitas (PromesaModal / VisitaModal) ─────────────────────────

CREATE OR REPLACE FUNCTION public._pagos_promesa(p_emp uuid, p_prestamo_id uuid, p_cuota_id uuid, p_monto numeric, p_fecha date, p_notas text)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF coalesce(p_monto, 0) <= 0 THEN RAISE EXCEPTION 'El monto prometido debe ser mayor a 0'; END IF;
  IF p_fecha IS NULL THEN RAISE EXCEPTION 'Indica la fecha de la promesa'; END IF;
  IF p_cuota_id IS NOT NULL THEN
    PERFORM 1 FROM public.amortizacion WHERE id = p_cuota_id AND prestamo_id = p_prestamo_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La cuota no pertenece al préstamo' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.promesas_pago (prestamo_id, cuota_id, monto_prometido, fecha_prometida, notas, status, empresa_id)
  VALUES (p_prestamo_id, p_cuota_id, round(p_monto, 2), p_fecha, nullif(btrim(coalesce(p_notas, '')), ''), 'Pendiente', p_emp)
  RETURNING id INTO v_id;

  IF p_cuota_id IS NOT NULL THEN
    UPDATE public.amortizacion SET status = 'Prometida'
     WHERE id = p_cuota_id AND status IS DISTINCT FROM 'Pagada';
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.registrar_promesa_pago(
  p_prestamo_id uuid,
  p_cuota_id uuid,
  p_monto numeric,
  p_fecha date,
  p_notas text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.prestamos WHERE id = p_prestamo_id AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'El préstamo no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('promesa_id',
    public._pagos_promesa(v_emp, p_prestamo_id, p_cuota_id, p_monto, p_fecha, p_notas));
END $$;

CREATE OR REPLACE FUNCTION public.registrar_visita(
  p_prestamo_id uuid,
  p_cliente_id uuid,
  p_resultado text,
  p_notas text DEFAULT NULL,
  p_cuota_id uuid DEFAULT NULL,
  p_monto_promesa numeric DEFAULT NULL,
  p_fecha_promesa date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  v_cliente uuid;
  v_promesa boolean := p_resultado = 'promesa_pago' AND p_fecha_promesa IS NOT NULL;
  v_gestion uuid;
  v_prom uuid;
BEGIN
  IF coalesce(btrim(p_resultado), '') = '' THEN RAISE EXCEPTION 'Indica el resultado de la visita'; END IF;
  SELECT cliente_id INTO v_cliente FROM public.prestamos WHERE id = p_prestamo_id AND empresa_id = v_emp;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El préstamo no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF p_cliente_id IS NOT NULL AND p_cliente_id IS DISTINCT FROM v_cliente
     AND NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'El cliente no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.crm_gestiones (empresa_id, prestamo_id, cliente_id, tipo_gestion, resultado, notas,
                                    fecha_seguimiento, registrado_por)
  VALUES (v_emp, p_prestamo_id, coalesce(p_cliente_id, v_cliente), 'visita', p_resultado,
          nullif(btrim(coalesce(p_notas, '')), ''), CASE WHEN v_promesa THEN p_fecha_promesa END, auth.uid())
  RETURNING id INTO v_gestion;

  IF v_promesa THEN
    v_prom := public._pagos_promesa(v_emp, p_prestamo_id, p_cuota_id, p_monto_promesa, p_fecha_promesa, p_notas);
  END IF;

  RETURN jsonb_build_object('gestion_id', v_gestion, 'promesa_id', v_prom);
END $$;

-- ── 4) Edición de condiciones del préstamo (EditPrestamoModal) ─────────────────
-- Actualiza las claves presentes en p_datos, reconstruye la amortización y, si cambió la
-- caja, mueve el desembolso (entrada en la caja anterior, salida en la nueva).
CREATE OR REPLACE FUNCTION public.editar_prestamo(p_prestamo_id uuid, p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp uuid := public._integ_empresa();
  p public.prestamos;
  d jsonb := coalesce(p_datos, '{}'::jsonb);
  v_caja uuid;
  v_ruta uuid;
  v_cob uuid;
  v_folio text;
  v_monto numeric;
  c public.cajas;
BEGIN
  IF jsonb_typeof(d) <> 'object' THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
  SELECT * INTO p FROM public.prestamos WHERE id = p_prestamo_id AND empresa_id = v_emp FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El préstamo no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;

  v_caja := CASE WHEN d ? 'caja_id' THEN nullif(d->>'caja_id', '')::uuid ELSE p.caja_id END;
  v_ruta := CASE WHEN d ? 'ruta_id' THEN nullif(d->>'ruta_id', '')::uuid ELSE p.ruta_id END;
  v_cob := CASE WHEN d ? 'cobrador_id' THEN nullif(d->>'cobrador_id', '')::uuid ELSE p.cobrador_id END;
  IF v_caja IS DISTINCT FROM p.caja_id AND v_caja IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.cajas WHERE id = v_caja AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'La caja no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF v_ruta IS DISTINCT FROM p.ruta_id AND v_ruta IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.rutas WHERE id = v_ruta AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'La ruta no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF v_cob IS DISTINCT FROM p.cobrador_id AND NOT public._integ_cobrador_ok(v_cob, v_emp) THEN
    RAISE EXCEPTION 'El cobrador no existe o no pertenece a tu empresa' USING ERRCODE = '42501';
  END IF;
  IF coalesce((d->>'tasa_interes')::numeric, 0) < 0 OR coalesce((d->>'valor_mora')::numeric, 0) < 0
     OR coalesce((d->>'gastos_legales')::numeric, 0) < 0 THEN
    RAISE EXCEPTION 'Los valores no pueden ser negativos';
  END IF;

  -- El saldo de la caja nueva se valida antes de reasignar el préstamo (caja_saldos ya
  -- descuenta monto_solicitado de los préstamos que apuntan a la caja).
  v_monto := coalesce(p.monto_solicitado, 0);
  IF v_caja IS DISTINCT FROM p.caja_id AND v_caja IS NOT NULL AND v_monto > 0 THEN
    c := public._integ_lock_caja(v_caja, v_emp);
    PERFORM public._integ_check_saldo(c, v_monto);
  END IF;

  UPDATE public.prestamos SET
    tasa_interes = CASE WHEN d ? 'tasa_interes' THEN (d->>'tasa_interes')::numeric ELSE tasa_interes END,
    tipo_mora = CASE WHEN d ? 'tipo_mora' THEN nullif(d->>'tipo_mora', '')::public.tipo_mora ELSE tipo_mora END,
    valor_mora = CASE WHEN d ? 'valor_mora' THEN coalesce((d->>'valor_mora')::numeric, 0) ELSE valor_mora END,
    gastos_legales = CASE WHEN d ? 'gastos_legales' THEN coalesce((d->>'gastos_legales')::numeric, 0) ELSE gastos_legales END,
    caja_id = v_caja,
    ruta_id = v_ruta,
    cobrador_id = v_cob,
    notas = CASE WHEN d ? 'notas' THEN nullif(d->>'notas', '') ELSE notas END,
    codigo_interno = CASE WHEN d ? 'codigo_interno' THEN nullif(d->>'codigo_interno', '') ELSE codigo_interno END
  WHERE id = p.id;

  PERFORM public.rebuild_amortizacion(p.id);

  IF v_caja IS DISTINCT FROM p.caja_id AND v_monto > 0 THEN
    v_folio := coalesce(nullif(p.id_prestamo, ''), left(p.id::text, 8));
    IF p.caja_id IS NOT NULL THEN
      PERFORM public._integ_lock_caja(p.caja_id, v_emp);
      INSERT INTO public.movimientos_caja (caja_id, tipo, monto, prestamo_id, concepto, empresa_id, registrado_por)
      VALUES (p.caja_id, 'entrada', v_monto, p.id,
              format('Corrección desembolso %s — salida de caja anterior', v_folio), v_emp, auth.uid());
    END IF;
    IF v_caja IS NOT NULL THEN
      INSERT INTO public.movimientos_caja (caja_id, tipo, monto, prestamo_id, concepto, empresa_id, registrado_por)
      VALUES (v_caja, 'salida', v_monto, p.id,
              format('Corrección desembolso %s — cambio de caja', v_folio), v_emp, auth.uid());
    END IF;
  END IF;

  RETURN jsonb_build_object('prestamo_id', p.id, 'caja_cambio', v_caja IS DISTINCT FROM p.caja_id);
END $$;

-- ── 5) Cola de WhatsApp (outbox) ───────────────────────────────────────────────
-- El navegador solo inserta filas; whatsapp-sender {action:"process-queue"} las envía con
-- reintentos (backoff exponencial, máx. 6 intentos) y registra en whatsapp_log.
CREATE TABLE IF NOT EXISTS public.whatsapp_cola (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  telefono text NOT NULL,
  tipo text NOT NULL DEFAULT 'manual',
  mensaje text,
  media_url text,
  media_tipo text,
  media_nombre text,
  referencia_id uuid,
  estado text NOT NULL DEFAULT 'pendiente',
  intentos integer NOT NULL DEFAULT 0,
  ultimo_error text,
  proximo_intento timestamptz NOT NULL DEFAULT now(),
  creado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  enviado_at timestamptz,
  CONSTRAINT whatsapp_cola_estado_chk CHECK (estado IN ('pendiente', 'enviando', 'enviado', 'error')),
  CONSTRAINT whatsapp_cola_media_chk CHECK (
    (media_tipo IS NULL AND media_url IS NULL)
    OR (media_tipo IN ('image', 'file') AND media_url ~ '^https://')),
  CONSTRAINT whatsapp_cola_contenido_chk CHECK (coalesce(btrim(mensaje), '') <> '' OR media_url IS NOT NULL),
  CONSTRAINT whatsapp_cola_telefono_chk CHECK (length(telefono) BETWEEN 6 AND 32)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_cola_due ON public.whatsapp_cola (proximo_intento)
  WHERE estado IN ('pendiente', 'enviando');
CREATE INDEX IF NOT EXISTS idx_whatsapp_cola_empresa ON public.whatsapp_cola (empresa_id, created_at DESC);

ALTER TABLE public.whatsapp_cola ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_cola FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.whatsapp_cola TO authenticated;
GRANT INSERT (empresa_id, telefono, tipo, mensaje, media_url, media_tipo, media_nombre, referencia_id)
  ON TABLE public.whatsapp_cola TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_cola TO service_role;

DROP POLICY IF EXISTS whatsapp_cola_select ON public.whatsapp_cola;
CREATE POLICY whatsapp_cola_select ON public.whatsapp_cola FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.get_user_empresa_id()));
DROP POLICY IF EXISTS whatsapp_cola_insert ON public.whatsapp_cola;
CREATE POLICY whatsapp_cola_insert ON public.whatsapp_cola FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT public.get_user_empresa_id()));

-- Reclama filas vencidas (pendientes, o "enviando" cuyo lease de 10 min expiró) sin
-- bloquear a otros procesos (SKIP LOCKED). Cada reclamo cuenta como intento.
CREATE OR REPLACE FUNCTION public.whatsapp_cola_claim(p_limit integer DEFAULT 50, p_empresa uuid DEFAULT NULL)
RETURNS SETOF public.whatsapp_cola LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.whatsapp_cola
     SET estado = 'error', ultimo_error = coalesce(ultimo_error, 'Sin confirmación de envío')
   WHERE estado = 'enviando' AND proximo_intento <= now() AND intentos >= 6
     AND (p_empresa IS NULL OR empresa_id = p_empresa);

  RETURN QUERY
  UPDATE public.whatsapp_cola q
     SET estado = 'enviando', intentos = q.intentos + 1, proximo_intento = now() + interval '10 minutes'
   WHERE q.id IN (
     SELECT w.id FROM public.whatsapp_cola w
      WHERE w.estado IN ('pendiente', 'enviando') AND w.proximo_intento <= now() AND w.intentos < 6
        AND (p_empresa IS NULL OR w.empresa_id = p_empresa)
      ORDER BY w.proximo_intento, w.created_at
      LIMIT GREATEST(1, LEAST(coalesce(p_limit, 50), 200))
      FOR UPDATE SKIP LOCKED)
  RETURNING q.*;
END $$;

-- Resultado de un envío: enviado, o de vuelta a pendiente con backoff 2^intentos min
-- (2, 4, 8, 16, 32), o error al 6.º intento / error permanente.
CREATE OR REPLACE FUNCTION public.whatsapp_cola_resultado(p_id uuid, p_ok boolean, p_error text DEFAULT NULL, p_permanente boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_estado text;
BEGIN
  UPDATE public.whatsapp_cola SET
    estado = CASE WHEN p_ok THEN 'enviado' WHEN p_permanente OR intentos >= 6 THEN 'error' ELSE 'pendiente' END,
    enviado_at = CASE WHEN p_ok THEN now() ELSE enviado_at END,
    ultimo_error = CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_error, 'Error desconocido'), 1000) END,
    proximo_intento = CASE WHEN p_ok THEN proximo_intento
                           ELSE now() + make_interval(mins => LEAST(60, power(2, GREATEST(intentos, 1))::int)) END
  WHERE id = p_id AND estado = 'enviando'
  RETURNING estado INTO v_estado;
  RETURN v_estado;
END $$;

-- Devuelve a pendiente (sin contar intento) filas reclamadas que no alcanzaron a enviarse.
CREATE OR REPLACE FUNCTION public.whatsapp_cola_liberar(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.whatsapp_cola
     SET estado = 'pendiente', intentos = GREATEST(0, intentos - 1), proximo_intento = now()
   WHERE id = ANY(p_ids) AND estado = 'enviando';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ── Permisos de funciones ──────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._pagos_registrar_pago(uuid, uuid, uuid, uuid, uuid, numeric, text, date, double precision, double precision, jsonb)',
    'public._pagos_promesa(uuid, uuid, uuid, numeric, date, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.whatsapp_cola_claim(integer, uuid)',
    'public.whatsapp_cola_resultado(uuid, boolean, text, boolean)',
    'public.whatsapp_cola_liberar(uuid[])'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.registrar_pago_completo(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, date, double precision, double precision, jsonb, jsonb)',
    'public.liquidar_prestamo(uuid, uuid, text, numeric, numeric, uuid, uuid, date, double precision, double precision, numeric, text)',
    'public.registrar_promesa_pago(uuid, uuid, numeric, date, text)',
    'public.registrar_visita(uuid, uuid, text, text, uuid, numeric, date)',
    'public.editar_prestamo(uuid, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- ── 6) Bloqueo de columnas de dinero para el cliente ───────────────────────────
-- Las escrituras de saldos solo ocurren dentro de RPC SECURITY DEFINER. Lista blanca
-- (columnas que el frontend aún actualiza directamente):
--   amortizacion: avisado                         (PrestamoDetallePage "marcar avisado")
--   pagos:        (ninguna)
--   prestamos:    ruta_id, cobrador_id            (ReasignarModal)
--                 cobro_automatico_stripe         (PrestamoDetallePage)
-- INSERT/DELETE directos: ningún cliente inserta ni borra en amortizacion/pagos, ni
-- inserta en prestamos (crear_prestamo / reestructurar_prestamo / delete-prestamo).
-- Si una función SECURITY INVOKER ejecutable por el cliente (o un trigger) escribe la
-- tabla, el bloqueo de esa tabla se OMITE con WARNING para no romperla.
DO $lock$
DECLARE
  t text;
  v_bloq text;
  v_all text;
  v_cfg jsonb := '{
    "amortizacion": {"ops": "INSERT, UPDATE, DELETE", "cols": ["avisado"]},
    "pagos":        {"ops": "INSERT, UPDATE, DELETE", "cols": []},
    "prestamos":    {"ops": "INSERT, UPDATE",         "cols": ["ruta_id", "cobrador_id", "cobro_automatico_stripe"]}
  }';
  v_cols text;
BEGIN
  IF coalesce(current_setting('prestapp.omitir_bloqueo_saldos', true), '') = 'on' THEN
    RAISE NOTICE 'Bloqueo de saldos omitido (prestapp.omitir_bloqueo_saldos = on)';
    RETURN;
  END IF;

  FOR t IN SELECT jsonb_object_keys(v_cfg) LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;

    SELECT string_agg(DISTINCT format('ALTER FUNCTION %s SECURITY DEFINER SET search_path = public;', p.oid::regprocedure), ' ') INTO v_bloq
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prokind = 'f'
       AND NOT p.prosecdef
       AND p.prosrc ~* ('(update\s+(only\s+)?(public\.)?' || t || '|insert\s+into\s+(public\.)?' || t
                        || '|delete\s+from\s+(only\s+)?(public\.)?' || t || ')\M')
       AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
            OR EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgfoid = p.oid AND NOT tg.tgisinternal));
    IF v_bloq IS NOT NULL THEN
      RAISE WARNING 'Bloqueo de "%" OMITIDO: funciones SECURITY INVOKER (RPC o trigger) la escriben con permisos del usuario. Revisa que tengan guarda de tenant, ejecuta: % y vuelve a correr esta sección.', t, v_bloq;
      CONTINUE;
    END IF;

    SELECT string_agg(quote_ident(attname), ', ') INTO v_all
      FROM pg_attribute WHERE attrelid = ('public.' || t)::regclass AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE %s ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_cfg->t->>'ops', t);
    EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_all, v_all, t);

    SELECT string_agg(quote_ident(c), ', ') INTO v_cols
      FROM jsonb_array_elements_text(v_cfg->t->'cols') c
     WHERE EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = ('public.' || t)::regclass AND attname = c AND NOT attisdropped);
    IF v_cols IS NOT NULL THEN
      EXECUTE format('GRANT UPDATE (%s) ON TABLE public.%I TO authenticated', v_cols, t);
    END IF;
    RAISE NOTICE 'Bloqueo aplicado en %: sin %; UPDATE permitido solo en (%)', t, v_cfg->t->>'ops', coalesce(v_cols, 'ninguna');
  END LOOP;
END $lock$;

-- ── 7) (Opcional) pg_cron: procesar la cola cada 5 minutos ─────────────────────
-- Usa la clave publicable (pública); whatsapp-sender solo procesa filas ya encoladas
-- y limita estas llamadas con cron_claim('whatsapp-queue', 1).
DO $cron$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron no disponible: %', SQLERRM;
  END;
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_net;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_net no disponible: %', SQLERRM;
    END;
  END;

  IF to_regnamespace('cron') IS NULL OR to_regnamespace('net') IS NULL THEN
    RAISE NOTICE 'Job whatsapp-cola no creado (faltan pg_cron/pg_net); la cola se procesa desde la app y whatsapp-cron';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'whatsapp-cola';
    PERFORM cron.schedule('whatsapp-cola', '*/5 * * * *', $job$
      SELECT net.http_post(
        url := 'https://oewuzgugsjqtznmgnfhp.supabase.co/functions/v1/whatsapp-sender',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld3V6Z3Vnc2pxdHpubWduZmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDQ1NDgsImV4cCI6MjA4ODkyMDU0OH0.sLR4Y7cBqD9bqT4KRc6CUTUxJ2y_BqoQ0l15Avk5BbU',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld3V6Z3Vnc2pxdHpubWduZmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDQ1NDgsImV4cCI6MjA4ODkyMDU0OH0.sLR4Y7cBqD9bqT4KRc6CUTUxJ2y_BqoQ0l15Avk5BbU'),
        body := jsonb_build_object('action', 'process-queue'),
        timeout_milliseconds := 120000
      );
    $job$);
    RAISE NOTICE 'Job whatsapp-cola programado cada 5 minutos';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo programar whatsapp-cola: %', SQLERRM;
  END;
END $cron$;

-- ===== 20261013130000_paginacion.sql =====
-- Paginación y agregados en servidor para pantallas que descargaban tablas completas del tenant
-- (Clientes, Auditoría, CRM Cobranza, Renovación, Mapa GPS, Lead Scoring, Promesas, Gastos,
-- detalle de caja: kardex/stats/flujo/pestañas de origen, atendidos de la semana).
-- Funciones de solo lectura: SECURITY INVOKER (RLS sigue aplicando) + filtro explícito
-- empresa_id = get_user_empresa_id(). Idempotente y aditivo: el frontend anterior sigue funcionando.

-- ── Índices de soporte ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_created        ON public.clientes (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prestamos_cliente               ON public.prestamos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_crm_gestiones_empresa_created   ON public.crm_gestiones (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promesas_pago_empresa_created   ON public.promesas_pago (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promesas_pago_empresa_fecha     ON public.promesas_pago (empresa_id, fecha_prometida, id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_empresa_created     ON public.solicitudes_prestamo (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_empresa_anulado_en        ON public.pagos (empresa_id, (coalesce(anulado_en, created_at)) DESC) WHERE anulado;
CREATE INDEX IF NOT EXISTS idx_pagos_caja_created              ON public.pagos (caja_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prestamos_caja_created          ON public.prestamos (caja_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_caja_fecha_id  ON public.movimientos_caja (caja_id, created_at, id) INCLUDE (tipo, monto);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_salidas        ON public.movimientos_caja (empresa_id, created_at DESC) WHERE tipo = 'salida';
CREATE INDEX IF NOT EXISTS idx_clientes_gps                    ON public.clientes (empresa_id, gps_lat, gps_lng) WHERE gps_lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prestamos_gps                   ON public.prestamos (empresa_id, gps_lat, gps_lng) WHERE gps_lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_gps                       ON public.pagos (empresa_id, gps_lat, gps_lng) WHERE gps_lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_gps_created               ON public.pagos (empresa_id, created_at DESC) WHERE gps_lat IS NOT NULL;

-- ── Helpers puros ────────────────────────────────────────────────
-- Sin SET search_path a propósito: solo usan funciones de pg_catalog (siempre primero en la ruta)
-- y así _lower_es se puede "inlinear" y las demás no pagan el cambio de GUC en cada fila.
-- lower() con acentos en mayúscula normalizados (igual que String#toLowerCase para español).
CREATE OR REPLACE FUNCTION public._lower_es(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(translate(coalesce(p, ''), 'ÁÉÍÓÚÜÑ', 'áéíóúüñ'));
$$;

-- Igual que classifyConcepto() del kardex de caja (CajaDetallePage).
CREATE OR REPLACE FUNCTION public._kardex_categoria(p_concepto text, p_tipo text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  l text := lower(translate(coalesce(p_concepto, ''), 'ÁÉÍÓÚÜÑ', 'áéíóúüñ'));
BEGIN
  RETURN CASE
    WHEN strpos(l, 'corrección') > 0 OR strpos(l, 'correccion') > 0 OR strpos(l, 'movido a caja') > 0 THEN 'Correcciones'
    WHEN strpos(l, 'anulación') > 0 OR strpos(l, 'anulacion') > 0 THEN 'Anulaciones'
    WHEN strpos(l, 'pago') > 0 OR strpos(l, 'cobro') > 0 OR strpos(l, 'cuota') > 0 THEN 'Pagos'
    WHEN strpos(l, 'desembolso') > 0 OR strpos(l, 'préstamo') > 0 THEN 'Desembolsos'
    WHEN strpos(l, 'comisión') > 0 OR strpos(l, 'comision') > 0 OR strpos(l, 'corte') > 0 THEN 'Comisiones'
    WHEN strpos(l, 'transferencia') > 0 THEN 'Transferencias'
    WHEN strpos(l, '[') > 0 OR strpos(l, 'gasto') > 0 THEN 'Gastos'
    WHEN p_tipo = 'entrada' THEN 'Depósitos'
    ELSE 'Retiros'
  END;
END;
$$;

-- Igual que extractCategoria() de GastosPage.
CREATE OR REPLACE FUNCTION public._gasto_categoria(p_concepto text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  l text := lower(translate(coalesce(p_concepto, ''), 'ÁÉÍÓÚÜÑ', 'áéíóúüñ'));
BEGIN
  RETURN CASE
    WHEN strpos(l, '[oficina]') > 0 THEN 'Oficina'
    WHEN strpos(l, '[transporte]') > 0 THEN 'Transporte'
    WHEN strpos(l, '[servicios]') > 0 THEN 'Servicios'
    WHEN strpos(l, '[salarios]') > 0 THEN 'Salarios'
    WHEN strpos(l, '[comisiones]') > 0 OR strpos(l, 'comisión cobrador') > 0 THEN 'Comisiones'
    WHEN strpos(l, '[papelería]') > 0 THEN 'Papelería'
    WHEN strpos(l, '[mantenimiento]') > 0 THEN 'Mantenimiento'
    WHEN strpos(l, '[marketing]') > 0 THEN 'Marketing'
    WHEN strpos(l, '[legal]') > 0 THEN 'Legal'
    WHEN strpos(l, '[impuestos]') > 0 THEN 'Impuestos'
    WHEN strpos(l, '[otros]') > 0 THEN 'Otros'
    WHEN strpos(l, 'desembolso') > 0 OR strpos(l, 'préstamo') > 0 THEN 'Desembolso'
    WHEN strpos(l, 'corte') > 0 OR strpos(l, 'comisión') > 0 THEN 'Comisiones'
    ELSE 'Otros'
  END;
END;
$$;

-- Puerto exacto de calcularScore() (LeadScoringPage), aritmética float8 como en JS.
CREATE OR REPLACE FUNCTION public._lead_score(
  p_total_prestamos integer,
  p_liquidados integer,
  p_a_tiempo integer,
  p_totales integer,
  p_tarde integer,
  p_vencidas integer,
  p_avg_dias double precision,
  p_max_dias integer,
  p_saldo numeric,
  p_monto_historico numeric,
  p_gracia integer,
  OUT score integer,
  OUT nivel text,
  OUT recomendacion text,
  OUT icono text
)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  s double precision := 0;
  v_pagadas integer := p_a_tiempo + p_tarde;
  v_reales integer;
  v_avg double precision;
BEGIN
  IF p_total_prestamos = 0 THEN
    score := -1;
    nivel := 'Nuevo';
    recomendacion := '⚪ Sin historial crediticio. Cliente nuevo — evaluar capacidad de pago antes de otorgar primer préstamo.';
    icono := 'avales';
    RETURN;
  END IF;

  IF p_totales > 0 THEN s := s + (v_pagadas::float8 / p_totales) * 45; END IF;
  IF v_pagadas > 0 THEN s := s + (p_a_tiempo::float8 / v_pagadas) * 15; END IF;
  s := s + (p_liquidados::float8 / p_total_prestamos) * 15;
  IF p_total_prestamos >= 2 THEN s := s + 3; END IF;
  IF p_total_prestamos >= 4 THEN s := s + 3; END IF;
  IF p_monto_historico >= 5000 THEN s := s + 2; END IF;
  IF p_monto_historico >= 15000 THEN s := s + 2; END IF;

  s := s - least(20, p_vencidas * 3);

  v_reales := greatest(0, p_max_dias - p_gracia);
  IF v_reales > 0 THEN
    IF v_reales <= 7 THEN
      s := s - v_reales * 0.3::float8;
    ELSIF v_reales <= 30 THEN
      s := s - (2 + (v_reales - 7) * 0.35::float8);
    ELSIF v_reales <= 90 THEN
      s := s - (10 + (v_reales - 30) * 0.17::float8);
    ELSE
      s := s - 20;
    END IF;
  END IF;

  v_avg := greatest(0::float8, p_avg_dias - p_gracia);
  s := s - least(10::float8, v_avg * 0.3::float8);

  score := greatest(0, least(100, floor(s + 0.5)::integer));

  IF score >= 85 THEN
    nivel := 'Excelente';
    recomendacion := '🟢 Excelente pagador. Aumentar línea de crédito. Cliente confiable para montos mayores.';
    icono := 'aumentar';
  ELSIF score >= 70 THEN
    nivel := 'Bueno';
    recomendacion := '🔵 Buen historial. Se le puede prestar con confianza. Considerar aumentar monto gradualmente.';
    icono := 'prestar';
  ELSIF score >= 50 THEN
    nivel := 'Regular';
    recomendacion := '🟡 Historial mixto. Prestar con precaución, mismo monto o menor. Considerar aval.';
    icono := 'avales';
  ELSIF score >= 30 THEN
    nivel := 'Riesgoso';
    recomendacion := '🟠 Alto riesgo. No aumentar monto. Exigir avales sólidos y garantías.';
    icono := 'avales';
  ELSE
    nivel := 'Crítico';
    recomendacion := '🔴 No prestar. Historial muy negativo. Si tiene saldo pendiente, gestionar cobro prioritario.';
    icono := 'no_prestar';
  END IF;

  IF score >= 60 AND p_saldo > 0 AND p_vencidas = 0 THEN
    recomendacion := recomendacion || ' 📅 Próximo a liquidar — preparar oferta de renovación.';
    icono := 'vencimiento';
  END IF;
END;
$$;

-- ── 1) Clientes: estados de cuenta paginados ─────────────────────
CREATE OR REPLACE FUNCTION public.estados_cuenta_listado(p_search text DEFAULT NULL, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
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
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
  WITH q AS (SELECT lower(nullif(p_search, '')) AS q),
  pr AS (
    SELECT p.id, p.cliente_id, p.cobrador_id
    FROM prestamos p
    WHERE p.empresa_id = v_emp AND p.estado IN ('Activo', 'Al día', 'Vencido')
  ),
  cu AS (
    SELECT pr.cliente_id,
           sum(coalesce(a.saldo_total, 0)) AS saldo_total,
           count(*) FILTER (WHERE a.status = 'Vencida') AS cuotas_vencidas,
           coalesce(sum(coalesce(a.saldo_total, 0)) FILTER (WHERE a.status = 'Vencida'), 0) AS saldo_moroso
    FROM amortizacion a
    JOIN pr ON pr.id = a.prestamo_id
    WHERE a.empresa_id = v_emp AND a.status <> 'Pagada'
    GROUP BY pr.cliente_id
  ),
  f AS (
    SELECT c.id, c.id_cliente, c.nombre_completo, cu.saldo_total, cu.cuotas_vencidas, cu.saldo_moroso
    FROM clientes c
    CROSS JOIN q
    JOIN cu ON cu.cliente_id = c.id
    WHERE c.empresa_id = v_emp
      AND c.activo = true
      AND (cu.saldo_total > 0 OR cu.cuotas_vencidas > 0)
      AND (q.q IS NULL OR strpos(lower(c.nombre_completo), q.q) > 0 OR strpos(lower(c.id_cliente), q.q) > 0)
  ),
  pagina AS (
    SELECT f.*, row_number() OVER (ORDER BY f.nombre_completo, f.id) AS rn
    FROM f
    ORDER BY f.nombre_completo, f.id
    LIMIT p_limit OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'saldo_total', (SELECT coalesce(sum(saldo_total), 0) FROM f),
    'saldo_moroso', (SELECT coalesce(sum(saldo_moroso), 0) FROM f),
    'cuotas_vencidas', (SELECT coalesce(sum(cuotas_vencidas), 0) FROM f),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'cliente_id', pg.id,
               'id_cliente', pg.id_cliente,
               'nombre_completo', pg.nombre_completo,
               'saldo_total', pg.saldo_total,
               'cuotas_vencidas', pg.cuotas_vencidas,
               'saldo_moroso', pg.saldo_moroso,
               'cobrador_nombre', (
                 SELECT pf.nombre_completo
                 FROM pr JOIN profiles pf ON pf.id = pr.cobrador_id
                 WHERE pr.cliente_id = pg.id AND coalesce(pf.nombre_completo, '') <> ''
                 ORDER BY pr.id LIMIT 1)
             ) ORDER BY pg.rn)
      FROM pagina pg), '[]'::jsonb)
  )
  );
END;
$$;

-- ── 2) Atendidos de la semana (pagos + gestiones) ────────────────
-- Sin p_cliente_ids / p_prestamo_ids: todos los atendidos de la semana.
-- Con alguno: solo se evalúan esos ids (p. ej. la página visible); NULL => lista de salida vacía.
-- Las gestiones usan el rango [desde 00:00:00, hasta 23:59:59] en la zona de la sesión (igual que antes vía PostgREST).
CREATE OR REPLACE FUNCTION public.atendidos_semana(
  p_desde date,
  p_hasta date,
  p_cliente_ids uuid[] DEFAULT NULL,
  p_prestamo_ids uuid[] DEFAULT NULL
)
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
  v_ini timestamptz := p_desde::timestamp::timestamptz;
  v_fin timestamptz := (p_hasta::timestamp + interval '23 hours 59 minutes 59 seconds')::timestamptz;
BEGIN
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_cliente_ids IS NULL AND p_prestamo_ids IS NULL THEN
    RETURN (
      WITH g AS (
        SELECT g.prestamo_id, g.cliente_id
        FROM crm_gestiones g
        WHERE g.empresa_id = v_emp AND g.created_at >= v_ini AND g.created_at <= v_fin
      ),
      pres AS (
        SELECT p.prestamo_id
        FROM pagos p
        WHERE p.empresa_id = v_emp AND p.anulado = false
          AND p.fecha_pago >= p_desde AND p.fecha_pago <= p_hasta
        UNION
        SELECT g.prestamo_id FROM g WHERE g.prestamo_id IS NOT NULL
      ),
      cli AS (
        SELECT g.cliente_id FROM g WHERE g.cliente_id IS NOT NULL
        UNION
        SELECT pr.cliente_id FROM prestamos pr JOIN pres ON pres.prestamo_id = pr.id WHERE pr.empresa_id = v_emp
      )
      SELECT jsonb_build_object(
        'prestamo_ids', coalesce((SELECT jsonb_agg(pres.prestamo_id) FROM pres), '[]'::jsonb),
        'cliente_ids', coalesce((SELECT jsonb_agg(cli.cliente_id) FROM cli), '[]'::jsonb)
      )
    );
  END IF;

  RETURN (
    WITH pr AS (
      SELECT p.id, p.cliente_id
      FROM prestamos p
      WHERE p.empresa_id = v_emp
        AND (p.id = ANY (coalesce(p_prestamo_ids, '{}')) OR p.cliente_id = ANY (coalesce(p_cliente_ids, '{}')))
    ),
    pres AS (
      SELECT pr.id, pr.cliente_id
      FROM pr
      WHERE EXISTS (SELECT 1 FROM pagos pg
                    WHERE pg.prestamo_id = pr.id AND pg.anulado = false AND pg.empresa_id = v_emp
                      AND pg.fecha_pago >= p_desde AND pg.fecha_pago <= p_hasta)
         OR EXISTS (SELECT 1 FROM crm_gestiones g
                    WHERE g.prestamo_id = pr.id AND g.empresa_id = v_emp
                      AND g.created_at >= v_ini AND g.created_at <= v_fin)
    ),
    cli AS (
      SELECT c.id
      FROM unnest(coalesce(p_cliente_ids, '{}')) AS c(id)
      WHERE EXISTS (SELECT 1 FROM pres WHERE pres.cliente_id = c.id)
         OR EXISTS (SELECT 1 FROM crm_gestiones g
                    WHERE g.cliente_id = c.id AND g.empresa_id = v_emp
                      AND g.created_at >= v_ini AND g.created_at <= v_fin)
    )
    SELECT jsonb_build_object(
      'prestamo_ids', coalesce((SELECT jsonb_agg(DISTINCT pres.id) FROM pres WHERE pres.id = ANY (coalesce(p_prestamo_ids, '{}'))), '[]'::jsonb),
      'cliente_ids', coalesce((SELECT jsonb_agg(DISTINCT cli.id) FROM cli), '[]'::jsonb)
    )
  );
END;
$$;

-- ── 3) Auditoría: bitácora unificada paginada ────────────────────
-- p_tipo: 'pago' | 'anulacion' | 'gestion' | 'promesa' | NULL (todos).
-- Cada fuente se recorre por su índice (empresa_id, fecha DESC) y se corta en offset+limit+1;
-- devuelve p_limit filas + has_more (sin COUNT de toda la bitácora).
CREATE OR REPLACE FUNCTION public.auditoria_listado(p_tipo text DEFAULT NULL, p_search text DEFAULT NULL, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
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
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
  WITH q AS (SELECT lower(nullif(p_search, '')) AS q, greatest(coalesce(p_offset, 0), 0) + p_limit + 1 AS n),
  pg AS (
    SELECT 'pago'::text AS tipo, p.id, p.created_at AS fecha, p.monto_recibido AS monto,
           c.nombre_completo AS cliente, NULL::text AS detalle, coalesce(pf.nombre_completo, 'Sistema') AS usuario,
           'Pago registrado'::text AS accion, NULL::text AS tipo_gestion, NULL::text AS fecha_prometida, NULL::text AS status
    FROM pagos p
    JOIN prestamos pr ON pr.id = p.prestamo_id
    JOIN clientes c ON c.id = pr.cliente_id
    LEFT JOIN profiles pf ON pf.id = p.registrado_por AND pf.empresa_id = p.empresa_id
    CROSS JOIN q
    WHERE p.empresa_id = v_emp
      AND (p_tipo IS NULL OR p_tipo = 'pago')
      AND (q.q IS NULL
           OR strpos(lower(coalesce(c.nombre_completo, '—')), q.q) > 0
           OR strpos(lower(coalesce(pf.nombre_completo, 'Sistema')), q.q) > 0
           OR strpos('pago registrado', q.q) > 0)
    ORDER BY p.created_at DESC, p.id
    LIMIT (SELECT n FROM q)
  ),
  an AS (
    SELECT 'anulacion'::text, p.id, coalesce(p.anulado_en, p.created_at), p.monto_recibido,
           c.nombre_completo, p.motivo_anulacion, coalesce(pf.nombre_completo, 'Sistema'),
           'Pago anulado'::text, NULL::text, NULL::text, NULL::text
    FROM pagos p
    JOIN prestamos pr ON pr.id = p.prestamo_id
    JOIN clientes c ON c.id = pr.cliente_id
    LEFT JOIN profiles pf ON pf.id = p.anulado_por AND pf.empresa_id = p.empresa_id
    CROSS JOIN q
    WHERE p.empresa_id = v_emp
      AND p.anulado
      AND (p_tipo IS NULL OR p_tipo = 'anulacion')
      AND (q.q IS NULL
           OR strpos(lower(coalesce(c.nombre_completo, '—')), q.q) > 0
           OR strpos(lower(coalesce(p.motivo_anulacion, '')), q.q) > 0
           OR strpos(lower(coalesce(pf.nombre_completo, 'Sistema')), q.q) > 0
           OR strpos('pago anulado', q.q) > 0)
    ORDER BY coalesce(p.anulado_en, p.created_at) DESC, p.id
    LIMIT (SELECT n FROM q)
  ),
  ge AS (
    SELECT 'gestion'::text, x.id, x.created_at, NULL::numeric, x.cliente, x.detalle, x.usuario,
           x.accion, x.tipo_gestion, NULL::text, NULL::text
    FROM (
      SELECT g.id, g.created_at, c.nombre_completo AS cliente, left(g.notas, 80) AS detalle,
             coalesce(pf.nombre_completo, 'Sistema') AS usuario, g.tipo_gestion,
             CASE g.tipo_gestion WHEN 'visita' THEN 'Visita' WHEN 'llamada' THEN 'Llamada' WHEN 'whatsapp' THEN 'WhatsApp'
                  ELSE coalesce(g.tipo_gestion, '') END || ': ' || coalesce(g.resultado, '') AS accion
      FROM crm_gestiones g
      JOIN clientes c ON c.id = g.cliente_id
      LEFT JOIN profiles pf ON pf.id = g.registrado_por AND pf.empresa_id = g.empresa_id
      WHERE g.empresa_id = v_emp
        AND (p_tipo IS NULL OR p_tipo = 'gestion')
    ) x
    CROSS JOIN q
    WHERE q.q IS NULL
       OR strpos(lower(coalesce(x.cliente, '—')), q.q) > 0
       OR strpos(lower(coalesce(x.detalle, '')), q.q) > 0
       OR strpos(lower(x.usuario), q.q) > 0
       OR strpos(lower(x.accion), q.q) > 0
    ORDER BY x.created_at DESC, x.id
    LIMIT (SELECT n FROM q)
  ),
  pp AS (
    SELECT 'promesa'::text, pp.id, pp.created_at, pp.monto_prometido, NULL::text, NULL::text, 'Sistema'::text,
           'Promesa registrada'::text, NULL::text, pp.fecha_prometida::text, pp.status
    FROM promesas_pago pp
    CROSS JOIN q
    WHERE pp.empresa_id = v_emp
      AND (p_tipo IS NULL OR p_tipo = 'promesa')
      AND (q.q IS NULL
           OR strpos(lower(pp.fecha_prometida::text), q.q) > 0
           OR strpos(lower(coalesce(pp.status, '')), q.q) > 0
           OR strpos('sistema', q.q) > 0
           OR strpos('promesa registrada', q.q) > 0)
    ORDER BY pp.created_at DESC, pp.id
    LIMIT (SELECT n FROM q)
  ),
  todo AS (
    SELECT * FROM pg UNION ALL SELECT * FROM an UNION ALL SELECT * FROM ge UNION ALL SELECT * FROM pp
  ),
  numerada AS (
    SELECT t.*, row_number() OVER (ORDER BY t.fecha DESC, t.tipo, t.id) AS rn
    FROM todo t
  )
  SELECT jsonb_build_object(
    'has_more', (SELECT count(*) > greatest(coalesce(p_offset, 0), 0) + p_limit FROM numerada),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', n.id, 'tipo', n.tipo, 'fecha', n.fecha, 'monto', n.monto, 'cliente', n.cliente,
               'detalle', n.detalle, 'usuario', n.usuario, 'accion', n.accion, 'tipo_gestion', n.tipo_gestion,
               'fecha_prometida', n.fecha_prometida, 'status', n.status) ORDER BY n.rn)
      FROM numerada n
      WHERE n.rn > greatest(coalesce(p_offset, 0), 0)
        AND n.rn <= greatest(coalesce(p_offset, 0), 0) + p_limit), '[]'::jsonb)
  )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.auditoria_resumen()
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
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
  WITH pg AS (
    SELECT count(*) AS pagos, count(*) FILTER (WHERE p.anulado) AS anulaciones
    FROM pagos p
    WHERE p.empresa_id = v_emp
  ),
  ge AS (
    SELECT count(*) AS gestiones FROM crm_gestiones g
    WHERE g.empresa_id = v_emp AND EXISTS (SELECT 1 FROM clientes c WHERE c.id = g.cliente_id)
  ),
  pp AS (SELECT count(*) AS promesas FROM promesas_pago pp WHERE pp.empresa_id = v_emp)
  SELECT jsonb_build_object(
    'pagos', pg.pagos, 'anulaciones', pg.anulaciones, 'gestiones', ge.gestiones, 'promesas', pp.promesas,
    'total', pg.pagos + pg.anulaciones + ge.gestiones + pp.promesas)
  FROM pg, ge, pp
  );
END;
$$;

-- ── 4) CRM Cobranza: cartera paginada con agregados por préstamo ─
-- p_filtro: 'todos' | 'vencido' (con cuotas vencidas) | 'al_dia'.
CREATE OR REPLACE FUNCTION public.crm_cartera_listado(p_search text DEFAULT NULL, p_filtro text DEFAULT 'todos', p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
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
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
  WITH pr AS (
    SELECT p.id, p.created_at, p.monto_solicitado, p.num_cuotas, p.frecuencia::text AS frecuencia,
           p.estado::text AS estado, p.fecha_registro, c.id AS cliente_id, c.nombre_completo, c.telefono, c.direccion
    FROM prestamos p
    JOIN clientes c ON c.id = p.cliente_id
    WHERE p.empresa_id = v_emp AND p.estado IN ('Activo', 'Al día', 'Vencido')
  ),
  ag AS (
    SELECT a.prestamo_id,
           count(*) FILTER (WHERE a.status = 'Vencida' OR coalesce(a.dias_atraso, 0) > 0) AS vencidas,
           sum(coalesce(a.saldo_mora, 0)) AS mora,
           sum(coalesce(a.saldo_total, 0)) AS adeudado,
           greatest(0, max(coalesce(a.dias_atraso, 0))) AS max_dias
    FROM amortizacion a
    JOIN pr ON pr.id = a.prestamo_id
    WHERE a.empresa_id = v_emp
    GROUP BY a.prestamo_id
  ),
  q AS (SELECT nullif(p_search, '') AS q),
  f AS (
    SELECT pr.*, ag.vencidas, ag.mora, ag.adeudado, ag.max_dias
    FROM pr
    JOIN ag ON ag.prestamo_id = pr.id
    CROSS JOIN q
    WHERE ag.adeudado > 0
      AND (q.q IS NULL OR strpos(lower(pr.nombre_completo), lower(q.q)) > 0 OR strpos(coalesce(pr.telefono, ''), q.q) > 0)
      AND (coalesce(p_filtro, 'todos') = 'todos'
           OR (p_filtro = 'vencido' AND ag.vencidas > 0)
           OR (p_filtro = 'al_dia' AND ag.vencidas = 0))
  ),
  pagina AS (
    SELECT f.*, row_number() OVER (ORDER BY f.max_dias DESC, f.created_at DESC, f.id) AS rn
    FROM f
    ORDER BY f.max_dias DESC, f.created_at DESC, f.id
    LIMIT p_limit OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'con_mora', (SELECT count(*) FROM f WHERE f.vencidas > 0),
    'total_mora', (SELECT coalesce(sum(f.mora), 0) FROM f),
    'total_adeudado', (SELECT coalesce(sum(f.adeudado), 0) FROM f),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pg.id,
               'monto_solicitado', pg.monto_solicitado,
               'num_cuotas', pg.num_cuotas,
               'frecuencia', pg.frecuencia,
               'estado', pg.estado,
               'fecha_registro', pg.fecha_registro,
               'cliente', jsonb_build_object('id', pg.cliente_id, 'nombre_completo', pg.nombre_completo,
                                             'telefono', pg.telefono, 'direccion', pg.direccion),
               'cuotasVencidas', pg.vencidas,
               'totalMora', pg.mora,
               'totalAdeudado', pg.adeudado,
               'maxDiasAtraso', pg.max_dias,
               'gestionesCount', gs.n,
               'ultimaGestion', gs.ultima
             ) ORDER BY pg.rn)
      FROM pagina pg
      LEFT JOIN LATERAL (
        SELECT count(*) AS n,
               (SELECT jsonb_build_object('resultado', g2.resultado, 'created_at', g2.created_at)
                FROM crm_gestiones g2
                WHERE g2.prestamo_id = pg.id AND g2.empresa_id = v_emp
                ORDER BY g2.created_at DESC NULLS LAST, g2.id
                LIMIT 1) AS ultima
        FROM crm_gestiones g
        WHERE g.prestamo_id = pg.id AND g.empresa_id = v_emp
      ) gs ON true), '[]'::jsonb)
  )
  );
END;
$$;

-- ── 5) Renovación: candidatos paginados + totales ────────────────
CREATE OR REPLACE FUNCTION public.renovacion_candidatos(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
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
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
  WITH pr AS (
    SELECT p.id, p.monto_solicitado, p.monto_total_pagar, p.num_cuotas, p.frecuencia::text AS frecuencia,
           p.tasa_interes, p.modalidad::text AS modalidad, p.cliente_id, p.ruta_id, p.caja_id, p.cobrador_id,
           c.nombre_completo, c.telefono
    FROM prestamos p
    JOIN clientes c ON c.id = p.cliente_id
    WHERE p.empresa_id = v_emp AND p.estado IN ('Activo', 'Al día')
  ),
  ag AS (
    SELECT a.prestamo_id,
           count(*) AS total,
           count(*) FILTER (WHERE a.status = 'Pagada') AS pagadas,
           count(*) FILTER (WHERE a.status = 'Pagada' AND coalesce(a.dias_atraso, 0) <= 3) AS a_tiempo,
           sum(coalesce(a.saldo_total, 0)) AS saldo,
           greatest(0, max(coalesce(a.dias_atraso, 0))) AS max_atraso
    FROM amortizacion a
    JOIN pr ON pr.id = a.prestamo_id
    WHERE a.empresa_id = v_emp
    GROUP BY a.prestamo_id
  ),
  x AS (
    SELECT pr.*, ag.total, ag.pagadas, ag.saldo, ag.max_atraso,
           (ag.pagadas::float8 / ag.total) * 100 AS progreso,
           CASE WHEN ag.pagadas > 0 THEN floor((ag.a_tiempo::float8 / ag.pagadas) * 100 + 0.5)::integer ELSE 0 END AS score
    FROM pr JOIN ag ON ag.prestamo_id = pr.id
  ),
  c AS (
    SELECT x.*,
           (x.progreso >= 70 AND x.max_atraso <= 7) AS elegible,
           floor(coalesce(x.monto_solicitado, 0)::float8
                 * CASE WHEN x.score >= 90 THEN 1.3 WHEN x.score >= 70 THEN 1.15 ELSE 1 END + 0.5)::bigint AS monto_sugerido
    FROM x
    WHERE x.progreso >= 50
  ),
  pagina AS (
    SELECT c.*, row_number() OVER (ORDER BY c.progreso DESC, c.id) AS rn
    FROM c
    ORDER BY c.progreso DESC, c.id
    LIMIT p_limit OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM c),
    'elegibles', (SELECT count(*) FROM c WHERE c.elegible),
    'colocacion', (SELECT coalesce(sum(c.monto_sugerido), 0) FROM c WHERE c.elegible),
    'score_promedio', (SELECT coalesce(floor(avg(c.score::float8) + 0.5)::integer, 0) FROM c WHERE c.elegible),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pg.id, 'monto_solicitado', pg.monto_solicitado, 'monto_total_pagar', pg.monto_total_pagar,
               'num_cuotas', pg.num_cuotas, 'frecuencia', pg.frecuencia, 'tasa_interes', pg.tasa_interes,
               'modalidad', pg.modalidad, 'cliente_id', pg.cliente_id, 'ruta_id', pg.ruta_id, 'caja_id', pg.caja_id,
               'cobrador_id', pg.cobrador_id,
               'cliente', jsonb_build_object('id', pg.cliente_id, 'nombre_completo', pg.nombre_completo, 'telefono', pg.telefono),
               'pagadas', pg.pagadas, 'total', pg.total, 'progreso', pg.progreso, 'pendientes', pg.total - pg.pagadas,
               'saldoRestante', pg.saldo, 'maxAtraso', pg.max_atraso, 'score', pg.score,
               'elegible', pg.elegible, 'montoSugerido', pg.monto_sugerido
             ) ORDER BY pg.rn)
      FROM pagina pg), '[]'::jsonb)
  )
  );
END;
$$;

-- ── 6) Mapa GPS: puntos en el área visible (últimos N por tipo) ──
-- p_tipo: 'todos' | 'clientes' | 'prestamos' | 'pagos'. bbox NULL => últimos N de todo el tenant.
CREATE OR REPLACE FUNCTION public.mapa_puntos(
  p_tipo text DEFAULT 'todos',
  p_search text DEFAULT NULL,
  p_min_lat numeric DEFAULT NULL,
  p_min_lng numeric DEFAULT NULL,
  p_max_lat numeric DEFAULT NULL,
  p_max_lng numeric DEFAULT NULL,
  p_limit integer DEFAULT 500
)
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
  v_tipo text := coalesce(p_tipo, 'todos');
  v_q text := lower(nullif(p_search, ''));
  v_bbox boolean := p_min_lat IS NOT NULL AND p_min_lng IS NOT NULL AND p_max_lat IS NOT NULL AND p_max_lng IS NOT NULL;
  v_min_lat numeric := CASE WHEN v_bbox THEN p_min_lat ELSE -90 END;
  v_max_lat numeric := CASE WHEN v_bbox THEN p_max_lat ELSE 90 END;
  v_min_lng numeric := CASE WHEN v_bbox THEN p_min_lng ELSE -180 END;
  v_max_lng numeric := CASE WHEN v_bbox THEN p_max_lng ELSE 180 END;
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
BEGIN
  IF v_emp IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN (
  WITH cl AS (
    SELECT 'cliente'::text AS tipo, c.gps_lat AS lat, c.gps_lng AS lng, c.nombre_completo AS nombre,
           c.id_cliente, c.direccion, NULL::numeric AS monto, c.created_at AS fecha
    FROM clientes c
    WHERE v_tipo IN ('todos', 'clientes')
      AND c.empresa_id = v_emp
      AND c.gps_lat IS NOT NULL AND c.gps_lng IS NOT NULL AND c.gps_lat <> 0 AND c.gps_lng <> 0
      AND c.gps_lat BETWEEN v_min_lat AND v_max_lat AND c.gps_lng BETWEEN v_min_lng AND v_max_lng
      AND (v_q IS NULL OR strpos(lower(c.nombre_completo), v_q) > 0 OR strpos(lower(c.id_cliente), v_q) > 0
           OR strpos(lower(coalesce(c.direccion, '')), v_q) > 0)
    ORDER BY c.created_at DESC NULLS LAST, c.id
    LIMIT v_limit
  ),
  pr AS (
    SELECT 'prestamo'::text, p.gps_lat, p.gps_lng, c.nombre_completo, NULL::text, NULL::text,
           p.monto_solicitado, p.created_at
    FROM prestamos p
    JOIN clientes c ON c.id = p.cliente_id
    WHERE v_tipo IN ('todos', 'prestamos')
      AND p.empresa_id = v_emp
      AND p.gps_lat IS NOT NULL AND p.gps_lng IS NOT NULL AND p.gps_lat <> 0 AND p.gps_lng <> 0
      AND p.gps_lat BETWEEN v_min_lat AND v_max_lat AND p.gps_lng BETWEEN v_min_lng AND v_max_lng
      AND (v_q IS NULL OR strpos(lower(c.nombre_completo), v_q) > 0)
    ORDER BY p.created_at DESC NULLS LAST, p.id
    LIMIT v_limit
  ),
  pg AS (
    SELECT 'pago'::text, p.gps_lat, p.gps_lng, c.nombre_completo, NULL::text, NULL::text,
           p.monto_recibido, p.created_at
    FROM pagos p
    JOIN prestamos pr2 ON pr2.id = p.prestamo_id
    JOIN clientes c ON c.id = pr2.cliente_id
    WHERE v_tipo IN ('todos', 'pagos')
      AND p.empresa_id = v_emp
      AND p.gps_lat IS NOT NULL AND p.gps_lng IS NOT NULL AND p.gps_lat <> 0 AND p.gps_lng <> 0
      AND p.gps_lat BETWEEN v_min_lat AND v_max_lat AND p.gps_lng BETWEEN v_min_lng AND v_max_lng
      AND (v_q IS NULL OR strpos(lower(c.nombre_completo), v_q) > 0)
    ORDER BY p.created_at DESC NULLS LAST, p.id
    LIMIT v_limit
  ),
  todo AS (SELECT * FROM cl UNION ALL SELECT * FROM pr UNION ALL SELECT * FROM pg)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'tipo', t.tipo, 'lat', t.lat, 'lng', t.lng, 'nombre', t.nombre, 'id_cliente', t.id_cliente,
           'direccion', t.direccion, 'monto', t.monto, 'fecha', t.fecha)), '[]'::jsonb)
  FROM todo t
  );
END;
$$;

-- Conteos totales (todo el tenant, con el mismo filtro/búsqueda) para los KPIs del mapa.
CREATE OR REPLACE FUNCTION public.mapa_totales(p_tipo text DEFAULT 'todos', p_search text DEFAULT NULL)
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
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
  WITH q AS (SELECT lower(nullif(p_search, '')) AS q)
  SELECT jsonb_build_object(
    'clientes', CASE WHEN coalesce(p_tipo, 'todos') IN ('todos', 'clientes') THEN (
      SELECT count(*) FROM clientes c, q
      WHERE c.empresa_id = v_emp
        AND c.gps_lat IS NOT NULL AND c.gps_lng IS NOT NULL AND c.gps_lat <> 0 AND c.gps_lng <> 0
        AND (q.q IS NULL OR strpos(lower(c.nombre_completo), q.q) > 0 OR strpos(lower(c.id_cliente), q.q) > 0
             OR strpos(lower(coalesce(c.direccion, '')), q.q) > 0)) ELSE 0 END,
    'prestamos', CASE WHEN coalesce(p_tipo, 'todos') IN ('todos', 'prestamos') THEN (
      SELECT count(*) FROM prestamos p JOIN clientes c ON c.id = p.cliente_id CROSS JOIN q
      WHERE p.empresa_id = v_emp
        AND p.gps_lat IS NOT NULL AND p.gps_lng IS NOT NULL AND p.gps_lat <> 0 AND p.gps_lng <> 0
        AND (q.q IS NULL OR strpos(lower(c.nombre_completo), q.q) > 0)) ELSE 0 END,
    'pagos', CASE WHEN coalesce(p_tipo, 'todos') IN ('todos', 'pagos') THEN (
      SELECT count(*) FROM pagos p JOIN prestamos pr ON pr.id = p.prestamo_id JOIN clientes c ON c.id = pr.cliente_id
      CROSS JOIN q
      WHERE p.empresa_id = v_emp
        AND p.gps_lat IS NOT NULL AND p.gps_lng IS NOT NULL AND p.gps_lat <> 0 AND p.gps_lng <> 0
        AND (q.q IS NULL OR strpos(lower(c.nombre_completo), q.q) > 0)) ELSE 0 END
  )
  );
END;
$$;

-- ── 7) Lead scoring: score por cliente en SQL, paginado ──────────
-- p_hoy: fecha local del navegador (YYYY-MM-DD). Resumen = sobre todos los clientes activos.
CREATE OR REPLACE FUNCTION public.lead_scoring_listado(
  p_search text DEFAULT NULL,
  p_nivel text DEFAULT NULL,
  p_hoy date DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
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
  v_gracia integer;
  v_hoy date := coalesce(p_hoy, (now() AT TIME ZONE 'UTC')::date);
BEGIN
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(e.dias_gracia, 0) INTO v_gracia FROM empresas e WHERE e.id = v_emp;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('total', 0, 'resumen', NULL, 'rows', '[]'::jsonb);
  END IF;
  RETURN (
  WITH   cl AS (
    SELECT c.id, c.id_cliente, c.nombre_completo
    FROM clientes c
    WHERE c.empresa_id = v_emp AND c.activo = true
  ),
  pr AS (
    SELECT p.id, p.cliente_id, p.estado::text AS estado, coalesce(p.monto_solicitado, 0) AS monto
    FROM prestamos p
    WHERE p.empresa_id = v_emp
  ),
  pa AS (
    SELECT pr.cliente_id, count(*)::integer AS total, count(*) FILTER (WHERE pr.estado = 'Liquidado')::integer AS liquidados,
           sum(pr.monto) AS monto
    FROM pr GROUP BY pr.cliente_id
  ),
  cuo AS (
    SELECT pr.cliente_id, a.status, coalesce(a.dias_atraso, 0) AS dias, coalesce(a.saldo_total, 0) AS saldo,
           v_hoy - a.fecha_vencimiento::date AS diff, v_gracia AS gracia
    FROM amortizacion a
    JOIN pr ON pr.id = a.prestamo_id
    WHERE a.empresa_id = v_emp
  ),
  cls AS (
    SELECT cuo.*,
           CASE WHEN cuo.status = 'Pagada' THEN 'P'
                WHEN cuo.status = 'Vencida' THEN 'V'
                WHEN cuo.diff >= 0 THEN 'D'
                ELSE 'F' END AS k
    FROM cuo
  ),
  rea AS (
    SELECT cls.*,
           CASE WHEN cls.k = 'V' THEN CASE WHEN cls.dias > 0 THEN cls.dias ELSE greatest(0, cls.diff) END
                WHEN cls.k = 'D' AND cls.diff > cls.gracia THEN cls.diff
           END AS real_dias
    FROM cls
  ),
  cu AS (
    SELECT rea.cliente_id,
           count(*) FILTER (WHERE rea.k IN ('P', 'V', 'D'))::integer AS totales,
           count(*) FILTER (WHERE rea.k = 'P' AND rea.dias <= rea.gracia)::integer AS a_tiempo,
           count(*) FILTER (WHERE rea.k = 'P' AND rea.dias > rea.gracia)::integer AS tarde,
           count(*) FILTER (WHERE rea.k = 'V' OR (rea.k = 'D' AND rea.diff > rea.gracia))::integer AS vencidas,
           coalesce(sum(rea.saldo) FILTER (WHERE rea.k IN ('V', 'D')), 0) AS saldo,
           coalesce(sum(rea.real_dias), 0) AS total_dias,
           count(rea.real_dias) AS con_atraso,
           coalesce(max(rea.real_dias), 0)::integer AS max_dias
    FROM rea GROUP BY rea.cliente_id
  ),
  sc AS (
    SELECT cl.id, cl.id_cliente, cl.nombre_completo,
           coalesce(pa.total, 0) AS total_prestamos,
           coalesce(pa.liquidados, 0) AS liquidados,
           coalesce(pa.monto, 0) AS monto_historico,
           coalesce(cu.a_tiempo, 0) AS a_tiempo,
           coalesce(cu.totales, 0) AS totales,
           coalesce(cu.tarde, 0) AS tarde,
           coalesce(cu.vencidas, 0) AS vencidas,
           coalesce(cu.saldo, 0) AS saldo,
           CASE WHEN coalesce(cu.con_atraso, 0) > 0 THEN cu.total_dias::float8 / cu.con_atraso ELSE 0 END AS avg_dias,
           coalesce(cu.max_dias, 0) AS max_dias,
           v_gracia AS gracia
    FROM cl
    LEFT JOIN pa ON pa.cliente_id = cl.id
    LEFT JOIN cu ON cu.cliente_id = cl.id
  ),
  r AS (
    SELECT sc.*, s.score, s.nivel, s.recomendacion, s.icono
    FROM sc,
    LATERAL public._lead_score(sc.total_prestamos, sc.liquidados, sc.a_tiempo, sc.totales, sc.tarde, sc.vencidas,
                               sc.avg_dias, sc.max_dias, sc.saldo, sc.monto_historico, sc.gracia) s
  ),
  q AS (SELECT lower(coalesce(p_search, '')) AS q),
  f AS (
    SELECT r.* FROM r, q
    WHERE (strpos(lower(r.nombre_completo), q.q) > 0 OR strpos(lower(r.id_cliente), q.q) > 0)
      AND (p_nivel IS NULL OR p_nivel = 'todos' OR r.nivel = p_nivel)
  ),
  pagina AS (
    SELECT f.*, row_number() OVER (ORDER BY f.score DESC, f.nombre_completo, f.id) AS rn
    FROM f
    ORDER BY f.score DESC, f.nombre_completo, f.id
    LIMIT p_limit OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'resumen', (SELECT jsonb_build_object(
                  'avg', coalesce(floor(avg(r.score::float8) FILTER (WHERE r.score >= 0) + 0.5)::integer, 0),
                  'excelentes', count(*) FILTER (WHERE r.nivel = 'Excelente'),
                  'buenos', count(*) FILTER (WHERE r.nivel = 'Bueno'),
                  'regulares', count(*) FILTER (WHERE r.nivel = 'Regular'),
                  'riesgosos', count(*) FILTER (WHERE r.nivel = 'Riesgoso'),
                  'criticos', count(*) FILTER (WHERE r.nivel = 'Crítico'),
                  'nuevos', count(*) FILTER (WHERE r.nivel = 'Nuevo'))
                FROM r),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'cliente_id', pg.id, 'id_cliente', pg.id_cliente, 'nombre_completo', pg.nombre_completo,
               'score', pg.score, 'nivel', pg.nivel, 'recomendacion', pg.recomendacion, 'icono', pg.icono,
               'totalPrestamos', pg.total_prestamos, 'prestamosLiquidados', pg.liquidados,
               'cuotasATiempo', pg.a_tiempo, 'cuotasTotales', pg.totales, 'cuotasPagadasTarde', pg.tarde,
               'cuotasVencidas', pg.vencidas, 'saldoActual', pg.saldo,
               'diasAtrasoPromedio', floor(pg.avg_dias + 0.5)::integer, 'maxDiasAtraso', pg.max_dias,
               'montoHistorico', pg.monto_historico, 'diasGracia', pg.gracia
             ) ORDER BY pg.rn)
      FROM pagina pg), '[]'::jsonb)
  )
  );
END;
$$;

-- ── 8) Promesas: KPIs ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.promesas_resumen()
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
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
  SELECT jsonb_build_object(
    'total', count(*),
    'pendientes', count(*) FILTER (WHERE pp.status = 'Pendiente'),
    'vencidas', count(*) FILTER (WHERE pp.status = 'Vencida'),
    'monto', coalesce(sum(coalesce(pp.monto_prometido, 0)), 0))
  FROM promesas_pago pp
  WHERE pp.empresa_id = v_emp
  );
END;
$$;

-- ── 9) Gastos: listado paginado + KPIs con los mismos filtros ────
-- Solo salidas con etiqueta "[Categoría] ..." (gastos registrados a mano).
-- p_mes_desde/p_mes_hasta: inicio del mes actual y del siguiente en la zona del navegador.
CREATE OR REPLACE FUNCTION public.gastos_listado(
  p_search text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_mes_desde timestamptz DEFAULT NULL,
  p_mes_hasta timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
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
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
  WITH q AS (SELECT lower(nullif(p_search, '')) AS q),
  g AS (
    SELECT m.id, m.created_at, coalesce(m.concepto, '') AS concepto, coalesce(m.monto, 0) AS monto,
           coalesce(nullif(cj.nombre, ''), '—') AS caja, m.caja_id, public._gasto_categoria(m.concepto) AS categoria
    FROM movimientos_caja m
    LEFT JOIN cajas cj ON cj.id = m.caja_id
    WHERE m.empresa_id = v_emp
      AND m.tipo = 'salida'
      AND coalesce(m.concepto, '') ~ '^\[[^\n\r]+\]'
  ),
  f AS (
    SELECT g.* FROM g, q
    WHERE (q.q IS NULL OR strpos(lower(g.concepto), q.q) > 0 OR strpos(lower(g.caja), q.q) > 0)
      AND (p_categoria IS NULL OR p_categoria = 'todos' OR g.categoria = p_categoria)
  ),
  cat AS (
    SELECT f.categoria, sum(f.monto) AS total FROM f GROUP BY f.categoria
  ),
  pagina AS (
    SELECT f.*, row_number() OVER (ORDER BY f.created_at DESC NULLS LAST, f.id) AS rn
    FROM f
    ORDER BY f.created_at DESC NULLS LAST, f.id
    LIMIT p_limit OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM f),
    'total_monto', (SELECT coalesce(sum(f.monto), 0) FROM f),
    'total_mes', (SELECT coalesce(sum(f.monto), 0) FROM f
                  WHERE p_mes_desde IS NOT NULL AND f.created_at >= p_mes_desde
                    AND (p_mes_hasta IS NULL OR f.created_at < p_mes_hasta)),
    'por_categoria', coalesce((SELECT jsonb_agg(jsonb_build_array(cat.categoria, cat.total) ORDER BY cat.total DESC, cat.categoria) FROM cat), '[]'::jsonb),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pg.id, 'fecha', pg.created_at, 'concepto', pg.concepto, 'monto', pg.monto,
               'caja', pg.caja, 'cajaId', pg.caja_id, 'categoria', pg.categoria) ORDER BY pg.rn)
      FROM pagina pg), '[]'::jsonb)
  )
  );
END;
$$;

-- ── 10) Caja: kardex paginado con saldo corrido ──────────────────
-- p_modo 'todos': saldo corrido sobre todos los movimientos (p_categoria solo filtra filas).
-- p_modo 'manual': solo Depósitos/Retiros/Transferencias, saldo corrido sobre ellos.
-- El saldo de la página = saldo antes de la fila más antigua de la página + ventana sobre el rango.
CREATE OR REPLACE FUNCTION public.caja_kardex(
  p_caja_id uuid,
  p_modo text DEFAULT 'todos',
  p_categoria text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (id uuid, created_at timestamptz, tipo text, monto numeric, concepto text, categoria text, balance numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH sc AS NOT MATERIALIZED (
    SELECT x.*
    FROM (
      SELECT m.id, m.created_at, m.tipo::text AS tipo, coalesce(m.monto, 0) AS monto,
             coalesce(m.concepto, CASE WHEN m.tipo::text = 'entrada' THEN 'Depósito' ELSE 'Retiro' END) AS concepto,
             public._kardex_categoria(coalesce(m.concepto, CASE WHEN m.tipo::text = 'entrada' THEN 'Depósito' ELSE 'Retiro' END), m.tipo::text) AS categoria,
             CASE WHEN m.tipo::text = 'entrada' THEN coalesce(m.monto, 0) ELSE -coalesce(m.monto, 0) END AS signed
      FROM movimientos_caja m
      WHERE m.caja_id = p_caja_id
        AND m.empresa_id = (SELECT public.get_user_empresa_id())
    ) x
    WHERE coalesce(p_modo, 'todos') <> 'manual' OR x.categoria IN ('Depósitos', 'Retiros', 'Transferencias')
  ),
  pagina AS (
    SELECT sc.id, sc.created_at
    FROM sc
    WHERE p_categoria IS NULL OR p_categoria = 'Todos' OR sc.categoria = p_categoria
    ORDER BY sc.created_at DESC, sc.id DESC
    LIMIT p_limit OFFSET greatest(coalesce(p_offset, 0), 0)
  ),
  lo AS (SELECT pagina.created_at, pagina.id FROM pagina ORDER BY pagina.created_at, pagina.id LIMIT 1),
  hi AS (SELECT pagina.created_at, pagina.id FROM pagina ORDER BY pagina.created_at DESC, pagina.id DESC LIMIT 1),
  seed AS (
    SELECT coalesce(sum(sc.signed), 0) AS s
    FROM sc, lo
    WHERE (sc.created_at, sc.id) < (lo.created_at, lo.id)
  ),
  rango AS (
    SELECT sc.id, sc.created_at, sc.tipo, sc.monto, sc.concepto, sc.categoria,
           seed.s + sum(sc.signed) OVER (ORDER BY sc.created_at, sc.id) AS balance
    FROM sc, lo, hi, seed
    WHERE (sc.created_at, sc.id) >= (lo.created_at, lo.id)
      AND (sc.created_at, sc.id) <= (hi.created_at, hi.id)
  )
  SELECT r.id, r.created_at, r.tipo, r.monto, r.concepto, r.categoria, r.balance
  FROM rango r
  JOIN pagina p ON p.id = r.id
  ORDER BY r.created_at DESC, r.id DESC;
$$;

-- Conteos y sumas por categoría del kardex (chips, totales y "Movimientos").
CREATE OR REPLACE FUNCTION public.caja_kardex_resumen(p_caja_id uuid)
RETURNS TABLE (categoria text, n integer, entradas numeric, salidas numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  SELECT x.categoria,
         count(*)::integer,
         coalesce(sum(x.monto) FILTER (WHERE x.tipo = 'entrada'), 0),
         coalesce(sum(x.monto) FILTER (WHERE x.tipo <> 'entrada'), 0)
  FROM (
    SELECT m.tipo::text AS tipo, coalesce(m.monto, 0) AS monto,
           public._kardex_categoria(coalesce(m.concepto, CASE WHEN m.tipo::text = 'entrada' THEN 'Depósito' ELSE 'Retiro' END), m.tipo::text) AS categoria
    FROM movimientos_caja m
    WHERE m.caja_id = p_caja_id
      AND m.empresa_id = (SELECT public.get_user_empresa_id())
  ) x
  GROUP BY x.categoria;
$$;

-- ── 11) Caja: KPIs de cartera (mora calculada al día) ────────────
-- p_today: fecha UTC (como new Date().toISOString().slice(0, 10)).
CREATE OR REPLACE FUNCTION public.caja_detalle_stats(p_caja_id uuid, p_today date DEFAULT NULL)
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
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
  WITH t AS (SELECT coalesce(p_today, (now() AT TIME ZONE 'UTC')::date) AS hoy),
  pr AS (
    SELECT p.id, coalesce(p.monto_solicitado, 0) AS monto, coalesce(p.monto_total_pagar, 0) AS total,
           p.estado::text AS estado, p.tipo_mora::text AS tipo_mora, coalesce(p.valor_mora, 0) AS valor_mora
    FROM prestamos p, t
    WHERE p.caja_id = p_caja_id AND p.empresa_id = v_emp AND p.estado <> 'Cancelado'
  ),
  cu AS (
    SELECT a.prestamo_id,
           coalesce(a.saldo_capital, 0) AS cap,
           coalesce(a.saldo_interes, 0) AS int_,
           coalesce(a.mora_pagada, 0) AS mora_pagada,
           a.fecha_vencimiento IS NOT NULL AND a.fecha_vencimiento::date < t.hoy AS atraso,
           CASE
             WHEN a.fecha_vencimiento IS NOT NULL AND a.fecha_vencimiento::date < t.hoy
                  AND coalesce(a.saldo_total, 0) > 0 AND pr.valor_mora > 0
             THEN greatest(coalesce(a.saldo_mora, 0), greatest(0,
                    CASE WHEN pr.tipo_mora = 'porcentaje'
                         THEN coalesce(a.capital_interes, 0) * (pr.valor_mora / 100) * (t.hoy - a.fecha_vencimiento::date)
                         ELSE pr.valor_mora * (t.hoy - a.fecha_vencimiento::date) END
                    - coalesce(a.mora_pagada, 0)))
             ELSE coalesce(a.saldo_mora, 0)
           END AS mora
    FROM amortizacion a
    JOIN pr ON pr.id = a.prestamo_id
    CROSS JOIN t
    WHERE a.empresa_id = v_emp
  ),
  ag AS (
    SELECT cu.prestamo_id,
           sum(cu.cap) AS capital, sum(cu.int_) AS interes, sum(cu.mora) AS mora,
           sum(cu.mora_pagada) AS mora_cobrada, sum(cu.cap + cu.int_ + cu.mora) AS saldo,
           bool_or(cu.atraso AND (cu.cap + cu.int_ + cu.mora) > 0) AS tiene_atraso
    FROM cu GROUP BY cu.prestamo_id
  ),
  x AS (
    SELECT pr.*, coalesce(ag.capital, 0) AS capital, coalesce(ag.interes, 0) AS interes, coalesce(ag.mora, 0) AS mora,
           coalesce(ag.mora_cobrada, 0) AS mora_cobrada, coalesce(ag.saldo, 0) AS saldo,
           coalesce(ag.tiene_atraso, false) AS tiene_atraso
    FROM pr LEFT JOIN ag ON ag.prestamo_id = pr.id
  )
  SELECT jsonb_build_object(
    'activos', count(*) FILTER (WHERE x.estado IS DISTINCT FROM 'Liquidado'),
    'liquidados', count(*) FILTER (WHERE x.estado = 'Liquidado'),
    'capitalRecuperado', coalesce(sum(x.monto) FILTER (WHERE x.estado = 'Liquidado'), 0),
    'colocado', coalesce(sum(x.monto), 0),
    'totalPagar', coalesce(sum(x.total), 0),
    'porCobrar', coalesce(sum(x.saldo), 0),
    'capitalPorCobrar', coalesce(sum(x.capital), 0),
    'interesPorCobrar', coalesce(sum(x.interes), 0),
    'moraPorCobrar', coalesce(sum(x.mora), 0),
    'moraCobrada', coalesce(sum(x.mora_cobrada), 0),
    'ganancia', coalesce(sum((x.total - x.monto) + x.mora_cobrada + x.mora), 0),
    'enMora', count(*) FILTER (WHERE x.tiene_atraso),
    'moraTotal', coalesce(sum(x.mora) FILTER (WHERE x.tiene_atraso), 0))
  FROM x
  );
END;
$$;

-- ── 12) Caja: flujo de efectivo desde tablas fuente ──────────────
CREATE OR REPLACE FUNCTION public.caja_flujo(p_caja_id uuid)
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
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
  WITH man AS (
    SELECT x.tipo, x.monto,
           CASE
             WHEN strpos(x.l, 'transferencia') > 0 THEN CASE WHEN x.tipo = 'entrada' THEN 'transferencias_in' ELSE 'transferencias_out' END
             WHEN strpos(x.l, 'comisión') > 0 OR strpos(x.l, 'comision') > 0 OR strpos(x.l, 'corte') > 0 OR strpos(x.l, 'gasto cobrador') > 0 THEN 'comisiones'
             WHEN strpos(x.l, '[') > 0 OR left(x.l, 5) = 'gasto' THEN 'gastos'
             WHEN x.tipo = 'entrada' THEN 'depositos'
             ELSE 'retiros'
           END AS cat
    FROM (
      SELECT m.tipo::text AS tipo, coalesce(m.monto, 0) AS monto, public._lower_es(m.concepto) AS l
      FROM movimientos_caja m
      WHERE m.caja_id = p_caja_id AND m.empresa_id = v_emp AND m.prestamo_id IS NULL
      OFFSET 0
    ) x
    WHERE strpos(x.l, 'corrección') = 0 AND strpos(x.l, 'correccion') = 0 AND strpos(x.l, 'movido a caja') = 0
  ),
  agg AS (
    SELECT coalesce(sum(monto) FILTER (WHERE cat = 'transferencias_in'), 0) AS transferencias_in,
           coalesce(sum(monto) FILTER (WHERE cat = 'transferencias_out'), 0) AS transferencias_out,
           coalesce(sum(monto) FILTER (WHERE cat = 'comisiones'), 0) AS comisiones,
           coalesce(sum(monto) FILTER (WHERE cat = 'gastos'), 0) AS gastos,
           coalesce(sum(monto) FILTER (WHERE cat = 'depositos'), 0) AS depositos,
           coalesce(sum(monto) FILTER (WHERE cat = 'retiros'), 0) AS retiros
    FROM man
  )
  SELECT jsonb_build_object(
    'cobros', (SELECT coalesce(sum(coalesce(p.monto_recibido, 0)), 0) FROM pagos p
               WHERE p.caja_id = p_caja_id AND p.empresa_id = v_emp AND p.anulado = false),
    'desembolsos', (SELECT coalesce(sum(coalesce(pr.monto_solicitado, 0)), 0) FROM prestamos pr
                    WHERE pr.caja_id = p_caja_id AND pr.empresa_id = v_emp AND pr.estado <> 'Cancelado'),
    'transferencias_in', agg.transferencias_in,
    'transferencias_out', agg.transferencias_out,
    'comisiones', agg.comisiones,
    'gastos', agg.gastos,
    'depositos', agg.depositos,
    'retiros', agg.retiros
  )
  FROM agg
  );
END;
$$;

-- ── 13) Caja: totales de las pestañas Préstamos / Pagos / Transferencias ──
-- p_fuente: 'prestamos' | 'pagos' | 'transferencias'.
CREATE OR REPLACE FUNCTION public.caja_fuentes_resumen(p_caja_id uuid, p_fuente text)
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
  IF v_emp IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (
  SELECT CASE p_fuente
    WHEN 'prestamos' THEN (
      SELECT jsonb_build_object(
        'count', count(*),
        'cancelados', count(*) FILTER (WHERE p.estado::text = 'Cancelado'),
        'colocado', coalesce(sum(coalesce(p.monto_solicitado, 0)) FILTER (WHERE p.estado::text IS DISTINCT FROM 'Cancelado'), 0),
        'totalPagar', coalesce(sum(coalesce(p.monto_total_pagar, 0)) FILTER (WHERE p.estado::text IS DISTINCT FROM 'Cancelado'), 0))
      FROM prestamos p WHERE p.caja_id = p_caja_id AND p.empresa_id = v_emp)
    WHEN 'pagos' THEN (
      SELECT jsonb_build_object(
        'count', count(*),
        'cobrado', coalesce(sum(coalesce(p.monto_recibido, 0)) FILTER (WHERE NOT coalesce(p.anulado, false)), 0),
        'anulados', coalesce(sum(coalesce(p.monto_recibido, 0)) FILTER (WHERE coalesce(p.anulado, false)), 0))
      FROM pagos p WHERE p.caja_id = p_caja_id AND p.empresa_id = v_emp)
    WHEN 'transferencias' THEN (
      SELECT jsonb_build_object(
        'count', count(*),
        'recibidas', coalesce(sum(coalesce(m.monto, 0)) FILTER (WHERE m.tipo::text = 'entrada'), 0),
        'enviadas', coalesce(sum(coalesce(m.monto, 0)) FILTER (WHERE m.tipo::text <> 'entrada'), 0))
      FROM movimientos_caja m
      WHERE m.caja_id = p_caja_id AND m.empresa_id = v_emp AND m.prestamo_id IS NULL AND m.concepto ILIKE '%transferencia%')
  END
  );
END;
$$;

-- ── Permisos ─────────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public._lower_es(text)',
    'public._kardex_categoria(text, text)',
    'public._gasto_categoria(text)',
    'public._lead_score(integer, integer, integer, integer, integer, integer, double precision, integer, numeric, numeric, integer)',
    'public.estados_cuenta_listado(text, integer, integer)',
    'public.atendidos_semana(date, date, uuid[], uuid[])',
    'public.auditoria_listado(text, text, integer, integer)',
    'public.auditoria_resumen()',
    'public.crm_cartera_listado(text, text, integer, integer)',
    'public.renovacion_candidatos(integer, integer)',
    'public.mapa_puntos(text, text, numeric, numeric, numeric, numeric, integer)',
    'public.mapa_totales(text, text)',
    'public.lead_scoring_listado(text, text, date, integer, integer)',
    'public.promesas_resumen()',
    'public.gastos_listado(text, text, timestamptz, timestamptz, integer, integer)',
    'public.caja_kardex(uuid, text, text, integer, integer)',
    'public.caja_kardex_resumen(uuid)',
    'public.caja_detalle_stats(uuid, date)',
    'public.caja_flujo(uuid)',
    'public.caja_fuentes_resumen(uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

ANALYZE public.clientes;
ANALYZE public.crm_gestiones;
ANALYZE public.promesas_pago;
ANALYZE public.movimientos_caja;

-- ===== 20261013140000_monitoreo.sql =====
-- Monitoreo propio: errores del navegador (client_errors) + RPCs de diagnóstico solo para super admin.

-- 1) Tabla de errores de cliente (sin acceso directo para usuarios; solo vía RPC)
CREATE TABLE IF NOT EXISTS public.client_errors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  empresa_id uuid,
  user_id uuid,
  mensaje text NOT NULL,
  stack text,
  url text,
  user_agent text,
  version text,
  extra jsonb
);

CREATE INDEX IF NOT EXISTS idx_client_errors_created ON public.client_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_user_created ON public.client_errors (user_id, created_at DESC);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.client_errors FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.client_errors TO service_role;

-- 2) Registro de errores. Límite: 30/hora por usuario, 60/hora para anónimos (login/registro),
--    3000/hora global. Lo que excede se descarta en silencio. Retención 30 días (limpieza en ~1% de llamadas).
CREATE OR REPLACE FUNCTION public.log_client_error(
  p_mensaje text,
  p_stack text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_version text DEFAULT NULL,
  p_extra jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa uuid;
  v_limite int := CASE WHEN v_uid IS NULL THEN 60 ELSE 30 END;
  v_n int;
  v_extra jsonb := p_extra;
BEGIN
  IF p_mensaje IS NULL OR btrim(p_mensaje) = '' THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('client_errors:' || coalesce(v_uid::text, 'anon')));

  IF v_uid IS NULL THEN
    SELECT count(*) INTO v_n FROM (
      SELECT 1 FROM client_errors
      WHERE user_id IS NULL AND created_at > now() - interval '1 hour' LIMIT v_limite
    ) s;
  ELSE
    SELECT count(*) INTO v_n FROM (
      SELECT 1 FROM client_errors
      WHERE user_id = v_uid AND created_at > now() - interval '1 hour' LIMIT v_limite
    ) s;
  END IF;
  IF v_n >= v_limite THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM client_errors WHERE created_at > now() - interval '1 hour' LIMIT 3000
  ) s;
  IF v_n >= 3000 THEN
    RETURN;
  END IF;

  IF v_uid IS NOT NULL THEN
    v_empresa := get_user_empresa_id();
  END IF;

  IF v_extra IS NOT NULL AND (jsonb_typeof(v_extra) <> 'object' OR length(v_extra::text) > 4000) THEN
    v_extra := jsonb_build_object('truncado', left(v_extra::text, 4000));
  END IF;

  INSERT INTO client_errors (empresa_id, user_id, mensaje, stack, url, user_agent, version, extra)
  VALUES (
    v_empresa,
    v_uid,
    left(p_mensaje, 1000),
    left(p_stack, CASE WHEN v_uid IS NULL THEN 2000 ELSE 8000 END),
    left(split_part(split_part(p_url, '#', 1), '?', 1), 500),
    left(p_user_agent, 400),
    left(p_version, 100),
    v_extra
  );

  IF random() < 0.01 THEN
    DELETE FROM client_errors WHERE created_at < now() - interval '30 days';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.log_client_error(text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, text, text, text, jsonb) TO anon, authenticated, service_role;

-- 3) Errores de cliente: agrupados por mensaje normalizado + lista cruda paginada (solo super admin)
CREATE OR REPLACE FUNCTION public.admin_client_errors(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_desde timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desde timestamptz := coalesce(p_desde, now() - interval '7 days');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    SELECT ce.*,
           regexp_replace(
             regexp_replace(ce.mensaje, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'),
             '[0-9]+', 'N', 'g') AS clave
    FROM client_errors ce
    WHERE ce.created_at >= v_desde
  ),
  grupos AS (
    SELECT clave,
           count(*) AS conteo,
           count(DISTINCT user_id) AS usuarios,
           count(DISTINCT empresa_id) AS empresas,
           min(created_at) AS primero,
           max(created_at) AS ultimo
    FROM base
    GROUP BY clave
    ORDER BY max(created_at) DESC
    LIMIT v_limit
  ),
  grupos_json AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'clave', g.clave,
             'conteo', g.conteo,
             'usuarios', g.usuarios,
             'empresas', g.empresas,
             'primero', g.primero,
             'ultimo', g.ultimo,
             'mensaje', u.mensaje,
             'stack', u.stack,
             'url', u.url,
             'version', u.version,
             'empresa_nombre', e.nombre
           ) ORDER BY g.ultimo DESC), '[]'::jsonb) AS j
    FROM grupos g
    CROSS JOIN LATERAL (
      SELECT b.mensaje, b.stack, b.url, b.version, b.empresa_id
      FROM base b WHERE b.clave = g.clave
      ORDER BY b.created_at DESC, b.id DESC LIMIT 1
    ) u
    LEFT JOIN empresas e ON e.id = u.empresa_id
  ),
  recientes AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id,
             'created_at', r.created_at,
             'empresa_id', r.empresa_id,
             'empresa_nombre', e.nombre,
             'user_id', r.user_id,
             'mensaje', r.mensaje,
             'stack', r.stack,
             'url', r.url,
             'user_agent', r.user_agent,
             'version', r.version,
             'extra', r.extra
           ) ORDER BY r.created_at DESC, r.id DESC), '[]'::jsonb) AS j
    FROM (
      SELECT * FROM base ORDER BY created_at DESC, id DESC LIMIT v_limit OFFSET v_offset
    ) r
    LEFT JOIN empresas e ON e.id = r.empresa_id
  )
  SELECT jsonb_build_object(
           'desde', v_desde,
           'total', (SELECT count(*) FROM base),
           'total_24h', (SELECT count(*) FROM base WHERE created_at > now() - interval '24 hours'),
           'grupos', (SELECT j FROM grupos_json),
           'recientes', (SELECT j FROM recientes)
         )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_client_errors(int, int, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_client_errors(int, int, timestamptz) TO authenticated;

-- 4) Consultas más costosas desde pg_stat_statements (vacío si la extensión no está disponible)
CREATE OR REPLACE FUNCTION public.admin_slow_queries(p_limit int DEFAULT 20)
RETURNS TABLE (calls bigint, total_ms numeric, mean_ms numeric, filas bigint, query text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rel regclass := coalesce(to_regclass('extensions.pg_stat_statements'), to_regclass('public.pg_stat_statements'));
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF v_rel IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    RETURN QUERY EXECUTE format(
      'SELECT s.calls::bigint,
              round(s.total_exec_time::numeric, 2),
              round(s.mean_exec_time::numeric, 2),
              s.rows::bigint,
              left(s.query, 1000)
       FROM %s s
       WHERE s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
         AND s.query !~* ''pg_stat_statements|^\s*(begin|commit|rollback|set |show |deallocate|discard)''
       ORDER BY s.total_exec_time DESC
       LIMIT $1', v_rel)
    USING least(greatest(coalesce(p_limit, 20), 1), 200);
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_slow_queries(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_slow_queries(int) TO authenticated;

-- 5) Estadísticas de tablas del esquema public
CREATE OR REPLACE FUNCTION public.admin_table_stats()
RETURNS TABLE (
  tabla text, filas bigint, filas_muertas bigint, seq_scan bigint, idx_scan bigint,
  tamano_bytes bigint, ultimo_vacuum timestamptz, ultimo_analyze timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.relname::text,
         s.n_live_tup::bigint,
         s.n_dead_tup::bigint,
         coalesce(s.seq_scan, 0)::bigint,
         coalesce(s.idx_scan, 0)::bigint,
         pg_total_relation_size(s.relid)::bigint,
         greatest(s.last_vacuum, s.last_autovacuum),
         greatest(s.last_analyze, s.last_autoanalyze)
  FROM pg_stat_user_tables s
  WHERE s.schemaname = 'public'
  ORDER BY pg_total_relation_size(s.relid) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_table_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_table_stats() TO authenticated;

-- 6) Resumen por empresa calculado en SQL (antes la página descargaba todos los préstamos de todas las empresas)
CREATE OR REPLACE FUNCTION public.admin_tenant_summary()
RETURNS TABLE (
  empresa_id uuid, nombre text, activa boolean, plan text,
  prestamos_activos bigint, prestamos_total bigint,
  pagos_30d bigint, monto_pagos_30d numeric,
  usuarios bigint, usuarios_activos bigint,
  wa_activo boolean, wa_errores_24h bigint, wa_ultimo_envio timestamptz, wa_ultimo_estado text,
  stripe_conectado boolean, suscripcion_estado text,
  errores_cliente_24h bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH pr AS (
    SELECT p.empresa_id,
           count(*) FILTER (WHERE p.estado::text IN ('Activo', 'Vencido')) AS activos,
           count(*) AS total
    FROM prestamos p GROUP BY p.empresa_id
  ),
  pg AS (
    SELECT p.empresa_id, count(*) AS n, round(coalesce(sum(p.monto_recibido), 0)::numeric, 2) AS monto
    FROM pagos p
    WHERE p.fecha_pago >= current_date - 30 AND NOT coalesce(p.anulado, false)
    GROUP BY p.empresa_id
  ),
  us AS (
    SELECT pf.empresa_id, count(*) AS n, count(*) FILTER (WHERE pf.activo) AS activos
    FROM profiles pf GROUP BY pf.empresa_id
  ),
  wac AS (
    SELECT c.empresa_id, bool_or(c.activo) AS activo FROM whatsapp_config c GROUP BY c.empresa_id
  ),
  wal AS (
    SELECT l.empresa_id, count(*) FILTER (WHERE l.status = 'error') AS errores, max(l.created_at) AS ultimo
    FROM whatsapp_log l
    WHERE l.created_at >= now() - interval '24 hours'
    GROUP BY l.empresa_id
  ),
  wau AS (
    SELECT DISTINCT ON (l.empresa_id) l.empresa_id, l.status
    FROM whatsapp_log l
    WHERE l.created_at >= now() - interval '24 hours'
    ORDER BY l.empresa_id, l.created_at DESC
  ),
  st AS (
    SELECT s.empresa_id, bool_or(s.charges_enabled) AS ok FROM stripe_connect_accounts s GROUP BY s.empresa_id
  ),
  su AS (
    SELECT DISTINCT ON (s.empresa_id) s.empresa_id, s.estado
    FROM suscripciones s
    ORDER BY s.empresa_id, s.actualizado_en DESC NULLS LAST, s.creado_en DESC NULLS LAST
  ),
  ce AS (
    SELECT c.empresa_id, count(*) AS n
    FROM client_errors c
    WHERE c.created_at >= now() - interval '24 hours' AND c.empresa_id IS NOT NULL
    GROUP BY c.empresa_id
  )
  SELECT e.id, e.nombre, e.activa, e.plan,
         coalesce(pr.activos, 0), coalesce(pr.total, 0),
         coalesce(pg.n, 0), coalesce(pg.monto, 0),
         coalesce(us.n, 0), coalesce(us.activos, 0),
         coalesce(wac.activo, false), coalesce(wal.errores, 0), wal.ultimo, wau.status,
         coalesce(st.ok, false), su.estado,
         coalesce(ce.n, 0)
  FROM empresas e
  LEFT JOIN pr ON pr.empresa_id = e.id
  LEFT JOIN pg ON pg.empresa_id = e.id
  LEFT JOIN us ON us.empresa_id = e.id
  LEFT JOIN wac ON wac.empresa_id = e.id
  LEFT JOIN wal ON wal.empresa_id = e.id
  LEFT JOIN wau ON wau.empresa_id = e.id
  LEFT JOIN st ON st.empresa_id = e.id
  LEFT JOIN su ON su.empresa_id = e.id
  LEFT JOIN ce ON ce.empresa_id = e.id
  ORDER BY coalesce(wal.errores, 0) DESC, e.nombre;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_tenant_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_tenant_summary() TO authenticated;

-- ===== 20261013150000_permisos_rpc.sql =====
-- Permisos por rol aplicados en el servidor (misma matriz que src/hooks/usePermisos.ts:
-- role_permissions de la empresa y, si no hay fila, los valores por defecto).

CREATE OR REPLACE FUNCTION public.rol_actual()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r FROM (VALUES ('admin'::public.app_role, 1), ('supervisor', 2), ('cobrador', 3)) v(r, o)
  WHERE public.has_role(auth.uid(), r)
  ORDER BY o LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_module text, p_action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
  v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN coalesce(auth.role(), '') = 'service_role' OR current_user IN ('postgres', 'service_role');
  END IF;
  IF public.is_super_admin() THEN RETURN true; END IF;
  v_role := public.rol_actual();
  IF v_role IS NULL THEN RETURN false; END IF;

  SELECT rp.allowed INTO v_allowed
  FROM public.role_permissions rp
  WHERE rp.role = v_role AND rp.module = p_module AND rp.action = p_action
    AND (rp.empresa_id = public.get_user_empresa_id() OR rp.empresa_id IS NULL)
  ORDER BY rp.empresa_id NULLS LAST
  LIMIT 1;
  IF v_allowed IS NOT NULL THEN RETURN v_allowed; END IF;

  RETURN CASE v_role
    WHEN 'admin' THEN true
    WHEN 'supervisor' THEN p_module = ANY (ARRAY['dashboard','cobranza','mi_cobranza','prestamos','pagos','promesas',
                                                  'solicitudes','clientes','crm','scoring','mapa_gps','reportes'])
                           AND p_action = ANY (ARRAY['ver','agregar','editar'])
    ELSE (p_module = ANY (ARRAY['dashboard','cobranza','mi_cobranza','prestamos','pagos','promesas','solicitudes']) AND p_action = 'ver')
         OR (p_module = ANY (ARRAY['pagos','promesas']) AND p_action = 'agregar')
  END;
END $$;

REVOKE ALL ON FUNCTION public.rol_actual() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tiene_permiso(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rol_actual() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tiene_permiso(text, text) TO authenticated, service_role;

-- Guardas de permiso inyectadas al inicio de cada RPC (idempotente con marcador).
DO $$
DECLARE
  g record;
  f record;
  def text;
  nuevo text;
  cond text;
BEGIN
  FOR g IN
    SELECT * FROM (VALUES
      ('cancelar_prestamo',        $c$public.tiene_permiso('prestamos','cancelar_prestamo')$c$),
      ('reestructurar_prestamo',   $c$public.tiene_permiso('prestamos','reestructurar')$c$),
      ('editar_prestamo',          $c$public.tiene_permiso('prestamos','editar')$c$),
      ('crear_prestamo',           $c$public.tiene_permiso('prestamos','agregar') OR public.tiene_permiso('solicitudes','aprobar_solicitud')$c$),
      ('editar_pago',              $c$public.tiene_permiso('pagos','editar')$c$),
      ('revertir_pago',            $c$public.tiene_permiso('pagos','anular_pago')$c$),
      ('registrar_pago_completo',  $c$public.tiene_permiso('pagos','agregar')$c$),
      ('liquidar_prestamo',        $c$public.tiene_permiso('pagos','agregar')$c$),
      ('transferir_caja',          $c$public.tiene_permiso('cajas','editar')$c$),
      ('registrar_movimiento_caja',$c$public.tiene_permiso('cajas','editar') OR public.tiene_permiso('gastos','agregar')$c$),
      ('registrar_promesa_pago',   $c$public.tiene_permiso('promesas','agregar')$c$)
    ) AS t(fn, cond)
  LOOP
    FOR f IN
      SELECT p.oid FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname = g.fn AND l.lanname = 'plpgsql'
    LOOP
      def := pg_get_functiondef(f.oid);
      CONTINUE WHEN def LIKE '%/*perm_guard*/%';
      cond := format('IF auth.uid() IS NOT NULL AND NOT (%s) THEN RAISE EXCEPTION ''No tienes permiso para esta acción'' USING ERRCODE = ''42501''; END IF; ', g.cond);
      nuevo := regexp_replace(def, '(AS \$function\$.*?\mBEGIN\M)', '\1 /*perm_guard*/ ' || cond, 'i');
      IF nuevo = def THEN
        RAISE NOTICE 'perm_guard: no se pudo inyectar en %', g.fn;
      ELSE
        EXECUTE nuevo;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- cajas.saldo_actual solo lo escribe el trigger/RPCs: el cliente solo puede crear y renombrar/activar cajas.
REVOKE INSERT, UPDATE ON public.cajas FROM anon, authenticated;
GRANT INSERT (nombre, descripcion, empresa_id, activo) ON public.cajas TO authenticated;
GRANT UPDATE (nombre, descripcion, activo) ON public.cajas TO authenticated;
