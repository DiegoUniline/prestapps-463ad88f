-- Paginación y agregados en servidor para pantallas que descargaban tablas completas del tenant
-- (Clientes, Auditoría, CRM Cobranza, Renovación, Mapa GPS, Lead Scoring, Promesas, Gastos,
-- detalle de caja: kardex/stats/flujo/pestañas de origen, atendidos de la semana).
-- Funciones de solo lectura: SECURITY INVOKER (RLS sigue aplicando) + filtro explícito
-- empresa_id = get_user_empresa_id(). Idempotente y aditivo: el frontend anterior sigue funcionando.

-- ── Índices de soporte ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clientes_empresa_created        ON public.clientes (empresa_id, created_at DESC);
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
-- lower() con acentos en mayúscula normalizados (igual que String#toLowerCase para español).
CREATE OR REPLACE FUNCTION public._lower_es(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT lower(translate(coalesce(p, ''), 'ÁÉÍÓÚÜÑ', 'áéíóúüñ'));
$$;

-- Igual que classifyConcepto() del kardex de caja (CajaDetallePage).
CREATE OR REPLACE FUNCTION public._kardex_categoria(p_concepto text, p_tipo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN strpos(l, 'corrección') > 0 OR strpos(l, 'correccion') > 0 OR strpos(l, 'movido a caja') > 0 THEN 'Correcciones'
    WHEN strpos(l, 'anulación') > 0 OR strpos(l, 'anulacion') > 0 THEN 'Anulaciones'
    WHEN strpos(l, 'pago') > 0 OR strpos(l, 'cobro') > 0 OR strpos(l, 'cuota') > 0 THEN 'Pagos'
    WHEN strpos(l, 'desembolso') > 0 OR strpos(l, 'préstamo') > 0 THEN 'Desembolsos'
    WHEN strpos(l, 'comisión') > 0 OR strpos(l, 'comision') > 0 OR strpos(l, 'corte') > 0 THEN 'Comisiones'
    WHEN strpos(l, 'transferencia') > 0 THEN 'Transferencias'
    WHEN strpos(l, '[') > 0 OR strpos(l, 'gasto') > 0 THEN 'Gastos'
    WHEN p_tipo = 'entrada' THEN 'Depósitos'
    ELSE 'Retiros'
  END
  FROM (SELECT public._lower_es(p_concepto) AS l) x;
$$;

-- Igual que extractCategoria() de GastosPage.
CREATE OR REPLACE FUNCTION public._gasto_categoria(p_concepto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
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
  END
  FROM (SELECT public._lower_es(p_concepto) AS l) x;
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
SET search_path = public
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH emp AS (SELECT public.get_user_empresa_id() AS id),
  q AS (SELECT lower(nullif(p_search, '')) AS q),
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
    CROSS JOIN emp
    WHERE a.empresa_id = emp.id AND a.status <> 'Pagada'
    GROUP BY pr.cliente_id
  ),
  f AS (
    SELECT c.id, c.id_cliente, c.nombre_completo, cu.saldo_total, cu.cuotas_vencidas, cu.saldo_moroso
    FROM clientes c
    CROSS JOIN emp
    CROSS JOIN q
    JOIN cu ON cu.cliente_id = c.id
    WHERE c.empresa_id = emp.id
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
  );
$$;

-- ── 2) Atendidos de la semana (pagos + gestiones) ────────────────
-- Sin p_cliente_ids / p_prestamo_ids: todos los atendidos de la semana.
-- Con alguno: cada lista de salida se limita a los ids dados (NULL => lista vacía).
CREATE OR REPLACE FUNCTION public.atendidos_semana(
  p_desde date,
  p_hasta date,
  p_cliente_ids uuid[] DEFAULT NULL,
  p_prestamo_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH emp AS (SELECT public.get_user_empresa_id() AS id),
  scope AS (SELECT (p_cliente_ids IS NOT NULL OR p_prestamo_ids IS NOT NULL) AS on_),
  g AS (
    SELECT g.prestamo_id, g.cliente_id
    FROM crm_gestiones g, emp
    WHERE g.empresa_id = emp.id
      AND g.created_at >= p_desde::timestamp::timestamptz
      AND g.created_at <= (p_hasta::timestamp + interval '23 hours 59 minutes 59 seconds')::timestamptz
  ),
  pres AS (
    SELECT p.prestamo_id
    FROM pagos p, emp
    WHERE p.empresa_id = emp.id AND p.anulado = false
      AND p.fecha_pago >= p_desde AND p.fecha_pago <= p_hasta
    UNION
    SELECT g.prestamo_id FROM g WHERE g.prestamo_id IS NOT NULL
  ),
  cli AS (
    SELECT g.cliente_id FROM g WHERE g.cliente_id IS NOT NULL
    UNION
    SELECT pr.cliente_id FROM prestamos pr JOIN pres ON pres.prestamo_id = pr.id
  )
  SELECT jsonb_build_object(
    'prestamo_ids', coalesce((SELECT jsonb_agg(pres.prestamo_id) FROM pres, scope
                              WHERE NOT scope.on_ OR pres.prestamo_id = ANY (p_prestamo_ids)), '[]'::jsonb),
    'cliente_ids', coalesce((SELECT jsonb_agg(cli.cliente_id) FROM cli, scope
                             WHERE NOT scope.on_ OR cli.cliente_id = ANY (p_cliente_ids)), '[]'::jsonb)
  );
$$;

-- ── 3) Auditoría: bitácora unificada paginada ────────────────────
-- p_tipo: 'pago' | 'anulacion' | 'gestion' | 'promesa' | NULL (todos).
-- Devuelve p_limit filas + has_more (sin COUNT de toda la bitácora).
CREATE OR REPLACE FUNCTION public.auditoria_listado(p_tipo text DEFAULT NULL, p_search text DEFAULT NULL, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH emp AS (SELECT public.get_user_empresa_id() AS id),
  ev AS (
    SELECT 'pago'::text AS tipo, p.id, p.created_at AS fecha, p.monto_recibido AS monto,
           c.nombre_completo AS cliente, NULL::text AS detalle, p.registrado_por AS usuario_id,
           NULL::text AS tipo_gestion, NULL::text AS resultado, NULL::text AS fecha_prometida, NULL::text AS status
    FROM pagos p
    JOIN prestamos pr ON pr.id = p.prestamo_id
    JOIN clientes c ON c.id = pr.cliente_id
    CROSS JOIN emp
    WHERE p.empresa_id = emp.id AND (p_tipo IS NULL OR p_tipo = 'pago')
    UNION ALL
    SELECT 'anulacion', p.id, coalesce(p.anulado_en, p.created_at), p.monto_recibido,
           c.nombre_completo, p.motivo_anulacion, p.anulado_por,
           NULL, NULL, NULL, NULL
    FROM pagos p
    JOIN prestamos pr ON pr.id = p.prestamo_id
    JOIN clientes c ON c.id = pr.cliente_id
    CROSS JOIN emp
    WHERE p.empresa_id = emp.id AND p.anulado AND (p_tipo IS NULL OR p_tipo = 'anulacion')
    UNION ALL
    SELECT 'gestion', g.id, g.created_at, NULL,
           c.nombre_completo, left(g.notas, 80), g.registrado_por,
           g.tipo_gestion, g.resultado, NULL, NULL
    FROM crm_gestiones g
    JOIN clientes c ON c.id = g.cliente_id
    CROSS JOIN emp
    WHERE g.empresa_id = emp.id AND (p_tipo IS NULL OR p_tipo = 'gestion')
    UNION ALL
    SELECT 'promesa', pp.id, pp.created_at, pp.monto_prometido,
           NULL, NULL, NULL,
           NULL, NULL, pp.fecha_prometida::text, pp.status
    FROM promesas_pago pp
    CROSS JOIN emp
    WHERE pp.empresa_id = emp.id AND (p_tipo IS NULL OR p_tipo = 'promesa')
  ),
  ev2 AS (
    SELECT ev.*,
           CASE WHEN ev.tipo = 'promesa' THEN 'Sistema' ELSE coalesce(pf.nombre_completo, 'Sistema') END AS usuario,
           CASE ev.tipo
             WHEN 'pago' THEN 'Pago registrado'
             WHEN 'anulacion' THEN 'Pago anulado'
             WHEN 'promesa' THEN 'Promesa registrada'
             ELSE CASE ev.tipo_gestion WHEN 'visita' THEN 'Visita' WHEN 'llamada' THEN 'Llamada' WHEN 'whatsapp' THEN 'WhatsApp'
                  ELSE coalesce(ev.tipo_gestion, '') END || ': ' || coalesce(ev.resultado, '')
           END AS accion
    FROM ev
    CROSS JOIN emp
    LEFT JOIN profiles pf ON pf.id = ev.usuario_id AND pf.empresa_id = emp.id
  ),
  q AS (SELECT lower(nullif(p_search, '')) AS q),
  f AS (
    SELECT ev2.*
    FROM ev2, q
    WHERE q.q IS NULL
       OR strpos(lower(coalesce(ev2.cliente, '—')), q.q) > 0
       OR strpos(lower(coalesce(ev2.detalle, '')), q.q) > 0
       OR strpos(lower(ev2.usuario), q.q) > 0
       OR strpos(lower(ev2.accion), q.q) > 0
       OR strpos(lower(coalesce(ev2.fecha_prometida, '')), q.q) > 0
       OR strpos(lower(coalesce(ev2.status, '')), q.q) > 0
    ORDER BY ev2.fecha DESC NULLS LAST, ev2.tipo, ev2.id
    LIMIT p_limit + 1 OFFSET greatest(coalesce(p_offset, 0), 0)
  ),
  numerada AS (SELECT f.*, row_number() OVER (ORDER BY f.fecha DESC NULLS LAST, f.tipo, f.id) AS rn FROM f)
  SELECT jsonb_build_object(
    'has_more', (SELECT count(*) > p_limit FROM numerada),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', n.id, 'tipo', n.tipo, 'fecha', n.fecha, 'monto', n.monto, 'cliente', n.cliente,
               'detalle', n.detalle, 'usuario', n.usuario, 'accion', n.accion, 'tipo_gestion', n.tipo_gestion,
               'fecha_prometida', n.fecha_prometida, 'status', n.status) ORDER BY n.rn)
      FROM numerada n WHERE n.rn <= p_limit), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.auditoria_resumen()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH emp AS (SELECT public.get_user_empresa_id() AS id),
  pg AS (
    SELECT count(*) AS pagos, count(*) FILTER (WHERE p.anulado) AS anulaciones
    FROM pagos p, emp
    WHERE p.empresa_id = emp.id
  ),
  ge AS (
    SELECT count(*) AS gestiones FROM crm_gestiones g, emp
    WHERE g.empresa_id = emp.id AND EXISTS (SELECT 1 FROM clientes c WHERE c.id = g.cliente_id)
  ),
  pp AS (SELECT count(*) AS promesas FROM promesas_pago pp, emp WHERE pp.empresa_id = emp.id)
  SELECT jsonb_build_object(
    'pagos', pg.pagos, 'anulaciones', pg.anulaciones, 'gestiones', ge.gestiones, 'promesas', pp.promesas,
    'total', pg.pagos + pg.anulaciones + ge.gestiones + pp.promesas)
  FROM pg, ge, pp;
$$;

-- ── 4) CRM Cobranza: cartera paginada con agregados por préstamo ─
-- p_filtro: 'todos' | 'vencido' (con cuotas vencidas) | 'al_dia'.
CREATE OR REPLACE FUNCTION public.crm_cartera_listado(p_search text DEFAULT NULL, p_filtro text DEFAULT 'todos', p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH emp AS (SELECT public.get_user_empresa_id() AS id),
  pr AS (
    SELECT p.id, p.created_at, p.monto_solicitado, p.num_cuotas, p.frecuencia::text AS frecuencia,
           p.estado::text AS estado, p.fecha_registro, c.id AS cliente_id, c.nombre_completo, c.telefono, c.direccion
    FROM prestamos p
    JOIN clientes c ON c.id = p.cliente_id
    CROSS JOIN emp
    WHERE p.empresa_id = emp.id AND p.estado::text IN ('Activo', 'Al día', 'Vencido')
  ),
  ag AS (
    SELECT a.prestamo_id,
           count(*) FILTER (WHERE a.status = 'Vencida' OR coalesce(a.dias_atraso, 0) > 0) AS vencidas,
           sum(coalesce(a.saldo_mora, 0)) AS mora,
           sum(coalesce(a.saldo_total, 0)) AS adeudado,
           greatest(0, max(coalesce(a.dias_atraso, 0))) AS max_dias
    FROM amortizacion a
    JOIN pr ON pr.id = a.prestamo_id
    CROSS JOIN emp
    WHERE a.empresa_id = emp.id
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
      CROSS JOIN emp
      LEFT JOIN LATERAL (
        SELECT count(*) AS n,
               (SELECT jsonb_build_object('resultado', g2.resultado, 'created_at', g2.created_at)
                FROM crm_gestiones g2
                WHERE g2.prestamo_id = pg.id AND g2.empresa_id = emp.id
                ORDER BY g2.created_at DESC NULLS LAST, g2.id
                LIMIT 1) AS ultima
        FROM crm_gestiones g
        WHERE g.prestamo_id = pg.id AND g.empresa_id = emp.id
      ) gs ON true), '[]'::jsonb)
  );
$$;

-- ── 5) Renovación: candidatos paginados + totales ────────────────
CREATE OR REPLACE FUNCTION public.renovacion_candidatos(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH emp AS (SELECT public.get_user_empresa_id() AS id),
  pr AS (
    SELECT p.id, p.monto_solicitado, p.monto_total_pagar, p.num_cuotas, p.frecuencia::text AS frecuencia,
           p.tasa_interes, p.modalidad::text AS modalidad, p.cliente_id, p.ruta_id, p.caja_id, p.cobrador_id,
           c.nombre_completo, c.telefono
    FROM prestamos p
    JOIN clientes c ON c.id = p.cliente_id
    CROSS JOIN emp
    WHERE p.empresa_id = emp.id AND p.estado::text IN ('Activo', 'Al día')
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
    CROSS JOIN emp
    WHERE a.empresa_id = emp.id
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
  );
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH emp AS (SELECT public.get_user_empresa_id() AS id),
  q AS (SELECT lower(nullif(p_search, '')) AS q),
  bb AS (SELECT (p_min_lat IS NOT NULL AND p_min_lng IS NOT NULL AND p_max_lat IS NOT NULL AND p_max_lng IS NOT NULL) AS on_),
  cl AS (
    SELECT 'cliente'::text AS tipo, c.gps_lat AS lat, c.gps_lng AS lng, c.nombre_completo AS nombre,
           c.id_cliente, c.direccion, NULL::numeric AS monto, c.created_at AS fecha
    FROM clientes c, emp, q, bb
    WHERE coalesce(p_tipo, 'todos') IN ('todos', 'clientes')
      AND c.empresa_id = emp.id
      AND c.gps_lat IS NOT NULL AND c.gps_lng IS NOT NULL AND c.gps_lat <> 0 AND c.gps_lng <> 0
      AND (NOT bb.on_ OR (c.gps_lat BETWEEN p_min_lat AND p_max_lat AND c.gps_lng BETWEEN p_min_lng AND p_max_lng))
      AND (q.q IS NULL OR strpos(lower(c.nombre_completo), q.q) > 0 OR strpos(lower(c.id_cliente), q.q) > 0
           OR strpos(lower(coalesce(c.direccion, '')), q.q) > 0)
    ORDER BY c.created_at DESC NULLS LAST, c.id
    LIMIT p_limit
  ),
  pr AS (
    SELECT 'prestamo'::text, p.gps_lat, p.gps_lng, c.nombre_completo, NULL::text, NULL::text,
           p.monto_solicitado, p.created_at
    FROM prestamos p
    JOIN clientes c ON c.id = p.cliente_id
    CROSS JOIN emp CROSS JOIN q CROSS JOIN bb
    WHERE coalesce(p_tipo, 'todos') IN ('todos', 'prestamos')
      AND p.empresa_id = emp.id
      AND p.gps_lat IS NOT NULL AND p.gps_lng IS NOT NULL AND p.gps_lat <> 0 AND p.gps_lng <> 0
      AND (NOT bb.on_ OR (p.gps_lat BETWEEN p_min_lat AND p_max_lat AND p.gps_lng BETWEEN p_min_lng AND p_max_lng))
      AND (q.q IS NULL OR strpos(lower(c.nombre_completo), q.q) > 0)
    ORDER BY p.created_at DESC NULLS LAST, p.id
    LIMIT p_limit
  ),
  pg AS (
    SELECT 'pago'::text, p.gps_lat, p.gps_lng, c.nombre_completo, NULL::text, NULL::text,
           p.monto_recibido, p.created_at
    FROM pagos p
    JOIN prestamos pr2 ON pr2.id = p.prestamo_id
    JOIN clientes c ON c.id = pr2.cliente_id
    CROSS JOIN emp CROSS JOIN q CROSS JOIN bb
    WHERE coalesce(p_tipo, 'todos') IN ('todos', 'pagos')
      AND p.empresa_id = emp.id
      AND p.gps_lat IS NOT NULL AND p.gps_lng IS NOT NULL AND p.gps_lat <> 0 AND p.gps_lng <> 0
      AND (NOT bb.on_ OR (p.gps_lat BETWEEN p_min_lat AND p_max_lat AND p.gps_lng BETWEEN p_min_lng AND p_max_lng))
      AND (q.q IS NULL OR strpos(lower(c.nombre_completo), q.q) > 0)
    ORDER BY p.created_at DESC NULLS LAST, p.id
    LIMIT p_limit
  ),
  todo AS (SELECT * FROM cl UNION ALL SELECT * FROM pr UNION ALL SELECT * FROM pg)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'tipo', t.tipo, 'lat', t.lat, 'lng', t.lng, 'nombre', t.nombre, 'id_cliente', t.id_cliente,
           'direccion', t.direccion, 'monto', t.monto, 'fecha', t.fecha)), '[]'::jsonb)
  FROM todo t;
$$;

-- Conteos totales (todo el tenant, con el mismo filtro/búsqueda) para los KPIs del mapa.
CREATE OR REPLACE FUNCTION public.mapa_totales(p_tipo text DEFAULT 'todos', p_search text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH emp AS (SELECT public.get_user_empresa_id() AS id),
  q AS (SELECT lower(nullif(p_search, '')) AS q)
  SELECT jsonb_build_object(
    'clientes', CASE WHEN coalesce(p_tipo, 'todos') IN ('todos', 'clientes') THEN (
      SELECT count(*) FROM clientes c, emp, q
      WHERE c.empresa_id = emp.id
        AND c.gps_lat IS NOT NULL AND c.gps_lng IS NOT NULL AND c.gps_lat <> 0 AND c.gps_lng <> 0
        AND (q.q IS NULL OR strpos(lower(c.nombre_completo), q.q) > 0 OR strpos(lower(c.id_cliente), q.q) > 0
             OR strpos(lower(coalesce(c.direccion, '')), q.q) > 0)) ELSE 0 END,
    'prestamos', CASE WHEN coalesce(p_tipo, 'todos') IN ('todos', 'prestamos') THEN (
      SELECT count(*) FROM prestamos p JOIN clientes c ON c.id = p.cliente_id CROSS JOIN emp CROSS JOIN q
      WHERE p.empresa_id = emp.id
        AND p.gps_lat IS NOT NULL AND p.gps_lng IS NOT NULL AND p.gps_lat <> 0 AND p.gps_lng <> 0
        AND (q.q IS NULL OR strpos(lower(c.nombre_completo), q.q) > 0)) ELSE 0 END,
    'pagos', CASE WHEN coalesce(p_tipo, 'todos') IN ('todos', 'pagos') THEN (
      SELECT count(*) FROM pagos p JOIN prestamos pr ON pr.id = p.prestamo_id JOIN clientes c ON c.id = pr.cliente_id
      CROSS JOIN emp CROSS JOIN q
      WHERE p.empresa_id = emp.id
        AND p.gps_lat IS NOT NULL AND p.gps_lng IS NOT NULL AND p.gps_lat <> 0 AND p.gps_lng <> 0
        AND (q.q IS NULL OR strpos(lower(c.nombre_completo), q.q) > 0)) ELSE 0 END
  );
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH emp AS (
    SELECT e.id, coalesce(e.dias_gracia, 0) AS gracia, coalesce(p_hoy, (now() AT TIME ZONE 'UTC')::date) AS hoy
    FROM empresas e
    WHERE e.id = public.get_user_empresa_id()
  ),
  cl AS (
    SELECT c.id, c.id_cliente, c.nombre_completo
    FROM clientes c, emp
    WHERE c.empresa_id = emp.id AND c.activo = true
  ),
  pr AS (
    SELECT p.id, p.cliente_id, p.estado::text AS estado, coalesce(p.monto_solicitado, 0) AS monto
    FROM prestamos p, emp
    WHERE p.empresa_id = emp.id
  ),
  pa AS (
    SELECT pr.cliente_id, count(*)::integer AS total, count(*) FILTER (WHERE pr.estado = 'Liquidado')::integer AS liquidados,
           sum(pr.monto) AS monto
    FROM pr GROUP BY pr.cliente_id
  ),
  cuo AS (
    SELECT pr.cliente_id, a.status, coalesce(a.dias_atraso, 0) AS dias, coalesce(a.saldo_total, 0) AS saldo,
           emp.hoy - a.fecha_vencimiento::date AS diff, emp.gracia
    FROM amortizacion a
    JOIN pr ON pr.id = a.prestamo_id
    CROSS JOIN emp
    WHERE a.empresa_id = emp.id
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
           emp.gracia
    FROM cl
    CROSS JOIN emp
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
  );
$$;

-- ── 8) Promesas: KPIs ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.promesas_resumen()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'pendientes', count(*) FILTER (WHERE pp.status = 'Pendiente'),
    'vencidas', count(*) FILTER (WHERE pp.status = 'Vencida'),
    'monto', coalesce(sum(coalesce(pp.monto_prometido, 0)), 0))
  FROM promesas_pago pp
  WHERE pp.empresa_id = public.get_user_empresa_id();
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH emp AS (SELECT public.get_user_empresa_id() AS id),
  q AS (SELECT lower(nullif(p_search, '')) AS q),
  g AS (
    SELECT m.id, m.created_at, coalesce(m.concepto, '') AS concepto, coalesce(m.monto, 0) AS monto,
           coalesce(nullif(cj.nombre, ''), '—') AS caja, m.caja_id, public._gasto_categoria(m.concepto) AS categoria
    FROM movimientos_caja m
    CROSS JOIN emp
    LEFT JOIN cajas cj ON cj.id = m.caja_id
    WHERE m.empresa_id = emp.id
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
  );
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
        AND m.empresa_id = public.get_user_empresa_id()
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
      AND m.empresa_id = public.get_user_empresa_id()
  ) x
  GROUP BY x.categoria;
$$;

-- ── 11) Caja: KPIs de cartera (mora calculada al día) ────────────
-- p_today: fecha UTC (como new Date().toISOString().slice(0, 10)).
CREATE OR REPLACE FUNCTION public.caja_detalle_stats(p_caja_id uuid, p_today date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH t AS (SELECT coalesce(p_today, (now() AT TIME ZONE 'UTC')::date) AS hoy, public.get_user_empresa_id() AS emp),
  pr AS (
    SELECT p.id, coalesce(p.monto_solicitado, 0) AS monto, coalesce(p.monto_total_pagar, 0) AS total,
           p.estado::text AS estado, p.tipo_mora::text AS tipo_mora, coalesce(p.valor_mora, 0) AS valor_mora
    FROM prestamos p, t
    WHERE p.caja_id = p_caja_id AND p.empresa_id = t.emp AND p.estado::text <> 'Cancelado'
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
    WHERE a.empresa_id = t.emp
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
  FROM x;
$$;

-- ── 12) Caja: flujo de efectivo desde tablas fuente ──────────────
CREATE OR REPLACE FUNCTION public.caja_flujo(p_caja_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH t AS (SELECT public.get_user_empresa_id() AS emp),
  man AS (
    SELECT x.tipo, x.monto,
           strpos(x.l, 'transferencia') > 0 AS es_transf,
           (strpos(x.l, 'comisión') > 0 OR strpos(x.l, 'comision') > 0 OR strpos(x.l, 'corte') > 0 OR strpos(x.l, 'gasto cobrador') > 0) AS es_comision,
           (strpos(x.l, '[') > 0 OR left(x.l, 5) = 'gasto') AS es_gasto
    FROM (
      SELECT m.tipo::text AS tipo, coalesce(m.monto, 0) AS monto, public._lower_es(m.concepto) AS l
      FROM movimientos_caja m, t
      WHERE m.caja_id = p_caja_id AND m.empresa_id = t.emp AND m.prestamo_id IS NULL
    ) x
    WHERE NOT (strpos(x.l, 'corrección') > 0 OR strpos(x.l, 'correccion') > 0 OR strpos(x.l, 'movido a caja') > 0)
  )
  SELECT jsonb_build_object(
    'cobros', (SELECT coalesce(sum(coalesce(p.monto_recibido, 0)), 0) FROM pagos p, t
               WHERE p.caja_id = p_caja_id AND p.empresa_id = t.emp AND p.anulado = false),
    'desembolsos', (SELECT coalesce(sum(coalesce(pr.monto_solicitado, 0)), 0) FROM prestamos pr, t
                    WHERE pr.caja_id = p_caja_id AND pr.empresa_id = t.emp AND pr.estado::text <> 'Cancelado'),
    'transferencias_in', (SELECT coalesce(sum(monto), 0) FROM man WHERE es_transf AND tipo = 'entrada'),
    'transferencias_out', (SELECT coalesce(sum(monto), 0) FROM man WHERE es_transf AND tipo <> 'entrada'),
    'comisiones', (SELECT coalesce(sum(monto), 0) FROM man WHERE NOT es_transf AND es_comision),
    'gastos', (SELECT coalesce(sum(monto), 0) FROM man WHERE NOT es_transf AND NOT es_comision AND es_gasto),
    'depositos', (SELECT coalesce(sum(monto), 0) FROM man WHERE NOT es_transf AND NOT es_comision AND NOT es_gasto AND tipo = 'entrada'),
    'retiros', (SELECT coalesce(sum(monto), 0) FROM man WHERE NOT es_transf AND NOT es_comision AND NOT es_gasto AND tipo <> 'entrada')
  );
$$;

-- ── 13) Caja: totales de las pestañas Préstamos / Pagos / Transferencias ──
-- p_fuente: 'prestamos' | 'pagos' | 'transferencias'.
CREATE OR REPLACE FUNCTION public.caja_fuentes_resumen(p_caja_id uuid, p_fuente text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET jit = off
AS $$
  WITH t AS (SELECT public.get_user_empresa_id() AS emp)
  SELECT CASE p_fuente
    WHEN 'prestamos' THEN (
      SELECT jsonb_build_object(
        'count', count(*),
        'cancelados', count(*) FILTER (WHERE p.estado::text = 'Cancelado'),
        'colocado', coalesce(sum(coalesce(p.monto_solicitado, 0)) FILTER (WHERE p.estado::text IS DISTINCT FROM 'Cancelado'), 0),
        'totalPagar', coalesce(sum(coalesce(p.monto_total_pagar, 0)) FILTER (WHERE p.estado::text IS DISTINCT FROM 'Cancelado'), 0))
      FROM prestamos p, t WHERE p.caja_id = p_caja_id AND p.empresa_id = t.emp)
    WHEN 'pagos' THEN (
      SELECT jsonb_build_object(
        'count', count(*),
        'cobrado', coalesce(sum(coalesce(p.monto_recibido, 0)) FILTER (WHERE NOT coalesce(p.anulado, false)), 0),
        'anulados', coalesce(sum(coalesce(p.monto_recibido, 0)) FILTER (WHERE coalesce(p.anulado, false)), 0))
      FROM pagos p, t WHERE p.caja_id = p_caja_id AND p.empresa_id = t.emp)
    WHEN 'transferencias' THEN (
      SELECT jsonb_build_object(
        'count', count(*),
        'recibidas', coalesce(sum(coalesce(m.monto, 0)) FILTER (WHERE m.tipo::text = 'entrada'), 0),
        'enviadas', coalesce(sum(coalesce(m.monto, 0)) FILTER (WHERE m.tipo::text <> 'entrada'), 0))
      FROM movimientos_caja m, t
      WHERE m.caja_id = p_caja_id AND m.empresa_id = t.emp AND m.prestamo_id IS NULL AND m.concepto ILIKE '%transferencia%')
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
