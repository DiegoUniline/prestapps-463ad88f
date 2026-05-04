ALTER TABLE public.cajas
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

UPDATE public.cajas SET activo = true WHERE activo IS NOT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='cajas' AND policyname='auth_delete_cajas'
  ) THEN
    EXECUTE 'CREATE POLICY auth_delete_cajas ON public.cajas FOR DELETE TO authenticated USING (empresa_id = get_user_empresa_id())';
  END IF;
END $$;
