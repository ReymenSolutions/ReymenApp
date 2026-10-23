#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
[[ -f "$root/.env.staging" ]] || { echo 'Falta .env.staging'; exit 1; }
compose=(docker compose --project-name reymen-mark-staging --env-file "$root/.env.staging" -f "$root/docker/docker-compose.staging.yml" -f "$root/docker/docker-compose.staging-review.yml")
case "${1:-}" in
  start)
    "${compose[@]}" up -d --no-build app
    "${compose[@]}" up -d --no-build --no-deps --force-recreate --wait --wait-timeout 90 ingress
    ;;
  status) "${compose[@]}" ps ;;
  *) echo 'Uso: bash deploy/staging/review.sh {start|status}. Para desactivar, bash deploy/staging/run.sh start'; exit 1 ;;
esac
