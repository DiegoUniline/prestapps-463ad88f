CREATE OR REPLACE FUNCTION public.trg_notif_prestamos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notif_emit_admins(
      NEW.empresa_id,
      'Nuevo préstamo',
      'Monto $' || to_char(COALESCE(NEW.monto_solicitado, 0), 'FM999,999,999.00'),
      'info',
      '/prestamos/' || NEW.id
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado::text = 'Vencido' THEN
      PERFORM public.notif_emit_admins(
        NEW.empresa_id,
        'Préstamo vencido',
        COALESCE(NEW.id_prestamo, '') || ' marcado vencido',
        'warning',
        '/prestamos/' || NEW.id
      );
    ELSIF NEW.estado::text = 'Liquidado' THEN
      PERFORM public.notif_emit_admins(
        NEW.empresa_id,
        'Préstamo liquidado',
        COALESCE(NEW.id_prestamo, '') || ' liquidado',
        'success',
        '/prestamos/' || NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
