-- Verifica si ya están aplicados los índices de 20261013130000_paginacion y el arreglo RLS de 20261012120000. Solo lectura.
SELECT jsonb_pretty(jsonb_build_object(
  'indices_faltantes', (
    SELECT coalesce(jsonb_agg(i), '[]'::jsonb) FROM unnest(ARRAY[
      'idx_clientes_empresa_created','idx_prestamos_cliente','idx_crm_gestiones_empresa_created',
      'idx_promesas_pago_empresa_created','idx_promesas_pago_empresa_fecha','idx_solicitudes_empresa_created',
      'idx_pagos_empresa_anulado_en','idx_pagos_caja_created','idx_prestamos_caja_created',
      'idx_movimientos_caja_caja_fecha_id','idx_movimientos_caja_salidas','idx_amortizacion_empresa_fv',
      'idx_amortizacion_prestamo_num','idx_amortizacion_empresa_status']) AS i
    WHERE to_regclass('public.' || i) IS NULL),
  'politicas_sin_initplan', (
    SELECT coalesce(jsonb_agg(tablename || '.' || policyname), '[]'::jsonb) FROM pg_policies
    WHERE schemaname = 'public'
      AND (  (length(coalesce(qual,'') || coalesce(with_check,'')) - length(replace(coalesce(qual,'') || coalesce(with_check,''), 'get_user_empresa_id()', ''))) / 21
           > (length(coalesce(qual,'') || coalesce(with_check,'')) - length(replace(coalesce(qual,'') || coalesce(with_check,''), 'SELECT get_user_empresa_id()', ''))) / 28
          OR (length(coalesce(qual,'') || coalesce(with_check,'')) - length(replace(coalesce(qual,'') || coalesce(with_check,''), 'has_role(', ''))) / 9
           > (length(coalesce(qual,'') || coalesce(with_check,'')) - length(replace(coalesce(qual,'') || coalesce(with_check,''), 'SELECT has_role(', ''))) / 16)),
  'funciones_paginacion_faltantes', (
    SELECT coalesce(jsonb_agg(f), '[]'::jsonb)
    FROM unnest(ARRAY['estados_cuenta_listado','auditoria_listado','crm_cartera_listado','renovacion_candidatos']) AS f
    WHERE NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = f)),
  'profiles_seq_scan_ahora', (SELECT seq_scan FROM pg_stat_user_tables WHERE relname = 'profiles')
)) AS verificacion;
