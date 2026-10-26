-- Buró: consultas de Persona Física (Círculo RCC con FICO Score) y bitácora que sobrevive al borrado del cliente

-- 1) Nombre estructurado y CURP para Persona Física
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS apellido_paterno text,
  ADD COLUMN IF NOT EXISTS apellido_materno text,
  ADD COLUMN IF NOT EXISTS nombres text,
  ADD COLUMN IF NOT EXISTS curp text;

-- 2) URL del API RCC Persona Física (la de api_url sigue siendo la de PM)
ALTER TABLE public.circulo_config ADD COLUMN IF NOT EXISTS api_url_pf text;

-- 3) Bitácora: la consulta y su autorización se conservan aunque se borre el cliente
ALTER TABLE public.buro_consultas ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE public.buro_consultas DROP CONSTRAINT IF EXISTS buro_consultas_cliente_id_fkey;
ALTER TABLE public.buro_consultas
  ADD CONSTRAINT buro_consultas_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;

-- razon_social guarda el nombre consultado: razón social (PM) o nombre completo (PF)
DO $$ BEGIN
  ALTER TABLE public.buro_consultas
    ADD CONSTRAINT buro_consultas_tipo_persona_chk CHECK (tipo_persona IN ('fisica','moral'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
