-- Consultas que más tiempo consumen desde el último reinicio de pg_stat_statements. Solo lectura.
SELECT calls,
       round(total_exec_time)::bigint                AS total_ms,
       round(mean_exec_time::numeric, 1)             AS prom_ms,
       round(max_exec_time::numeric)                 AS max_ms,
       rows                                          AS filas,
       round(rows::numeric / nullif(calls, 0))       AS filas_por_llamada,
       left(regexp_replace(query, '\s+', ' ', 'g'), 400) AS query
FROM extensions.pg_stat_statements
WHERE query NOT ILIKE '%pg_stat_statements%'
  AND query !~* '^(BEGIN|COMMIT|SET|SHOW|select set_config)'
  AND query !~* '(cron\.|net\._http|net\.http_request_queue|pg_timezone_names|pg_type|pg_catalog)'
ORDER BY total_exec_time DESC
LIMIT 30;
