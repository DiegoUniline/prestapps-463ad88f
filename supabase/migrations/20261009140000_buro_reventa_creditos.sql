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
