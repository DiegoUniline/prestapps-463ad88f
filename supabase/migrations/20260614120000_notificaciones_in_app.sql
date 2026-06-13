CREATE TABLE IF NOT EXISTS public.notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  mensaje text,
  tipo text NOT NULL DEFAULT 'info',
  link text,
  leida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificaciones TO authenticated;
GRANT ALL ON public.notificaciones TO service_role;

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_notifs" ON public.notificaciones
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_update_own_notifs" ON public.notificaciones
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_delete_own_notifs" ON public.notificaciones
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_insert_same_empresa" ON public.notificaciones
  FOR INSERT TO authenticated WITH CHECK (empresa_id = public.get_user_empresa_id());

CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON public.notificaciones(user_id, created_at DESC) WHERE leida = false;

CREATE INDEX IF NOT EXISTS idx_notif_user_all
  ON public.notificaciones(user_id, created_at DESC);
