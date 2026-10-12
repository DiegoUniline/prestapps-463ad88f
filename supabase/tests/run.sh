#!/usr/bin/env bash
# Suite de pruebas SQL contra un Postgres real (local o el service container de CI).
#
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres ./supabase/tests/run.sh
#
# Conexión por las variables estándar de libpq (PGHOST, PGPORT, PGUSER, PGPASSWORD).
# PGDATABASE = base de pruebas que se BORRA y se vuelve a crear (default: prestapp_sql_tests).
# El usuario debe ser superusuario (crea roles, SET ROLE anon/authenticated/service_role).
#
# Pasos: mock del esquema de prod (00_mock_schema.sql) → helpers (01_test_helpers.sql) →
# migraciones 20261012*/20261013* en orden, DOS veces (idempotencia) → datos fijos
# (05_fixtures.sql) → cada [1-9][0-9]_*.sql (BEGIN … ROLLBACK). Las aserciones imprimen
# líneas "ok - …" / "not ok - …"; cualquier "not ok" o error de psql hace salir con 1.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
MIGR_DIR="$ROOT/supabase/migrations"
DB="${PGDATABASE:-prestapp_sql_tests}"
ADMIN_DB="${SQLTEST_ADMIN_DB:-postgres}"
MIGR_PATTERNS=("20261012*.sql" "20261013*.sql")

if [ -t 1 ]; then RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'; else RED=; GREEN=; YELLOW=; RESET=; fi

PSQL=(psql -X -q -v ON_ERROR_STOP=1)
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

die() { echo "${RED}ERROR:${RESET} $*" >&2; exit 2; }

command -v psql >/dev/null || die "psql no está instalado"
[[ "$DB" =~ ^[A-Za-z0-9_]+$ ]] || die "PGDATABASE inválido: $DB"

echo "== Base de pruebas: $DB (${PGHOST:-socket}:${PGPORT:-5432}, usuario ${PGUSER:-$USER})"
"${PSQL[@]}" -d "$ADMIN_DB" -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" || die "no se pudo borrar $DB"
"${PSQL[@]}" -d "$ADMIN_DB" -c "CREATE DATABASE $DB TEMPLATE template0 ENCODING 'UTF8'" || die "no se pudo crear $DB"
export PGDATABASE="$DB"

# Cadena de conexión para dblink (pruebas de concurrencia): el servidor se conecta a sí mismo.
if [ -z "${SQLTEST_DBLINK_DSN:-}" ]; then
  SERVER_PORT="$("${PSQL[@]}" -At -c 'SHOW port')"
  SQLTEST_DBLINK_DSN="host=127.0.0.1 port=$SERVER_PORT dbname=$DB user=${PGUSER:-$(whoami)}"
  [ -n "${PGPASSWORD:-}" ] && SQLTEST_DBLINK_DSN="$SQLTEST_DBLINK_DSN password=$PGPASSWORD"
fi
"${PSQL[@]}" -v dsn="$SQLTEST_DBLINK_DSN" <<< "ALTER DATABASE $DB SET tests.dblink_dsn = :'dsn';" \
  || die "no se pudo configurar tests.dblink_dsn"

load() {
  local f="$1"
  if ! out="$("${PSQL[@]}" --single-transaction -f "$f" 2>&1)"; then
    echo "$out" >&2
    die "falló al cargar $(basename "$f")"
  fi
  grep -E '^(psql:.*)?(WARNING|ADVERTENCIA)' <<< "$out" | sed "s/^/      ${YELLOW}/;s/\$/${RESET}/" || true
}

echo "== Mock del esquema"
load "$DIR/00_mock_schema.sql"
load "$DIR/01_test_helpers.sql"

MIGRATIONS=()
for p in "${MIGR_PATTERNS[@]}"; do
  for f in "$MIGR_DIR"/$p; do [ -e "$f" ] && MIGRATIONS+=("$f"); done
done
IFS=$'\n' MIGRATIONS=($(printf '%s\n' "${MIGRATIONS[@]}" | sort)); unset IFS
[ "${#MIGRATIONS[@]}" -gt 0 ] || die "no hay migraciones ${MIGR_PATTERNS[*]} en $MIGR_DIR"

for pasada in 1 2; do
  echo "== Migraciones (pasada $pasada de 2)"
  for f in "${MIGRATIONS[@]}"; do
    echo "   $(basename "$f")"
    load "$f"
  done
done

echo "== Datos fijos"
load "$DIR/05_fixtures.sql"

PASS=0; FAIL=0; SKIP=0; TODO=0; FILE_ERRORS=0
FAILED_LINES=(); TODO_LINES=()
shopt -s nullglob
TEST_FILES=("$DIR"/[1-9][0-9]_*.sql)
[ "${#TEST_FILES[@]}" -gt 0 ] || die "no hay archivos de prueba"

HUELLA="$("${PSQL[@]}" -At -c 'SELECT tests.huella()')" || die "no se pudo calcular la huella de datos"

for f in "${TEST_FILES[@]}"; do
  name="$(basename "$f")"
  echo "== $name"
  out="$("${PSQL[@]}" -At -f "$f" 2>&1)"
  status=$?
  if [ "$("${PSQL[@]}" -At -c 'SELECT tests.huella()')" != "$HUELLA" ]; then
    out="$out"$'\n'"not ok - $name dejó cambios confirmados en los datos fijos (debe terminar en ROLLBACK y limpiar lo que confirme)"
    HUELLA="$("${PSQL[@]}" -At -c 'SELECT tests.huella()')"
  fi
  n_ok=0; n_fail=0
  while IFS= read -r line; do
    case "$line" in
      "ok - "*"# SKIP"*) SKIP=$((SKIP + 1)); n_ok=$((n_ok + 1)); echo "   ${YELLOW}${line}${RESET}" ;;
      "not ok - "*"# TODO"*) TODO=$((TODO + 1)); TODO_LINES+=("$name: $line"); echo "   ${YELLOW}${line}${RESET}" ;;
      "ok - "*"# TODO"*) PASS=$((PASS + 1)); n_ok=$((n_ok + 1)); echo "   ${YELLOW}${line}  <- ya pasa: quita tests.todo()${RESET}" ;;
      "ok - "*) PASS=$((PASS + 1)); n_ok=$((n_ok + 1)); [ -n "${SQLTEST_VERBOSE:-}" ] && echo "   $line" ;;
      "not ok - "*) FAIL=$((FAIL + 1)); n_fail=$((n_fail + 1)); FAILED_LINES+=("$name: $line"); echo "   ${RED}${line}${RESET}" ;;
      "") ;;
      *) echo "   | $line" ;;
    esac
  done <<< "$out"
  if [ "$status" -ne 0 ]; then
    FILE_ERRORS=$((FILE_ERRORS + 1))
    FAILED_LINES+=("$name: psql terminó con código $status (error de SQL; ver salida arriba)")
    echo "   ${RED}psql terminó con código $status${RESET}"
  fi
  echo "   $n_ok ok, $n_fail fallidas"
done

TOTAL=$((PASS + FAIL + SKIP + TODO))
echo
echo "== Resumen: $TOTAL pruebas, ${GREEN}$PASS ok${RESET}, ${RED}$FAIL fallidas${RESET}, ${YELLOW}$SKIP omitidas, $TODO TODO (bugs conocidos)${RESET}, $FILE_ERRORS archivos con error"
for l in "${TODO_LINES[@]}"; do echo "   ${YELLOW}$l${RESET}"; done
if [ "$FAIL" -gt 0 ] || [ "$FILE_ERRORS" -gt 0 ] || [ "$TOTAL" -eq 0 ]; then
  for l in "${FAILED_LINES[@]}"; do echo "   ${RED}$l${RESET}"; done
  exit 1
fi
echo "${GREEN}Todo en verde.${RESET}"
