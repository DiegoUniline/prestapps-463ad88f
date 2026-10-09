-- Buró de Crédito: consultas de Personas Morales

-- 1) Datos fiscales / domicilio estructurado en clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tipo_persona text NOT NULL DEFAULT 'fisica',
  ADD COLUMN IF NOT EXISTS rfc text,
  ADD COLUMN IF NOT EXISTS razon_social text,
  ADD COLUMN IF NOT EXISTS dom_calle text,
  ADD COLUMN IF NOT EXISTS dom_numero text,
  ADD COLUMN IF NOT EXISTS dom_colonia text,
  ADD COLUMN IF NOT EXISTS dom_municipio text,
  ADD COLUMN IF NOT EXISTS dom_ciudad text,
  ADD COLUMN IF NOT EXISTS dom_estado text,
  ADD COLUMN IF NOT EXISTS dom_cp text;

DO $$ BEGIN
  ALTER TABLE public.clientes
    ADD CONSTRAINT clientes_tipo_persona_chk CHECK (tipo_persona IN ('fisica','moral'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_clientes_rfc ON public.clientes (empresa_id, rfc);

-- 2) Credenciales por empresa (solo service_role; RLS sin políticas)
CREATE TABLE IF NOT EXISTS public.buro_credenciales (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  api_url    text NOT NULL,
  api_key    text NOT NULL,
  usuario    text NOT NULL,
  password   text NOT NULL,
  activo     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.buro_credenciales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buro_credenciales FROM anon, authenticated;

-- 3) Bitácora de consultas
CREATE TABLE IF NOT EXISTS public.buro_consultas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cliente_id         uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo_persona       text NOT NULL DEFAULT 'moral',
  rfc                text NOT NULL,
  razon_social       text,
  estatus            text NOT NULL DEFAULT 'pendiente'
                     CHECK (estatus IN ('pendiente','exitosa','sin_hit','error')),
  folio_consulta     text,
  score              integer,
  resumen            jsonb,
  respuesta          jsonb,
  error              text,
  intentos           integer NOT NULL DEFAULT 0,
  autorizacion_fecha date NOT NULL,
  autorizacion_path  text,
  consultado_por     uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buro_consultas_cliente ON public.buro_consultas (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_buro_consultas_empresa ON public.buro_consultas (empresa_id, created_at DESC);

ALTER TABLE public.buro_consultas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS buro_consultas_select ON public.buro_consultas;
CREATE POLICY buro_consultas_select ON public.buro_consultas
  FOR SELECT TO authenticated
  USING (
    empresa_id = public.get_user_empresa_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
  );
-- Sin INSERT/UPDATE/DELETE para authenticated: solo la Edge Function (service_role) escribe.

-- 4) Bucket privado para autorizaciones firmadas: <empresa_id>/<cliente_id>/<archivo>
INSERT INTO storage.buckets (id, name, public)
VALUES ('buro-autorizaciones', 'buro-autorizaciones', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS buro_aut_insert ON storage.objects;
CREATE POLICY buro_aut_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'buro-autorizaciones'
    AND (storage.foldername(name))[1] = public.get_user_empresa_id()::text
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
  );

DROP POLICY IF EXISTS buro_aut_select ON storage.objects;
CREATE POLICY buro_aut_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'buro-autorizaciones'
    AND (storage.foldername(name))[1] = public.get_user_empresa_id()::text
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
  );
