-- Permisos por rol aplicados en el servidor (misma matriz que src/hooks/usePermisos.ts:
-- role_permissions de la empresa y, si no hay fila, los valores por defecto).

CREATE OR REPLACE FUNCTION public.rol_actual()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r FROM (VALUES ('admin'::public.app_role, 1), ('supervisor', 2), ('cobrador', 3)) v(r, o)
  WHERE public.has_role(auth.uid(), r)
  ORDER BY o LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_module text, p_action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
  v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN coalesce(auth.role(), '') = 'service_role' OR current_user IN ('postgres', 'service_role');
  END IF;
  IF public.is_super_admin() THEN RETURN true; END IF;
  v_role := public.rol_actual();
  IF v_role IS NULL THEN RETURN false; END IF;

  SELECT rp.allowed INTO v_allowed
  FROM public.role_permissions rp
  WHERE rp.role = v_role AND rp.module = p_module AND rp.action = p_action
    AND (rp.empresa_id = public.get_user_empresa_id() OR rp.empresa_id IS NULL)
  ORDER BY rp.empresa_id NULLS LAST
  LIMIT 1;
  IF v_allowed IS NOT NULL THEN RETURN v_allowed; END IF;

  RETURN CASE v_role
    WHEN 'admin' THEN true
    WHEN 'supervisor' THEN p_module = ANY (ARRAY['dashboard','cobranza','mi_cobranza','prestamos','pagos','promesas',
                                                  'solicitudes','clientes','crm','scoring','mapa_gps','reportes'])
                           AND p_action = ANY (ARRAY['ver','agregar','editar'])
    ELSE (p_module = ANY (ARRAY['dashboard','cobranza','mi_cobranza','prestamos','pagos','promesas','solicitudes']) AND p_action = 'ver')
         OR (p_module = ANY (ARRAY['pagos','promesas']) AND p_action = 'agregar')
  END;
END $$;

REVOKE ALL ON FUNCTION public.rol_actual() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tiene_permiso(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rol_actual() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tiene_permiso(text, text) TO authenticated, service_role;

-- Guardas de permiso inyectadas al inicio de cada RPC (idempotente con marcador).
DO $$
DECLARE
  g record;
  f record;
  def text;
  nuevo text;
  cond text;
BEGIN
  FOR g IN
    SELECT * FROM (VALUES
      ('cancelar_prestamo',        $c$public.tiene_permiso('prestamos','cancelar_prestamo')$c$),
      ('reestructurar_prestamo',   $c$public.tiene_permiso('prestamos','reestructurar')$c$),
      ('editar_prestamo',          $c$public.tiene_permiso('prestamos','editar')$c$),
      ('crear_prestamo',           $c$public.tiene_permiso('prestamos','agregar') OR public.tiene_permiso('solicitudes','aprobar_solicitud')$c$),
      ('editar_pago',              $c$public.tiene_permiso('pagos','editar')$c$),
      ('revertir_pago',            $c$public.tiene_permiso('pagos','anular_pago')$c$),
      ('registrar_pago_completo',  $c$public.tiene_permiso('pagos','agregar')$c$),
      ('liquidar_prestamo',        $c$public.tiene_permiso('pagos','agregar')$c$),
      ('transferir_caja',          $c$public.tiene_permiso('cajas','editar')$c$),
      ('registrar_movimiento_caja',$c$public.tiene_permiso('cajas','editar') OR public.tiene_permiso('gastos','agregar')$c$),
      ('registrar_promesa_pago',   $c$public.tiene_permiso('promesas','agregar')$c$)
    ) AS t(fn, cond)
  LOOP
    FOR f IN
      SELECT p.oid FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname = g.fn AND l.lanname = 'plpgsql'
    LOOP
      def := pg_get_functiondef(f.oid);
      CONTINUE WHEN def LIKE '%/*perm_guard*/%';
      cond := format('IF auth.uid() IS NOT NULL AND NOT (%s) THEN RAISE EXCEPTION ''No tienes permiso para esta acción'' USING ERRCODE = ''42501''; END IF; ', g.cond);
      nuevo := regexp_replace(def, '(AS \$function\$.*?\mBEGIN\M)', '\1 /*perm_guard*/ ' || cond, 'i');
      IF nuevo = def THEN
        RAISE NOTICE 'perm_guard: no se pudo inyectar en %', g.fn;
      ELSE
        EXECUTE nuevo;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- cajas.saldo_actual solo lo escriben triggers y RPCs: una escritura directa del cliente
-- (pg_trigger_depth() = 1 como authenticated/anon) se rechaza; los triggers anidados y las
-- funciones SECURITY DEFINER no se ven afectados.
CREATE OR REPLACE FUNCTION public.trg_cajas_proteger_saldo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() = 1 AND current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.saldo_actual := 0;
    ELSIF NEW.saldo_actual IS DISTINCT FROM OLD.saldo_actual THEN
      RAISE EXCEPTION 'El saldo de la caja solo cambia con movimientos' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cajas_proteger_saldo ON public.cajas;
CREATE TRIGGER cajas_proteger_saldo BEFORE INSERT OR UPDATE ON public.cajas
  FOR EACH ROW EXECUTE FUNCTION public.trg_cajas_proteger_saldo();
REVOKE ALL ON FUNCTION public.trg_cajas_proteger_saldo() FROM PUBLIC, anon, authenticated;
