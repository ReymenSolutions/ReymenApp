#!/usr/bin/env bash
# Instala (o actualiza) los cron de ReymenApp en el VPS. Es idempotente: se puede correr las veces que haga falta.
#   sudo /home/emilianorm/reymen-ai-ops-preview/deploy/install-cron.sh
# Requiere CRON_SECRET en el entorno del contenedor de la app (el script lo verifica).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "✗ Córrelo con sudo." >&2; exit 1; fi

repo="$(cd "$(dirname "$0")/.." && pwd)"
runner="$repo/deploy/cron-run.sh"
chmod +x "$runner"
container="${APP_CONTAINER:-reymen-ai-ops-preview}"

if ! docker exec "$container" sh -c 'test -n "$CRON_SECRET"'; then
  echo "✗ CRON_SECRET no está configurado en $container. Agrégalo al .env del compose (por ejemplo: openssl rand -hex 32)," >&2
  echo "  vuelve a levantar la app y corre este script otra vez. Sin él, los endpoints responden 401." >&2
  exit 1
fi

mkdir -p /var/log/reymen
cat > /etc/cron.d/reymen-ai-ops <<CRON
# Generado por deploy/install-cron.sh — no editar a mano.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
APP_CONTAINER=$container
# Reloj de las automatizaciones
*/5 * * * * root $runner tick >> /var/log/reymen/cron.log 2>&1
# Reintento de webhooks fallidos
*/10 * * * * root $runner retry >> /var/log/reymen/cron.log 2>&1
# Avisos de vencimiento de suscripción: 8:00 hora de México (14:00 UTC)
0 14 * * * root $runner billing >> /var/log/reymen/cron.log 2>&1
CRON
chmod 644 /etc/cron.d/reymen-ai-ops

cat > /etc/logrotate.d/reymen-ai-ops <<'LOG'
/var/log/reymen/cron.log {
  weekly
  rotate 4
  compress
  missingok
  notifempty
}
LOG

echo "✓ Cron instalados en /etc/cron.d/reymen-ai-ops. Probando cada uno una vez:"
for job in tick retry billing; do "$runner" "$job" || echo "  ⚠ $job falló (revisa /var/log/reymen/cron.log)"; done
