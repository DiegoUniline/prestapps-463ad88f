-- Índices para acelerar la vista /mi-cobranza del cobrador
CREATE INDEX IF NOT EXISTS idx_amortizacion_empresa_fv ON public.amortizacion(empresa_id, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_amortizacion_empresa_fpagada ON public.amortizacion(empresa_id, fecha_pagada) WHERE fecha_pagada IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_amortizacion_empresa_status ON public.amortizacion(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_pagos_empresa_created ON public.pagos(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_cobrador_created ON public.pagos(cobrador_id, created_at DESC) WHERE cobrador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prestamos_empresa_cobrador ON public.prestamos(empresa_id, cobrador_id) WHERE cobrador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prestamos_cobrador_estado ON public.prestamos(cobrador_id, estado) WHERE cobrador_id IS NOT NULL;
