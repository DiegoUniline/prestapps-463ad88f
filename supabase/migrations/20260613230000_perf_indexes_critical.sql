-- Performance indexes targeting top slow queries from pg_stat_statements
CREATE INDEX IF NOT EXISTS idx_amortizacion_prestamo_num
  ON public.amortizacion (prestamo_id, num_cuota);

CREATE INDEX IF NOT EXISTS idx_amortizacion_empresa_id
  ON public.amortizacion (empresa_id);

CREATE INDEX IF NOT EXISTS idx_amortizacion_pendientes
  ON public.amortizacion (prestamo_id, fecha_vencimiento)
  WHERE saldo_total > 0.009;

CREATE INDEX IF NOT EXISTS idx_pagos_prestamo_activos
  ON public.pagos (prestamo_id, fecha_pago DESC)
  WHERE anulado = false;

CREATE INDEX IF NOT EXISTS idx_pagos_empresa_fecha
  ON public.pagos (empresa_id, fecha_pago DESC)
  WHERE anulado = false;

CREATE INDEX IF NOT EXISTS idx_prestamos_empresa_estado
  ON public.prestamos (empresa_id, estado);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_caja_fecha
  ON public.movimientos_caja (caja_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_empresa
  ON public.movimientos_caja (empresa_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_empresa_fecha
  ON public.whatsapp_log (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clientes_cobrador
  ON public.clientes (empresa_id, cobrador_id);

ANALYZE public.amortizacion;
ANALYZE public.pagos;
ANALYZE public.prestamos;
ANALYZE public.movimientos_caja;
ANALYZE public.whatsapp_log;
ANALYZE public.clientes;
