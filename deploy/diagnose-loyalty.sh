#!/usr/bin/env bash
# Read-only counts from the deployed app's database, without customer details.
# Usage: sudo bash deploy/diagnose-loyalty.sh gardenia
set -euo pipefail
if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "Uso: sudo bash deploy/diagnose-loyalty.sh nombre-del-negocio" >&2
  exit 1
fi
script_dir="$(cd "$(dirname "$0")" && pwd)"
docker exec -i "${APP_CONTAINER:-reymen-ai-ops-preview}" node --input-type=module - "$1" < "$script_dir/diagnose-loyalty.mjs"
