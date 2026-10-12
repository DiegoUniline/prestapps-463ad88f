-- Roles por empresa: user_roles.empresa_id y has_role() valida la empresa actual del usuario.

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS empresa_id uuid;

UPDATE public.user_roles ur
SET empresa_id = p.empresa_id
FROM public.profiles p
WHERE p.id = ur.user_id AND ur.empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_empresa ON public.user_roles (user_id, empresa_id, role);

CREATE OR REPLACE FUNCTION public.trg_user_roles_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS NULL THEN
    SELECT empresa_id INTO NEW.empresa_id FROM public.profiles WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_roles_empresa ON public.user_roles;
CREATE TRIGGER user_roles_empresa BEFORE INSERT OR UPDATE OF user_id ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_user_roles_empresa();

-- Al mover un usuario de empresa (solo super admin vía manage-users) sus roles lo siguen.
CREATE OR REPLACE FUNCTION public.trg_profiles_roles_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
     AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.id AND lower(u.email) = 'diego.leon@uniline.mx') THEN
    UPDATE public.user_roles SET empresa_id = NEW.empresa_id WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_roles_empresa ON public.profiles;
CREATE TRIGGER profiles_roles_empresa AFTER UPDATE OF empresa_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profiles_roles_empresa();

REVOKE ALL ON FUNCTION public.trg_user_roles_empresa() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_profiles_roles_empresa() FROM PUBLIC, anon, authenticated;

-- El super admin conserva admin en cualquier empresa a la que cambie (switch_empresa).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (ur.empresa_id IS NULL
           OR ur.empresa_id = (SELECT p.empresa_id FROM public.profiles p WHERE p.id = _user_id))
  )
  OR (_role = 'admin' AND EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = _user_id AND lower(u.email) = 'diego.leon@uniline.mx'
  ))
$$;
