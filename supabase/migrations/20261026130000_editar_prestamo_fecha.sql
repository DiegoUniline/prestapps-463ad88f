-- editar_prestamo: nueva clave opcional "fecha_siguiente_pago" (date) para corregir la fecha de la
-- primera cuota pendiente; las cuotas siguientes se recorren los mismos días y rebuild_amortizacion
-- recalcula la mora con las fechas nuevas.
-- Se inyecta en la definición vigente (idempotente con marcador) para conservar las guardas
-- /*tenant_guard*/ y /*perm_guard*/ que ya tiene la función.
DO $$
DECLARE
  def text;
  ancla constant text := 'PERFORM public.rebuild_amortizacion(p.id);';
  bloque constant text := $b$/*fecha_pago*/
  IF nullif(d->>'fecha_siguiente_pago', '') IS NOT NULL THEN
    DECLARE
      v_fecha date := (d->>'fecha_siguiente_pago')::date;
      v_actual date;
      v_num integer;
    BEGIN
      SELECT fecha_vencimiento, num_cuota INTO v_actual, v_num
        FROM public.amortizacion
       WHERE prestamo_id = p.id AND coalesce(saldo_total, 0) > 0.009
       ORDER BY num_cuota LIMIT 1;
      IF v_num IS NULL THEN RAISE EXCEPTION 'El préstamo no tiene cuotas pendientes'; END IF;
      IF v_fecha < coalesce(p.fecha_registro::date, v_fecha) THEN
        RAISE EXCEPTION 'La fecha de pago no puede ser anterior al registro del préstamo';
      END IF;
      IF v_fecha <> v_actual THEN
        UPDATE public.amortizacion SET fecha_vencimiento = fecha_vencimiento + (v_fecha - v_actual)
         WHERE prestamo_id = p.id AND num_cuota >= v_num;
        IF v_num = 1 THEN UPDATE public.prestamos SET fecha_primer_pago = v_fecha WHERE id = p.id; END IF;
      END IF;
    END;
  END IF;

  $b$;
BEGIN
  def := pg_get_functiondef('public.editar_prestamo(uuid, jsonb)'::regprocedure);
  IF def LIKE '%/*fecha_pago*/%' THEN RETURN; END IF;
  IF (length(def) - length(replace(def, ancla, ''))) / length(ancla) <> 1 THEN
    RAISE EXCEPTION 'editar_prestamo: no se encontró "%" una sola vez; no se modificó', ancla;
  END IF;
  EXECUTE replace(def, ancla, bloque || ancla);
END $$;
