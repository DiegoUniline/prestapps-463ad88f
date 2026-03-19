-- Catálogo de planes de cuotas
CREATE TABLE public.cat_cuotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid DEFAULT get_user_empresa_id() REFERENCES empresas(id),
  nombre text NOT NULL,
  num_cuotas integer NOT NULL DEFAULT 1,
  tasa_interes numeric NOT NULL DEFAULT 0,
  comision_colocador numeric NOT NULL DEFAULT 0,
  comision_cobrador numeric NOT NULL DEFAULT 0,
  frecuencia frecuencia_pago NOT NULL DEFAULT 'semanal',
  modalidad prestamo_modalidad NOT NULL DEFAULT 'fijo',
  tipo_mora tipo_mora NOT NULL DEFAULT 'porcentaje',
  valor_mora numeric NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.cat_cuotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_cat_cuotas" ON public.cat_cuotas FOR SELECT TO authenticated USING (empresa_id = get_user_empresa_id());
CREATE POLICY "auth_insert_cat_cuotas" ON public.cat_cuotas FOR INSERT TO authenticated WITH CHECK (empresa_id = get_user_empresa_id());
CREATE POLICY "auth_update_cat_cuotas" ON public.cat_cuotas FOR UPDATE TO authenticated USING (empresa_id = get_user_empresa_id()) WITH CHECK (empresa_id = get_user_empresa_id());
CREATE POLICY "auth_delete_cat_cuotas" ON public.cat_cuotas FOR DELETE TO authenticated USING (empresa_id = get_user_empresa_id());
