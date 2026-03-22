ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS dias_por_vencer integer NOT NULL DEFAULT 7;
