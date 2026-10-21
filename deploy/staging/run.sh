#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
[[ -f "$root/.env.staging" ]] || { echo 'Ejecuta primero bash deploy/staging/init.sh'; exit 1; }
compose=(docker compose --project-name reymen-mark-staging --env-file "$root/.env.staging" -f "$root/docker/docker-compose.staging.yml")
case "${1:-}" in
  build) "${compose[@]}" --profile tools build app tools ;;
  database) "${compose[@]}" up -d --wait staging-postgres ;;
  migrate) "${compose[@]}" run --rm --no-deps tools node node_modules/prisma/build/index.js migrate deploy ;;
  bootstrap) "${compose[@]}" run --rm --no-deps tools node deploy/staging/bootstrap.mjs ;;
  start)
    "${compose[@]}" up -d --no-build app
    # Resolve the current app address after every app recreation/update.
    "${compose[@]}" up -d --no-build --no-deps --force-recreate ingress
    ;;
  status) "${compose[@]}" ps ;;
  stop) "${compose[@]}" stop ingress app ;;
  *) echo 'Uso: bash deploy/staging/run.sh {build|database|migrate|bootstrap|start|status|stop}'; exit 1 ;;
esac
