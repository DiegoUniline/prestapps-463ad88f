ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS moneda_simbolo text NOT NULL DEFAULT '$';

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS moneda_codigo text NOT NULL DEFAULT 'USD';
