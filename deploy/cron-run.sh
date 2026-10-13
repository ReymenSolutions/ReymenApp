#!/usr/bin/env bash
# Llama a un endpoint de cron de ReymenApp DESDE DENTRO del contenedor (sin pasar por internet y sin guardar el secreto
# en el host: se lee del entorno del contenedor en cada corrida).
# Uso: deploy/cron-run.sh <tick|billing|retry>
set -euo pipefail

case "${1:-}" in
  tick) path="/api/cron/automations/tick" ;;      # reloj de automatizaciones (cada 5 min)
  billing) path="/api/cron/billing" ;;            # avisos de vencimiento de suscripción (diario)
  retry) path="/api/cron/retry-webhooks" ;;       # reintento de webhooks fallidos (cada 10 min)
  *) echo "Uso: $0 <tick|billing|retry>" >&2; exit 2 ;;
esac

container="${APP_CONTAINER:-reymen-ai-ops-preview}"
if ! sudo docker ps --format '{{.Names}}' | grep -qx "$container"; then
  echo "cron-run: el contenedor $container no está corriendo" >&2
  exit 1
fi

sudo docker exec -e CRON_PATH="$path" "$container" node -e '
const secret = process.env.CRON_SECRET;
if (!secret) { console.error("cron-run: CRON_SECRET no está configurado en el contenedor"); process.exit(3); }
fetch(`http://127.0.0.1:${process.env.PORT || 3000}${process.env.CRON_PATH}`, { method: "POST", headers: { authorization: `Bearer ${secret}` } })
  .then(async (r) => { const body = await r.text(); console.log(new Date().toISOString(), process.env.CRON_PATH, r.status, body.slice(0, 300)); process.exit(r.ok ? 0 : 1); })
  .catch((e) => { console.error("cron-run:", e.message); process.exit(1); });
'
