-- Diagnóstico de espacio y carga. Solo lectura. Ejecutar completo en el SQL Editor y copiar la celda "diagnostico".
CREATE OR REPLACE FUNCTION pg_temp.diag() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  r jsonb := '{}'::jsonb;
  v jsonb;
BEGIN
  r := r || jsonb_build_object('db_size', pg_size_pretty(pg_database_size(current_database())));

  -- 1) Tablas más pesadas (todos los esquemas: public, cron, net, storage, auth, realtime…)
  SELECT jsonb_agg(t) INTO v FROM (
    SELECT n.nspname || '.' || c.relname AS tabla,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
           pg_size_pretty(pg_relation_size(c.oid)) AS datos,
           pg_size_pretty(pg_indexes_size(c.oid)) AS indices,
           s.n_live_tup AS filas, s.n_dead_tup AS muertas,
           s.last_autovacuum::date AS ult_vacuum
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_all_tables s ON s.relid = c.oid
    WHERE c.relkind IN ('r','m') AND n.nspname NOT IN ('pg_catalog','information_schema')
    ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 20) t;
  r := r || jsonb_build_object('tablas_pesadas', v);

  -- 2) Slots de replicación (WAL retenido llena el disco)
  BEGIN
    SELECT jsonb_agg(t) INTO v FROM (
      SELECT slot_name, slot_type, active,
             pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_retenido
      FROM pg_replication_slots) t;
    r := r || jsonb_build_object('slots', v);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('slots', SQLERRM); END;

  -- 3) Consultas que más tiempo consumen
  BEGIN
    EXECUTE $q$
      SELECT jsonb_agg(t) FROM (
        SELECT calls, round(total_exec_time)::bigint AS total_ms, round(mean_exec_time::numeric, 1) AS prom_ms,
               rows AS filas, left(regexp_replace(query, '\s+', ' ', 'g'), 300) AS query
        FROM extensions.pg_stat_statements
        WHERE query NOT ILIKE '%pg_stat_statements%'
        ORDER BY total_exec_time DESC LIMIT 25) t $q$ INTO v;
    r := r || jsonb_build_object('top_tiempo', v);
    EXECUTE $q$
      SELECT jsonb_agg(t) FROM (
        SELECT calls, round(mean_exec_time::numeric, 1) AS prom_ms,
               left(regexp_replace(query, '\s+', ' ', 'g'), 200) AS query
        FROM extensions.pg_stat_statements
        ORDER BY calls DESC LIMIT 15) t $q$ INTO v;
    r := r || jsonb_build_object('top_llamadas', v);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('pg_stat_statements', SQLERRM); END;

  -- 4) Tablas leídas completas (candidatas a índice)
  SELECT jsonb_agg(t) INTO v FROM (
    SELECT schemaname || '.' || relname AS tabla, seq_scan, seq_tup_read, idx_scan, n_live_tup AS filas
    FROM pg_stat_user_tables
    WHERE seq_tup_read > 0
    ORDER BY seq_tup_read DESC LIMIT 15) t;
  r := r || jsonb_build_object('seq_scans', v);

  -- 5) Índices sin uso
  SELECT jsonb_agg(t) INTO v FROM (
    SELECT s.schemaname || '.' || s.indexrelname AS indice, s.relname AS tabla,
           pg_size_pretty(pg_relation_size(s.indexrelid)) AS tam
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON i.indexrelid = s.indexrelid
    WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary
    ORDER BY pg_relation_size(s.indexrelid) DESC LIMIT 20) t;
  r := r || jsonb_build_object('indices_sin_uso', v);

  -- 6) Conexiones
  SELECT jsonb_agg(t) INTO v FROM (
    SELECT coalesce(usename::text, '-') AS usuario, coalesce(application_name, '-') AS app, state, count(*) AS n
    FROM pg_stat_activity GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 15) t;
  r := r || jsonb_build_object('conexiones', v);

  -- 7) Cache hit (debe ser > 0.99)
  SELECT jsonb_build_object(
    'tablas', round(sum(heap_blks_hit)::numeric / nullif(sum(heap_blks_hit + heap_blks_read), 0), 4),
    'indices', (SELECT round(sum(idx_blks_hit)::numeric / nullif(sum(idx_blks_hit + idx_blks_read), 0), 4) FROM pg_statio_user_indexes))
  INTO v FROM pg_statio_user_tables;
  r := r || jsonb_build_object('cache_hit', v);

  -- 8) Jobs de pg_cron y su historial
  BEGIN
    EXECUTE $q$
      SELECT jsonb_build_object(
        'jobs', (SELECT jsonb_agg(jsonb_build_object('job', jobname, 'cada', schedule, 'activo', active)) FROM cron.job),
        'historial_filas', (SELECT count(*) FROM cron.job_run_details),
        'fallas_24h', (SELECT count(*) FROM cron.job_run_details WHERE status <> 'succeeded' AND start_time > now() - interval '1 day'))
    $q$ INTO v;
    r := r || jsonb_build_object('cron', v);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('cron', SQLERRM); END;

  -- 9) Storage por bucket
  BEGIN
    SELECT jsonb_agg(t) INTO v FROM (
      SELECT bucket_id, count(*) AS archivos,
             pg_size_pretty(sum(coalesce((metadata->>'size')::bigint, 0))) AS tam
      FROM storage.objects GROUP BY 1 ORDER BY sum(coalesce((metadata->>'size')::bigint, 0)) DESC) t;
    r := r || jsonb_build_object('storage', v);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('storage', SQLERRM); END;

  RETURN r;
END $$;

SELECT jsonb_pretty(pg_temp.diag()) AS diagnostico;
