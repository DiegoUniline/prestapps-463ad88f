-- Mock del esquema de producción (Supabase) para las pruebas SQL de supabase/tests.
-- Solo lo necesario para aplicar las migraciones 20261012*/20261013* y probarlas:
-- roles y privilegios por defecto de Supabase, esquema auth, enums, tablas (columnas de
-- src/integrations/supabase/types.ts), RLS al estilo prod y RPCs de prod cuyo cuerpo no
-- está en el repo (simulados). NO es el esquema real: no lo apliques en ningún entorno.

SET client_min_messages = warning;

-- ── Roles de Supabase ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;

GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;

-- Privilegios por defecto de Supabase: todo objeto nuevo en public es accesible a la API.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- ── auth ─────────────────────────────────────────────────────────
CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Mismas definiciones que Supabase (GoTrue/PostgREST fijan request.jwt.claim(s)).
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

-- ── Enums (types.ts → Enums) ─────────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'cobrador');
CREATE TYPE public.cliente_estado AS ENUM ('Activo', 'Inactivo', 'Bloqueado', 'En mora');
CREATE TYPE public.cuota_status AS ENUM ('Pendiente', 'Pagada', 'Parcial', 'Vencida', 'Prometida');
CREATE TYPE public.documento_tipo AS ENUM ('DUI', 'Pasaporte', 'NIT', 'Otro', 'INE');
CREATE TYPE public.estado_civil AS ENUM ('Soltero', 'Casado', 'Unión libre', 'Divorciado', 'Viudo');
CREATE TYPE public.frecuencia_pago AS ENUM ('diario', 'semanal', 'quincenal', 'mensual');
CREATE TYPE public.metodo_pago AS ENUM ('Efectivo', 'Transferencia', 'Otro');
CREATE TYPE public.movimiento_tipo AS ENUM ('entrada', 'salida');
CREATE TYPE public.prestamo_estado AS ENUM ('Activo', 'Al día', 'Vencido', 'Liquidado', 'Cancelado', 'Juridico', 'Reestructurado');
CREATE TYPE public.prestamo_modalidad AS ENUM ('fijo', 'insolutos');
CREATE TYPE public.sexo_tipo AS ENUM ('Masculino', 'Femenino', 'Otro');
CREATE TYPE public.situacion_laboral AS ENUM ('Empleado', 'Independiente', 'Desempleado', 'Pensionado', 'Otro');
CREATE TYPE public.tipo_cuenta AS ENUM ('prestamo', 'venta_seguro', 'venta_producto', 'venta_servicio');
CREATE TYPE public.tipo_mora AS ENUM ('porcentaje', 'fijo');

-- ── Tablas (types.ts → Tables.*.Row; NOT NULL según Insert) ──────
CREATE TABLE public.amortizacion (
  avisado boolean DEFAULT false,
  capital numeric,
  capital_interes numeric,
  capital_pagado numeric DEFAULT 0,
  descuento_mora numeric DEFAULT 0,
  dias_atraso integer DEFAULT 0,
  empresa text,
  empresa_id uuid,
  fecha_calculo date,
  fecha_pagada date,
  fecha_vencimiento date NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interes numeric,
  interes_pagado numeric DEFAULT 0,
  mora numeric DEFAULT 0,
  mora_pagada numeric DEFAULT 0,
  num_cuota integer NOT NULL,
  prestamo_id uuid NOT NULL,
  saldo_capital numeric,
  saldo_interes numeric,
  saldo_mora numeric DEFAULT 0,
  saldo_total numeric,
  status text DEFAULT 'Pendiente'
);
CREATE TABLE public.buro_consultas (
  autorizacion_fecha text NOT NULL,
  autorizacion_path text,
  cliente_id uuid NOT NULL,
  consultado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  empresa_id uuid NOT NULL,
  error text,
  estatus text NOT NULL DEFAULT '',
  folio_consulta text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intentos integer NOT NULL DEFAULT 0,
  precio numeric,
  proveedor text NOT NULL DEFAULT '',
  razon_social text,
  respuesta jsonb,
  resumen jsonb,
  rfc text NOT NULL,
  score integer,
  tipo_persona text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.buro_creditos_mov (
  cantidad integer NOT NULL,
  consulta_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  empresa_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota text,
  saldo numeric NOT NULL,
  tipo text NOT NULL
);
CREATE TABLE public.buro_empresa_config (
  creditos integer NOT NULL DEFAULT 0,
  empresa_id uuid NOT NULL,
  habilitado boolean NOT NULL DEFAULT false,
  precio_consulta numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cajas (
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  descripcion text,
  empresa_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  saldo_actual numeric DEFAULT 0
);
CREATE TABLE public.cat_cuotas (
  activo boolean NOT NULL DEFAULT true,
  comision_cobrador numeric NOT NULL DEFAULT 0,
  comision_colocador numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  empresa_id uuid,
  frecuencia frecuencia_pago NOT NULL DEFAULT 'semanal',
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modalidad prestamo_modalidad NOT NULL DEFAULT 'fijo',
  nombre text NOT NULL,
  num_cuotas integer NOT NULL DEFAULT 0,
  tasa_interes numeric NOT NULL DEFAULT 0,
  tipo_mora tipo_mora NOT NULL DEFAULT 'porcentaje',
  valor_mora numeric NOT NULL DEFAULT 0
);
CREATE TABLE public.cat_estados_civiles (
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  descripcion text,
  empresa_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL
);
CREATE TABLE public.cat_estados_prestamo (
  activo boolean NOT NULL DEFAULT true,
  color text,
  created_at timestamptz DEFAULT now(),
  descripcion text,
  empresa_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL
);
CREATE TABLE public.cat_frecuencias_pago (
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  descripcion text,
  empresa_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL
);
CREATE TABLE public.cat_metodos_pago (
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  descripcion text,
  empresa_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  requiere_validacion boolean NOT NULL DEFAULT false
);
CREATE TABLE public.cat_situaciones_laborales (
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  descripcion text,
  empresa_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL
);
CREATE TABLE public.cat_tipos_documento (
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  descripcion text,
  empresa_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL
);
CREATE TABLE public.circulo_config (
  activo boolean NOT NULL DEFAULT true,
  api_key text,
  api_url text,
  cdc_public_key text,
  certificado text,
  id integer PRIMARY KEY DEFAULT 1,
  password text,
  private_key text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  usuario text
);
CREATE TABLE public.clientes (
  activo boolean DEFAULT true,
  aval_direccion text,
  aval_dni text,
  aval_nombre text,
  aval_parentesco text,
  aval_telefono text,
  correo text,
  created_at timestamptz DEFAULT now(),
  dependientes numeric,
  direccion text,
  direccion_trabajo text,
  dni text,
  dom_calle text,
  dom_ciudad text,
  dom_colonia text,
  dom_cp text,
  dom_estado text,
  dom_municipio text,
  dom_numero text,
  empresa_id uuid,
  estado cliente_estado DEFAULT 'Activo',
  estado_civil estado_civil,
  fecha_nacimiento date,
  foto_cliente text,
  gastos_mensuales numeric,
  gps_lat numeric,
  gps_lng numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cliente text NOT NULL DEFAULT '',
  ingresos numeric,
  lada_pais text,
  nombre_completo text NOT NULL,
  notas text,
  razon_social text,
  ref1_nombre text,
  ref1_parentesco text,
  ref1_telefono text,
  ref2_nombre text,
  ref2_parentesco text,
  ref2_telefono text,
  rfc text,
  sexo sexo_tipo,
  telefono text,
  tipo_persona text NOT NULL DEFAULT 'fisica',
  tipo_vivienda text,
  trabajo_antiguedad text,
  trabajo_cargo text,
  trabajo_empresa text,
  trabajo_telefono text
);
CREATE TABLE public.cobradores (
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  efectivo_en_mano numeric NOT NULL DEFAULT 0,
  empresa_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  porcentaje_comision numeric NOT NULL DEFAULT 0,
  telefono text,
  user_id uuid
);
CREATE TABLE public.cortes (
  caja_id uuid NOT NULL,
  cobrador_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  empresa_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monto_comision numeric NOT NULL DEFAULT 0,
  monto_depositado numeric NOT NULL DEFAULT 0,
  monto_efectivo numeric NOT NULL DEFAULT 0,
  periodo_desde timestamptz,
  periodo_hasta timestamptz,
  porcentaje_usado numeric NOT NULL DEFAULT 0,
  total_cobrado numeric NOT NULL DEFAULT 0
);
CREATE TABLE public.crm_gestiones (
  cliente_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  empresa_id uuid,
  fecha_seguimiento date,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notas text,
  prestamo_id uuid NOT NULL,
  registrado_por uuid,
  resultado text NOT NULL,
  tipo_gestion text NOT NULL
);
CREATE TABLE public.empresa_config (
  contrato_campos jsonb,
  contrato_plantilla text,
  created_at timestamptz DEFAULT now(),
  empresa_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_campos jsonb,
  ticket_encabezado text,
  ticket_mostrar_logo boolean,
  ticket_pie text,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.empresas (
  activa boolean NOT NULL DEFAULT true,
  corte_color_cobrado text NOT NULL DEFAULT '#22c55e',
  corte_dia_semana integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  dias_gracia integer NOT NULL DEFAULT 0,
  dias_por_vencer integer NOT NULL DEFAULT 3,
  direccion text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lada_pais text NOT NULL DEFAULT '52',
  logo_url text,
  max_usuarios integer NOT NULL DEFAULT 5,
  moneda_codigo text NOT NULL DEFAULT 'MXN',
  moneda_simbolo text NOT NULL DEFAULT '$',
  nombre text NOT NULL,
  plan text NOT NULL DEFAULT 'basico',
  ruc text,
  telefono text
);
CREATE TABLE public.facturas (
  creado_en timestamptz,
  descuento_porcentaje numeric,
  empresa_id uuid,
  es_prorrateo boolean,
  estado text,
  fecha_emision date,
  fecha_pago date,
  fecha_vencimiento date,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  num_usuarios numeric NOT NULL,
  numero_factura text,
  periodo_fin text NOT NULL,
  periodo_inicio text NOT NULL,
  precio_unitario numeric NOT NULL,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  subtotal numeric NOT NULL,
  suscripcion_id uuid,
  total numeric NOT NULL
);
CREATE TABLE public.folios (
  empresa_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefijo text NOT NULL DEFAULT '',
  tipo text NOT NULL,
  ultimo_folio numeric NOT NULL DEFAULT 0
);
CREATE TABLE public.intentos_cobro (
  creado_en timestamptz,
  error_mensaje text,
  estado text,
  factura_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monto numeric NOT NULL,
  stripe_charge_id text
);
CREATE TABLE public.movimientos_caja (
  caja_id uuid NOT NULL,
  concepto text,
  created_at timestamptz DEFAULT now(),
  empresa_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monto numeric NOT NULL,
  prestamo_id uuid,
  registrado_por uuid,
  tipo movimiento_tipo NOT NULL
);
CREATE TABLE public.notificaciones (
  created_at timestamptz NOT NULL DEFAULT now(),
  empresa_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leida boolean NOT NULL DEFAULT false,
  link text,
  mensaje text,
  read_at timestamptz,
  tipo text NOT NULL DEFAULT '',
  titulo text NOT NULL,
  user_id uuid NOT NULL
);
CREATE TABLE public.otp_registro (
  code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intentos integer NOT NULL DEFAULT 0,
  telefono text NOT NULL,
  usado boolean NOT NULL DEFAULT false
);
CREATE TABLE public.pagos (
  anulado boolean NOT NULL DEFAULT false,
  anulado_en timestamptz,
  anulado_por uuid,
  aplicado_capital numeric,
  aplicado_interes numeric,
  aplicado_mora numeric,
  caja_id uuid,
  cobrador_id uuid,
  corte_id uuid,
  created_at timestamptz DEFAULT now(),
  cuota_id uuid,
  empresa_id uuid,
  fecha_pago date DEFAULT current_date,
  gps_lat numeric,
  gps_lng numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metodo_pago text DEFAULT 'Efectivo',
  monto_recibido numeric NOT NULL,
  motivo_anulacion text,
  prestamo_id uuid NOT NULL,
  registrado_por uuid,
  ruta_id uuid
);
CREATE TABLE public.planes (
  activo boolean,
  creado_en timestamptz,
  descripcion text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  precio_base_mes numeric NOT NULL,
  precio_usuario_extra numeric NOT NULL DEFAULT 0,
  stripe_price_id text,
  stripe_product_id text,
  usuarios_incluidos numeric NOT NULL DEFAULT 0
);
CREATE TABLE public.prestamos (
  caja_id uuid,
  cancelado_en timestamptz,
  cancelado_por uuid,
  cliente_id uuid NOT NULL,
  cobrador_id uuid,
  cobro_automatico_stripe boolean NOT NULL DEFAULT false,
  codigo_interno text,
  created_at timestamptz DEFAULT now(),
  cuota_calculada numeric,
  cuota_redondeada numeric,
  empresa text,
  empresa_id uuid,
  estado prestamo_estado DEFAULT 'Activo',
  fecha_primer_pago date,
  fecha_registro date DEFAULT current_date,
  frecuencia frecuencia_pago NOT NULL DEFAULT 'semanal',
  gastos_legales numeric DEFAULT 0,
  generado_por uuid,
  gps_lat numeric,
  gps_lng numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_prestamo text NOT NULL,
  modalidad prestamo_modalidad NOT NULL,
  monto_solicitado numeric NOT NULL,
  monto_total_pagar numeric,
  motivo_cancelacion text,
  notas text,
  num_cuotas integer NOT NULL,
  reestructurado_de uuid,
  ruta_id uuid,
  tasa_interes numeric,
  tipo_cuenta text NOT NULL DEFAULT 'prestamo',
  tipo_mora tipo_mora DEFAULT 'porcentaje',
  valor_mora numeric DEFAULT 0
);
CREATE TABLE public.profiles (
  activo boolean NOT NULL DEFAULT true,
  bono_meta_monto numeric,
  bono_meta_objetivo numeric,
  caja_id uuid,
  comision_cobros_equipo numeric,
  comision_prestamos numeric,
  comision_tipo text,
  created_at timestamptz DEFAULT now(),
  direccion text,
  efectivo_en_mano numeric NOT NULL DEFAULT 0,
  empresa_id uuid,
  foto_url text,
  id uuid PRIMARY KEY,
  nombre_completo text NOT NULL DEFAULT '',
  porcentaje_comision numeric NOT NULL DEFAULT 0,
  telefono text
);
CREATE TABLE public.promesas_pago (
  created_at timestamptz DEFAULT now(),
  cuota_id uuid,
  empresa_id uuid,
  fecha_prometida date NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monto_prometido numeric NOT NULL,
  notas text,
  prestamo_id uuid NOT NULL,
  status text DEFAULT 'Pendiente'
);
CREATE TABLE public.role_permissions (
  action text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  empresa_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  role app_role NOT NULL
);
CREATE TABLE public.rutas (
  cobrador_id uuid,
  created_at timestamptz DEFAULT now(),
  descripcion text,
  empresa_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL
);
CREATE TABLE public.solicitudes_prestamo (
  aprobado_por uuid,
  caja_id uuid,
  cliente_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  empresa_id uuid,
  fecha_primer_pago date,
  frecuencia frecuencia_pago,
  gastos_legales numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modalidad prestamo_modalidad NOT NULL,
  monto_solicitado numeric NOT NULL,
  motivo_rechazo text,
  notas text,
  num_cuotas integer NOT NULL,
  prestamo_generado_id uuid,
  rechazado_por uuid,
  resuelto_en timestamptz,
  ruta_id uuid,
  solicitado_por uuid,
  status text NOT NULL DEFAULT 'Pendiente',
  tasa_interes numeric,
  tipo_mora tipo_mora,
  valor_mora numeric
);
CREATE TABLE public.stripe_charges_log (
  cliente_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  cuota_id uuid,
  empresa_id uuid NOT NULL,
  error_mensaje text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moneda text NOT NULL DEFAULT '',
  monto numeric NOT NULL,
  prestamo_id uuid NOT NULL,
  status text NOT NULL DEFAULT '',
  stripe_payment_intent_id text
);
CREATE TABLE public.stripe_connect_accounts (
  charges_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  empresa_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_complete boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  stripe_account_id text NOT NULL,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.stripe_payment_methods (
  activo boolean NOT NULL DEFAULT true,
  brand text,
  cliente_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  empresa_id uuid NOT NULL,
  exp_month numeric,
  exp_year numeric,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last4 text,
  stripe_customer_id text NOT NULL,
  stripe_payment_method_id text
);
CREATE TABLE public.supervisor_rutas (
  created_at timestamptz DEFAULT now(),
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruta_id uuid NOT NULL,
  supervisor_id uuid NOT NULL
);
CREATE TABLE public.suscripciones (
  actualizado_en timestamptz,
  card_brand text,
  card_last4 text,
  creado_en timestamptz,
  descuento_porcentaje numeric,
  empresa_id uuid NOT NULL,
  es_manual boolean,
  estado text,
  fecha_inicio date NOT NULL DEFAULT current_date,
  fecha_proximo_cobro date NOT NULL DEFAULT current_date,
  fecha_vencimiento date,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notas_admin text,
  num_usuarios numeric NOT NULL DEFAULT 0,
  periodicidad text,
  plan_id uuid,
  precio_base numeric NOT NULL,
  precio_usuario_extra numeric NOT NULL DEFAULT 0,
  stripe_customer_id text,
  stripe_payment_method_id text,
  stripe_subscription_id text
);
CREATE TABLE public.system_notification_templates (
  created_at timestamptz DEFAULT now(),
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_template text NOT NULL,
  template_key text NOT NULL,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  user_id uuid NOT NULL
);
CREATE TABLE public.whatsapp_config (
  activo boolean NOT NULL DEFAULT true,
  api_token text NOT NULL DEFAULT '',
  api_url text NOT NULL DEFAULT '',
  aviso_dia_antes boolean NOT NULL DEFAULT false,
  aviso_vencido boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  empresa_id uuid NOT NULL,
  enviar_recibo_pago boolean NOT NULL DEFAULT false,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE public.whatsapp_log (
  created_at timestamptz DEFAULT now(),
  empresa_id uuid,
  error_detalle text,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imagen_url text,
  mensaje text,
  referencia_id uuid,
  status text NOT NULL DEFAULT 'enviado',
  telefono text NOT NULL,
  tipo text NOT NULL
);
CREATE TABLE public.whatsapp_templates (
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  empresa_id uuid NOT NULL,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje text NOT NULL DEFAULT '',
  nombre text NOT NULL DEFAULT '',
  tipo text NOT NULL
);


-- ── Llaves foráneas / únicos principales ─────────────────────────
ALTER TABLE public.profiles ADD FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD FOREIGN KEY (empresa_id) REFERENCES public.empresas (id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
ALTER TABLE public.clientes ADD FOREIGN KEY (empresa_id) REFERENCES public.empresas (id);
ALTER TABLE public.cajas ADD FOREIGN KEY (empresa_id) REFERENCES public.empresas (id);
ALTER TABLE public.rutas ADD FOREIGN KEY (empresa_id) REFERENCES public.empresas (id);
ALTER TABLE public.prestamos ADD FOREIGN KEY (cliente_id) REFERENCES public.clientes (id);
ALTER TABLE public.prestamos ADD FOREIGN KEY (caja_id) REFERENCES public.cajas (id);
ALTER TABLE public.prestamos ADD FOREIGN KEY (ruta_id) REFERENCES public.rutas (id);
ALTER TABLE public.prestamos ADD FOREIGN KEY (reestructurado_de) REFERENCES public.prestamos (id);
ALTER TABLE public.amortizacion ADD FOREIGN KEY (prestamo_id) REFERENCES public.prestamos (id) ON DELETE CASCADE;
ALTER TABLE public.cortes ADD FOREIGN KEY (caja_id) REFERENCES public.cajas (id);
ALTER TABLE public.pagos ADD FOREIGN KEY (prestamo_id) REFERENCES public.prestamos (id) ON DELETE CASCADE;
ALTER TABLE public.pagos ADD FOREIGN KEY (caja_id) REFERENCES public.cajas (id);
ALTER TABLE public.pagos ADD FOREIGN KEY (corte_id) REFERENCES public.cortes (id);
ALTER TABLE public.movimientos_caja ADD FOREIGN KEY (caja_id) REFERENCES public.cajas (id);
ALTER TABLE public.movimientos_caja ADD FOREIGN KEY (prestamo_id) REFERENCES public.prestamos (id) ON DELETE SET NULL;
ALTER TABLE public.promesas_pago ADD FOREIGN KEY (prestamo_id) REFERENCES public.prestamos (id) ON DELETE CASCADE;
ALTER TABLE public.crm_gestiones ADD FOREIGN KEY (prestamo_id) REFERENCES public.prestamos (id) ON DELETE CASCADE;
ALTER TABLE public.supervisor_rutas ADD FOREIGN KEY (ruta_id) REFERENCES public.rutas (id) ON DELETE CASCADE;
ALTER TABLE public.folios ADD CONSTRAINT folios_empresa_tipo_key UNIQUE (empresa_id, tipo);

-- ── Triggers de prod (simulados) ─────────────────────────────────
-- Folio PRE-XXXX del préstamo.
CREATE SEQUENCE public.prestamos_folio_seq;
CREATE FUNCTION public.trg_prestamos_folio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id_prestamo IS NULL OR NEW.id_prestamo = '' THEN
    NEW.id_prestamo := 'PRE-' || lpad(nextval('public.prestamos_folio_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER prestamos_folio BEFORE INSERT ON public.prestamos
  FOR EACH ROW EXECUTE FUNCTION public.trg_prestamos_folio();

-- cajas.saldo_actual lo mantiene la BD desde movimientos_caja (el cliente nunca lo escribe).
CREATE FUNCTION public.trg_movimientos_caja_saldo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.cajas
       SET saldo_actual = coalesce(saldo_actual, 0) - CASE WHEN OLD.tipo = 'entrada' THEN OLD.monto ELSE -OLD.monto END
     WHERE id = OLD.caja_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE public.cajas
       SET saldo_actual = coalesce(saldo_actual, 0) + CASE WHEN NEW.tipo = 'entrada' THEN NEW.monto ELSE -NEW.monto END
     WHERE id = NEW.caja_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER movimientos_caja_saldo AFTER INSERT OR UPDATE OR DELETE ON public.movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION public.trg_movimientos_caja_saldo();

-- ── Helpers de prod usados por RLS ───────────────────────────────
CREATE FUNCTION public.get_user_empresa_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT empresa_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Versión previa a 20261013100000 (sin empresa); la migración la reemplaza.
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ── RPCs de prod (cuerpo real no está en el repo; simulación mínima) ──
-- Registro interno de llamadas a rebuild_amortizacion (solo para las pruebas).
CREATE TABLE public._mock_rebuild_log (prestamo_id uuid, llamado_en timestamptz DEFAULT clock_timestamp());

-- Sin SET search_path a propósito: 20261012140000 debe fijarlo.
CREATE FUNCTION public.registrar_pago(
  p_prestamo_id uuid, p_empresa_id uuid, p_caja_id uuid, p_cobrador_id uuid, p_ruta_id uuid,
  p_registrado_por uuid, p_monto numeric, p_metodo text, p_fecha_pago date,
  p_gps_lat numeric DEFAULT NULL, p_gps_lng numeric DEFAULT NULL, p_distribution jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  e jsonb;
  v_id uuid;
  v_cuota uuid;
  v_cap numeric := 0;
  v_int numeric := 0;
  v_mora numeric := 0;
  c numeric;
  i numeric;
  m numeric;
BEGIN
  IF coalesce(p_monto, 0) <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(coalesce(p_distribution, '[]'::jsonb)) LOOP
    c := coalesce((e->>'capital')::numeric, 0);
    i := coalesce((e->>'interes')::numeric, 0);
    m := coalesce((e->>'mora')::numeric, 0);
    v_cap := v_cap + c; v_int := v_int + i; v_mora := v_mora + m;
    v_cuota := coalesce(v_cuota, (e->>'cuotaId')::uuid);
    UPDATE public.amortizacion SET
      saldo_capital = greatest(0, coalesce(saldo_capital, 0) - c),
      saldo_interes = greatest(0, coalesce(saldo_interes, 0) - i),
      saldo_mora = greatest(0, coalesce(saldo_mora, 0) - m - coalesce(descuento_mora, 0)),
      saldo_total = greatest(0, coalesce(saldo_total, 0) - c - i - m - coalesce(descuento_mora, 0)),
      capital_pagado = coalesce(capital_pagado, 0) + c,
      interes_pagado = coalesce(interes_pagado, 0) + i,
      mora_pagada = coalesce(mora_pagada, 0) + m
    WHERE id = (e->>'cuotaId')::uuid AND prestamo_id = p_prestamo_id;
    UPDATE public.amortizacion SET
      status = CASE WHEN coalesce(saldo_total, 0) <= 0.005 THEN 'Pagada' ELSE 'Parcial' END,
      fecha_pagada = CASE WHEN coalesce(saldo_total, 0) <= 0.005 THEN p_fecha_pago ELSE fecha_pagada END
    WHERE id = (e->>'cuotaId')::uuid AND prestamo_id = p_prestamo_id;
  END LOOP;

  INSERT INTO public.pagos (prestamo_id, empresa_id, caja_id, cobrador_id, ruta_id, registrado_por, cuota_id,
                            monto_recibido, metodo_pago, fecha_pago, aplicado_capital, aplicado_interes, aplicado_mora,
                            gps_lat, gps_lng)
  VALUES (p_prestamo_id, p_empresa_id, p_caja_id, p_cobrador_id, p_ruta_id, p_registrado_por, v_cuota,
          p_monto, p_metodo, p_fecha_pago, v_cap, v_int, v_mora, p_gps_lat, p_gps_lng)
  RETURNING id INTO v_id;

  IF p_caja_id IS NOT NULL THEN
    INSERT INTO public.movimientos_caja (caja_id, tipo, monto, concepto, prestamo_id, empresa_id, registrado_por)
    VALUES (p_caja_id, 'entrada', p_monto, 'Pago préstamo', p_prestamo_id, p_empresa_id, p_registrado_por);
  END IF;
  IF coalesce(p_metodo, 'Efectivo') = 'Efectivo' AND p_cobrador_id IS NOT NULL THEN
    UPDATE public.profiles SET efectivo_en_mano = efectivo_en_mano + p_monto WHERE id = p_cobrador_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.amortizacion WHERE prestamo_id = p_prestamo_id AND status IS DISTINCT FROM 'Pagada') THEN
    UPDATE public.prestamos SET estado = 'Liquidado' WHERE id = p_prestamo_id;
  END IF;
  RETURN jsonb_build_object('pago_id', v_id);
END $function$;

CREATE FUNCTION public.revertir_pago(p_pago_id uuid, p_motivo text, p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  pg public.pagos;
BEGIN
  UPDATE public.pagos
     SET anulado = true, anulado_en = now(), anulado_por = coalesce(p_user_id, auth.uid()), motivo_anulacion = p_motivo
   WHERE id = p_pago_id AND NOT anulado
  RETURNING * INTO pg;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado o ya anulado';
  END IF;
  IF pg.caja_id IS NOT NULL THEN
    INSERT INTO public.movimientos_caja (caja_id, tipo, monto, concepto, prestamo_id, empresa_id)
    VALUES (pg.caja_id, 'salida', pg.monto_recibido, 'Anulación pago', pg.prestamo_id, pg.empresa_id);
  END IF;
  PERFORM public.rebuild_amortizacion(pg.prestamo_id);
END $function$;

CREATE FUNCTION public.rebuild_amortizacion(p_prestamo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  INSERT INTO public._mock_rebuild_log (prestamo_id) VALUES (p_prestamo_id);
END $function$;

CREATE FUNCTION public.recalcular_mora(p_prestamo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  UPDATE public.amortizacion SET fecha_calculo = current_date WHERE prestamo_id = p_prestamo_id;
END $function$;

CREATE FUNCTION public.recalcular_mora_empresa(p_empresa_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  UPDATE public.amortizacion SET fecha_calculo = current_date WHERE empresa_id = p_empresa_id;
END $function$;

CREATE FUNCTION public.actualizar_estados_prestamos(p_empresa_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  RETURN 0;
END $function$;

CREATE FUNCTION public.switch_empresa(p_empresa_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  UPDATE public.profiles SET empresa_id = p_empresa_id WHERE id = auth.uid();
END $function$;

CREATE FUNCTION public.next_folio(p_empresa_id uuid, p_tipo text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v numeric;
  v_pre text;
BEGIN
  INSERT INTO public.folios (empresa_id, tipo, prefijo, ultimo_folio)
  VALUES (p_empresa_id, p_tipo, upper(left(p_tipo, 3)) || '-', 1)
  ON CONFLICT (empresa_id, tipo) DO UPDATE SET ultimo_folio = public.folios.ultimo_folio + 1
  RETURNING ultimo_folio, prefijo INTO v, v_pre;
  RETURN v_pre || lpad(v::text, 4, '0');
END $function$;

CREATE FUNCTION public.notif_emit_admins(p_empresa_id uuid, p_tipo text, p_titulo text, p_mensaje text, p_link text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  INSERT INTO public.notificaciones (empresa_id, user_id, tipo, titulo, mensaje, link)
  SELECT p_empresa_id, p.id, p_tipo, p_titulo, p_mensaje, p_link
    FROM public.profiles p
   WHERE p.empresa_id = p_empresa_id
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin');
END $function$;

CREATE FUNCTION public.notif_cleanup()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  DELETE FROM public.notificaciones WHERE leida AND created_at < now() - interval '30 days';
END $function$;

CREATE FUNCTION public.get_cobrador_by_user(p_user_id uuid)
RETURNS TABLE (id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $function$
  SELECT c.id FROM public.cobradores c WHERE c.user_id = p_user_id
$function$;

CREATE FUNCTION public.buro_mover_creditos(p_empresa_id uuid, p_cantidad integer, p_tipo text, p_consulta_id uuid DEFAULT NULL,
                                           p_nota text DEFAULT NULL, p_user uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  RETURN 0;
END $function$;

CREATE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $function$
BEGIN
  RETURN event;
END $function$;

-- ── RLS al estilo prod (forma previa a 20261012120000: sin envolver en SELECT) ──
DO $rls$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes', 'prestamos', 'amortizacion', 'pagos', 'movimientos_caja', 'cajas', 'rutas', 'cortes',
    'promesas_pago', 'crm_gestiones', 'solicitudes_prestamo', 'cobradores', 'cat_cuotas', 'whatsapp_log',
    'whatsapp_config', 'whatsapp_templates', 'role_permissions', 'empresa_config', 'buro_consultas'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT TO authenticated USING (empresa_id = get_user_empresa_id())', t, t);
    IF t NOT IN ('cajas', 'cat_cuotas') THEN
      EXECUTE format('CREATE POLICY "%s_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (empresa_id = get_user_empresa_id())', t, t);
      EXECUTE format('CREATE POLICY "%s_update" ON public.%I FOR UPDATE TO authenticated USING (empresa_id = get_user_empresa_id()) WITH CHECK (empresa_id = get_user_empresa_id())', t, t);
      EXECUTE format('CREATE POLICY "%s_delete" ON public.%I FOR DELETE TO authenticated USING (empresa_id = get_user_empresa_id() AND has_role(auth.uid(), ''admin''::app_role))', t, t);
    END IF;
  END LOOP;
END $rls$;

-- Políticas viejas que 20261012140000 reemplaza.
CREATE POLICY auth_insert_cajas ON public.cajas FOR INSERT TO authenticated WITH CHECK (empresa_id = get_user_empresa_id());
CREATE POLICY auth_update_cajas ON public.cajas FOR UPDATE TO authenticated USING (empresa_id = get_user_empresa_id());
CREATE POLICY auth_delete_cajas ON public.cajas FOR DELETE TO authenticated USING (true);
CREATE POLICY auth_insert_cat_cuotas ON public.cat_cuotas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_cat_cuotas ON public.cat_cuotas FOR UPDATE TO authenticated USING (true);
CREATE POLICY auth_delete_cat_cuotas ON public.cat_cuotas FOR DELETE TO authenticated USING (true);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY empresas_select ON public.empresas FOR SELECT TO authenticated
  USING (id = get_user_empresa_id() OR coalesce(auth.jwt() ->> 'email', '') = 'diego.leon@uniline.mx');

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR empresa_id = get_user_empresa_id());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR (empresa_id = get_user_empresa_id() AND has_role(auth.uid(), 'admin'::app_role)));

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IN (SELECT p.id FROM public.profiles p WHERE p.empresa_id = get_user_empresa_id()));

ALTER TABLE public.supervisor_rutas ENABLE ROW LEVEL SECURITY;
CREATE POLICY supervisor_rutas_select ON public.supervisor_rutas FOR SELECT TO authenticated
  USING (ruta_id IN (SELECT r.id FROM public.rutas r WHERE r.empresa_id = get_user_empresa_id()));

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY notificaciones_select ON public.notificaciones FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY users_insert_same_empresa ON public.notificaciones FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_registro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

-- Supabase concede todo a los roles de la API (la RLS y los REVOKE de las migraciones limitan).
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
