-- Limpieza de carga (2026-10-26). Idempotente.
-- Causa principal: el job whatsapp-cola (cada 5 min) llamaba a whatsapp-sender aunque la cola
-- estuviera vacía, y cron.job_run_details / net._http_response crecían sin limpieza.

-- 1) whatsapp-cola: solo llama a la Edge Function si hay mensajes por enviar
DO $$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname = 'whatsapp-cola';
  IF v_job IS NULL THEN RAISE NOTICE 'No existe el job whatsapp-cola'; RETURN; END IF;
  PERFORM cron.alter_job(v_job, command := $job$
    SELECT net.http_post(
      url := 'https://oewuzgugsjqtznmgnfhp.supabase.co/functions/v1/whatsapp-sender',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld3V6Z3Vnc2pxdHpubWduZmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDQ1NDgsImV4cCI6MjA4ODkyMDU0OH0.sLR4Y7cBqD9bqT4KRc6CUTUxJ2y_BqoQ0l15Avk5BbU',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld3V6Z3Vnc2pxdHpubWduZmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDQ1NDgsImV4cCI6MjA4ODkyMDU0OH0.sLR4Y7cBqD9bqT4KRc6CUTUxJ2y_BqoQ0l15Avk5BbU'),
      body := jsonb_build_object('action', 'process-queue'),
      timeout_milliseconds := 120000
    )
    WHERE EXISTS (SELECT 1 FROM public.whatsapp_cola
                   WHERE estado IN ('pendiente', 'enviando') AND proximo_intento <= now());
  $job$);
END $$;

-- 2) Limpieza diaria (3:30 a.m. CDMX): historial de pg_cron y archivos viejos de storage (Edge Function limpieza-storage)
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days';

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'limpieza-diaria';
  PERFORM cron.schedule('limpieza-diaria', '30 9 * * *', $job$
    DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days';
    SELECT net.http_post(
      url := 'https://oewuzgugsjqtznmgnfhp.supabase.co/functions/v1/limpieza-storage',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld3V6Z3Vnc2pxdHpubWduZmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDQ1NDgsImV4cCI6MjA4ODkyMDU0OH0.sLR4Y7cBqD9bqT4KRc6CUTUxJ2y_BqoQ0l15Avk5BbU',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld3V6Z3Vnc2pxdHpubWduZmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDQ1NDgsImV4cCI6MjA4ODkyMDU0OH0.sLR4Y7cBqD9bqT4KRc6CUTUxJ2y_BqoQ0l15Avk5BbU'),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$);
END $$;

-- 3) Reiniciar estadísticas para medir de nuevo en 24 h con DIAGNOSTICO_RENDIMIENTO.sql
SELECT extensions.pg_stat_statements_reset();
