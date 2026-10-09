#!/usr/bin/env bash
# Recrea la base local y ejecuta la prueba SQL de seguridad y flujo (supabase/tests/10_security_and_flow_tests.sql).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-lr_test} bash scripts/db-local-reset.sh >/dev/null
cp supabase/tests/10_security_and_flow_tests.sql /tmp/lr_tests.sql && chmod a+r /tmp/lr_tests.sql
su postgres -c "psql -v ON_ERROR_STOP=1 -q -d ${DB:-lr_test} -f /tmp/lr_tests.sql" | grep -E "TODAS|FALLO" || exit 1
rm -f /tmp/lr_tests.sql
