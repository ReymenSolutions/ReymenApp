#!/usr/bin/env bash
# Despliega la tarjeta pública desde el repo de ReymenApp (carpeta smartcard-public/)
# a la carpeta que corre en el VPS y reconstruye los contenedores.
#
# Uso (en el VPS):
#   sudo /home/emilianorm/reymen-ai-ops-preview/smartcard-public/deploy/update.sh
#   sudo .../update.sh public          # solo la tarjeta pública
#
# Qué hace: pull de main en el clon de ReymenApp, copia smartcard-public/ sobre la
# carpeta viva SIN tocar los .env.production ni node_modules, y corre
# `docker compose up -d --build` de los servicios indicados (por defecto public admin ops).
# No borra nada de la carpeta viva. Las migraciones de supabase/ NO se aplican aquí:
# se corren a mano en el SQL Editor de Supabase.
set -euo pipefail

APP_REPO="${APP_REPO:-/home/emilianorm/reymen-ai-ops-preview}"
LIVE="${SMARTCARD_LIVE:-/home/emilianorm/reymen-smartcard}"
SERVICES=("$@")
[ ${#SERVICES[@]} -eq 0 ] && SERVICES=(public admin ops)

echo "==> Pull de main en $APP_REPO"
git -C "$APP_REPO" pull --ff-only origin main

echo "==> Copiando smartcard-public/ a $LIVE"
rsync -a --exclude node_modules --exclude .next --exclude '.env*' --exclude .git \
  --exclude '*.tar.gz' --exclude '*.zip' --exclude '*.tsbuildinfo' --exclude deploy \
  "$APP_REPO/smartcard-public/" "$LIVE/"

echo "==> Reconstruyendo: ${SERVICES[*]}"
cd "$LIVE"
docker compose -f infra/docker-compose.yml up -d --build "${SERVICES[@]}"

echo "==> Estado"
docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'reymen-(public|admin|ops)' || true
