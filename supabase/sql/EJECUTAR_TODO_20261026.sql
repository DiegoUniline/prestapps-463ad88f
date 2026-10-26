-- EJECUTAR TODO Buró (2026-10-26): consultas PM (si faltaban) + Persona Física + bitácora que sobrevive al borrado del cliente. Idempotente.

-- ===== 20261009120000_buro_credito_pm.sql =====
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

-- ===== 20261009130000_buro_circulo_credito.sql =====
-- Proveedor: Círculo de Crédito (APIHub) — RCC Persona Moral
ALTER TABLE public.buro_credenciales
  ADD COLUMN IF NOT EXISTS private_key text,      -- PKCS8 PEM (EC secp384r1)
  ADD COLUMN IF NOT EXISTS cdc_public_key text;   -- SPKI PEM del certificado de Círculo

ALTER TABLE public.buro_consultas
  ADD COLUMN IF NOT EXISTS proveedor text NOT NULL DEFAULT 'circulo';

-- ===== 20261009140000_buro_reventa_creditos.sql =====
-- Reventa de consultas Círculo de Crédito: credenciales globales del dueño + créditos por empresa

DROP TABLE IF EXISTS public.buro_credenciales;

-- 1) Configuración global (fila única, solo service_role)
CREATE TABLE IF NOT EXISTS public.circulo_config (
  id             integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  api_url        text,
  api_key        text,
  usuario        text,
  password       text,
  private_key    text,   -- PKCS8 PEM generado por el sistema
  certificado    text,   -- X.509 PEM para subir al portal de Círculo
  cdc_public_key text,   -- SPKI PEM extraído del certificado de Círculo
  activo         boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.circulo_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.circulo_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.circulo_config FROM anon, authenticated;

-- 2) Habilitación, precio y saldo de créditos por empresa
CREATE TABLE IF NOT EXISTS public.buro_empresa_config (
  empresa_id      uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  habilitado      boolean NOT NULL DEFAULT false,
  creditos        integer NOT NULL DEFAULT 0 CHECK (creditos >= 0),
  precio_consulta numeric(10,2) NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.buro_empresa_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS buro_empresa_config_select ON public.buro_empresa_config;
CREATE POLICY buro_empresa_config_select ON public.buro_empresa_config
  FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id());

-- 3) Movimientos de créditos
CREATE TABLE IF NOT EXISTS public.buro_creditos_mov (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('asignacion','consumo','reembolso','ajuste')),
  cantidad    integer NOT NULL,
  saldo       integer NOT NULL,
  consulta_id uuid REFERENCES public.buro_consultas(id) ON DELETE SET NULL,
  nota        text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_buro_creditos_mov_empresa ON public.buro_creditos_mov (empresa_id, created_at DESC);
ALTER TABLE public.buro_creditos_mov ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS buro_creditos_mov_select ON public.buro_creditos_mov;
CREATE POLICY buro_creditos_mov_select ON public.buro_creditos_mov
  FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id() AND public.has_role(auth.uid(), 'admin'));

-- 4) Precio cobrado en cada consulta
ALTER TABLE public.buro_consultas ADD COLUMN IF NOT EXISTS precio numeric(10,2);

-- 5) Movimiento atómico de créditos (devuelve saldo nuevo o NULL si no alcanza)
CREATE OR REPLACE FUNCTION public.buro_mover_creditos(
  p_empresa_id uuid, p_cantidad integer, p_tipo text,
  p_consulta_id uuid DEFAULT NULL, p_nota text DEFAULT NULL, p_user uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo integer;
BEGIN
  INSERT INTO buro_empresa_config (empresa_id) VALUES (p_empresa_id) ON CONFLICT (empresa_id) DO NOTHING;

  UPDATE buro_empresa_config
     SET creditos = creditos + p_cantidad, updated_at = now()
   WHERE empresa_id = p_empresa_id AND creditos + p_cantidad >= 0
  RETURNING creditos INTO v_saldo;

  IF v_saldo IS NULL THEN RETURN NULL; END IF;

  INSERT INTO buro_creditos_mov (empresa_id, tipo, cantidad, saldo, consulta_id, nota, created_by)
  VALUES (p_empresa_id, p_tipo, p_cantidad, v_saldo, p_consulta_id, p_nota, p_user);
  RETURN v_saldo;
END $$;

REVOKE ALL ON FUNCTION public.buro_mover_creditos(uuid, integer, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buro_mover_creditos(uuid, integer, text, uuid, text, uuid) TO service_role;

-- ===== 20261026120000_buro_persona_fisica.sql =====
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
