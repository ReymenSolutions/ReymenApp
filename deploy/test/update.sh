#!/usr/bin/env bash
# Despliega en el ambiente de PRUEBA cualquier rama (por defecto, la actual):
#   sudo ./deploy/test/update.sh claude/mi-cambio
#   sudo ./deploy/test/update.sh main
# Aplica las migraciones de esa rama a la base de prueba (no a producción) y espera a que quede sana.
source "$(dirname "$0")/common.sh"
need_env

branch="${1:-$(g rev-parse --abbrev-ref HEAD)}"
g fetch -q origin "$branch"
g checkout -q -B "$branch" "origin/$branch"
echo "→ Rama: $branch ($(g log -1 --format='%h %s'))"

tcompose up -d test-postgres
tcompose build app
build_tools
echo "→ Migraciones en la base de PRUEBA ..."
tools reymen-test-tools npx prisma migrate deploy
tcompose up -d app
wait_healthy
