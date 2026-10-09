#!/usr/bin/env bash
# Recrea una base local "lr_test" con el shim de Supabase, la tabla original simulada y todas las migraciones.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-lr_test}
P="su postgres -c"
$P "dropdb --if-exists $DB" >/dev/null
$P "createdb $DB"
run(){ su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $DB -f $1" ; }
cp -r supabase /tmp/lr_sql && chmod -R a+r /tmp/lr_sql
run /tmp/lr_sql/tests/00_supabase_shim.sql
[ "${WITH_LEGACY:-1}" = "1" ] && run /tmp/lr_sql/tests/01_legacy_fixture.sql
for f in /tmp/lr_sql/migrations/*.sql; do echo "== $(basename $f)"; run "$f"; done
rm -rf /tmp/lr_sql
