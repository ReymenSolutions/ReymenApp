#!/usr/bin/env bash
# Prueba de restauración: levanta un Postgres TEMPORAL, restaura el respaldo indicado (o el más reciente) y cuenta filas.
# Un respaldo que nunca se restauró no es un respaldo. No toca la base de producción.
#   sudo deploy/restore-test.sh [archivo.dump]
set -euo pipefail

[ -f /etc/reymen-backup.env ] && . /etc/reymen-backup.env
# Monitor externo (Healthchecks.io): éxito = ping a la URL; fallo = ping a <URL>/fail (te llega un correo).
ping_monitor() { [ -n "${HEALTHCHECK_RESTORE_URL:-}" ] && curl -fsS -m 15 --retry 3 -o /dev/null "${HEALTHCHECK_RESTORE_URL}$1" || true; }
on_error() { echo "✗ La prueba de restauración FALLÓ" >&2; ping_monitor "/fail"; }
trap on_error ERR

repo="$(cd "$(dirname "$0")/.." && pwd)"
file="${1:-$(ls -t "$repo"/backups/*.dump | head -1)}"
[ -f "$file" ] || { echo "✗ No hay respaldo que probar." >&2; exit 1; }
name="reymen-restore-test-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT

docker run -d --name "$name" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=restore postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker cp "$file" "$name:/tmp/r.dump"
docker exec "$name" pg_restore -U postgres -d restore --no-owner /tmp/r.dump
for t in '"Organization"' '"User"' '"Lead"' '"AuditLog"'; do
  n="$(docker exec "$name" psql -U postgres -d restore -tAc "SELECT count(*) FROM $t")"
  echo "  $t: $n filas"
done
echo "✓ Restauración correcta de $(basename "$file")"
ping_monitor ""
