#!/usr/bin/env bash
# Verificación LOCAL de la reversión de 20261011000400 (nunca contra Supabase):
#   base nueva con todas las migraciones anteriores + datos sembrados → foto del catálogo y huellas de datos
#   → migración → huellas (datos sin cambios) → actividad (recalcular, revisar, exportar) → reversión
#   → huellas (la reversión no toca datos) y catálogo (igual al de antes: funciones, ACL, vistas, políticas…)
# Uso (como root, con PostgreSQL 16 local): bash security/reversion/verificar-20261011000400/verificar.sh
set -u
HERE=$(cd "$(dirname "$0")" && pwd); W=/tmp/lr_rb_sql; RB=${OUT:-/tmp/lr_rb_out}
mkdir -p "$RB"
cd "$HERE/../../.."
rm -rf $W && cp -r supabase $W && cp security/reversion/20261011000400_revertir.sql $W/revertir.sql && cp $HERE/*.sql $W/ && chmod -R a+rx $W
su postgres -c "dropdb --if-exists lr_rb" 2>/dev/null; su postgres -c "createdb lr_rb"
P(){ su postgres -c "psql -v ON_ERROR_STOP=1 -q -X -d lr_rb -f $1" 2>&1 | grep -vE "NOTICE|^$|^ *$" ; }
Q(){ su postgres -c "psql -X -tA -d lr_rb -f $1" 2>&1; }
P $W/tests/00_supabase_shim.sql >/dev/null; P $W/tests/01_legacy_fixture.sql
for f in $W/migrations/*.sql; do case $f in *20261011000400*) ;; *) P $f;; esac; done
P $W/seed.sql >/dev/null
Q $W/snap.sql > $RB/catalog_pre.txt; Q $W/fp.sql | grep -o "FP|.*" > $RB/fp_pre.txt
P $W/migrations/20261011000400_integridad_estudio.sql
Q $W/fp.sql | grep -o "FP|.*" > $RB/fp_post_migration.txt
Q $W/snap.sql > $RB/catalog_post_migration.txt
echo "== datos tras migrar (deben ser iguales):"; diff $RB/fp_pre.txt $RB/fp_post_migration.txt && echo "IGUALES ($(wc -l < $RB/fp_pre.txt) tablas)"
# Actividad con la migración aplicada (recalcular, revisar, exportar): solo debe tocar session_integrity y audit_events
P $W/activity.sql
Q $W/fp.sql | grep -o "FP|.*" > $RB/fp_post_activity.txt
echo "== cambios por la actividad (solo audit_events esperado):"; diff $RB/fp_post_migration.txt $RB/fp_post_activity.txt | grep '^>' | cut -d'|' -f2
P $W/revertir.sql
Q $W/fp.sql | grep -o "FP|.*" > $RB/fp_post_rollback.txt
Q $W/snap.sql > $RB/catalog_post_rollback.txt
echo "== datos tras revertir vs. antes de revertir (deben ser iguales):"; diff $RB/fp_post_activity.txt $RB/fp_post_rollback.txt && echo "IGUALES"
echo "== catálogo tras revertir vs. pre-estado (debe ser igual):"; diff $RB/catalog_pre.txt $RB/catalog_post_rollback.txt && echo "IGUAL ($(wc -l < $RB/catalog_pre.txt) líneas: funciones, ACL, vistas, columnas, políticas, triggers)"
