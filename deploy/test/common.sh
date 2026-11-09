# Funciones compartidas por los scripts del ambiente de prueba (se cargan con "source").
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

# Nunca en la carpeta de producción: ahí existe docker/docker-compose.preview.yml.
if [ -f docker/docker-compose.preview.yml ]; then
  echo "✗ Esta es la carpeta de PRODUCCIÓN. El ambiente de prueba va en su propia copia del repo (ver docs/AMBIENTE-PRUEBA.md)." >&2
  exit 1
fi

COMPOSE_FILE_TEST="docker/docker-compose.test.yml"
APP_CONTAINER_TEST="reymen-test-app"
DB_CONTAINER_TEST="reymen-test-postgres"
PROD_DB_CONTAINER="${PROD_DB_CONTAINER:-reymen-ai-ops-preview-postgres}"

repo_owner="$(stat -c %U .)"
if [ "$repo_owner" = "$(id -un)" ]; then g() { git "$@"; }; else g() { sudo -u "$repo_owner" -H git "$@"; }; fi

need_env() {
  if [ ! -f .env.test ]; then
    echo "✗ Falta .env.test. Corre primero:  sudo ./deploy/test/init.sh" >&2
    exit 1
  fi
}
tcompose() { sudo docker compose --env-file .env.test -f "$COMPOSE_FILE_TEST" "$@"; }
envval() { sudo grep -E "^$1=" .env.test | head -1 | cut -d= -f2-; }

# Imagen con las herramientas (Prisma CLI, tsx) del código de ESTA copia, conectada a la base de prueba.
build_tools() { sudo docker build --target builder -t reymen-test-tools -f docker/Dockerfile . >/dev/null; }
tools() {
  sudo docker run --rm --network reymen-test_test \
    -e DATABASE_URL="$(envval DATABASE_URL)" -e REYMEN_ENV=test -e TEST_PASSWORD="$(envval TEST_PASSWORD)" \
    "$@"
}

wait_healthy() {
  local health=""
  for _ in $(seq 1 30); do
    health="$(sudo docker exec "$APP_CONTAINER_TEST" wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null || true)"
    case "$health" in *'"status":"ok"'*) echo "✓ Prueba arriba: https://$(envval TEST_APP_DOMAIN) ($(g log -1 --format='%h %s'))"; return 0 ;; esac
    sleep 5
  done
  echo "✗ La app de prueba no quedó sana. Respuesta: ${health:-(sin respuesta)}" >&2
  echo "  Revisa:  sudo docker logs --tail=100 $APP_CONTAINER_TEST" >&2
  return 1
}
