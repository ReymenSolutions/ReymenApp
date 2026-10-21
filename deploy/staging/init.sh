#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
target="$root/.env.staging"
umask 077
# noclobber also refuses symlinks and concurrent initialization; never rotate silently.
set -o noclobber
{
  for key in DB_PASSWORD AUTH_SECRET WEBHOOK_SECRET CRON_SECRET ADMIN_PASSWORD OWNER_PASSWORD; do
    value=$(openssl rand -hex 32)
    printf 'STAGING_%s=%s\n' "$key" "$value"
  done
} > "$target"
printf '%s\n' 'Configuración privada creada en .env.staging. No compartas su contenido.'
