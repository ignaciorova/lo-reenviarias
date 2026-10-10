#!/usr/bin/env bash
# Recrea la base local y ejecuta las pruebas SQL (seguridad y flujo, banco de noticias, ranking y versión 4.0.0).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-lr_test} bash scripts/db-local-reset.sh >/dev/null
for t in supabase/tests/10_security_and_flow_tests.sql supabase/tests/20_banco_noticias_tests.sql supabase/tests/30_tabla_puntuacion_tests.sql; do
  cp "$t" /tmp/lr_tests.sql && chmod a+r /tmp/lr_tests.sql
  echo "== $(basename "$t")"
  su postgres -c "psql -v ON_ERROR_STOP=1 -q -d ${DB:-lr_test} -f /tmp/lr_tests.sql" | grep -E "TODAS|FALLO" || exit 1
done
rm -f /tmp/lr_tests.sql
