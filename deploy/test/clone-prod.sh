#!/usr/bin/env bash
# Copia la base de PRODUCCIÓN al ambiente de prueba y la limpia (prisma/sanitize-test.ts) antes de abrirla:
# teléfonos y correos ficticios, automatizaciones en pausa, llaves y contraseñas nuevas.
#   sudo ./deploy/test/clone-prod.sh
# A producción solo se le LEE (pg_dump). Reemplaza TODO lo que haya en la base de prueba.
source "$(dirname "$0")/common.sh"
need_env

POS_TEST_DIR="${POS_TEST_DIR:-$(cd .. && pwd)/pos}"

echo "Esto BORRA la base de prueba y la reemplaza con una copia limpia de producción."
read -r -p "Escribe CLONAR para continuar: " ok
[ "$ok" = "CLONAR" ] || { echo "Cancelado."; exit 1; }

tcompose up -d test-postgres
build_tools
tcompose stop app >/dev/null 2>&1 || true

echo "→ Respaldando producción (solo lectura) ..."
dump="$(mktemp)"
trap 'rm -f "$dump"' EXIT
sudo docker exec "$PROD_DB_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-privileges' > "$dump"
[ -s "$dump" ] || { echo "✗ No se pudo respaldar producción." >&2; exit 1; }

echo "→ Restaurando en la base de prueba ..."
sudo docker exec "$DB_CONTAINER_TEST" sh -c 'dropdb -U reymen_test --if-exists --force reymen_test_new; createdb -U reymen_test reymen_test_new'
# pg_restore avisa (y sale con error) por detalles sin importancia, como el dueño del esquema public: se revisa que
# los datos hayan llegado en vez de confiar en su código de salida.
sudo docker exec -i "$DB_CONTAINER_TEST" pg_restore -U reymen_test -d reymen_test_new --no-owner --no-privileges < "$dump" 2>/tmp/reymen-test-restore.log || true
orgs_count="$(sudo docker exec "$DB_CONTAINER_TEST" psql -U reymen_test -d reymen_test_new -tAc 'SELECT count(*) FROM "Organization"' 2>/dev/null || echo 0)"
if [ "${orgs_count:-0}" -lt 1 ]; then
  echo "✗ La copia no se restauró bien (sin negocios). La base de prueba anterior sigue igual." >&2
  tail -20 /tmp/reymen-test-restore.log >&2 || true
  exit 1
fi
echo "  $orgs_count negocios copiados."
sudo docker exec "$DB_CONTAINER_TEST" sh -c 'psql -U reymen_test -d postgres -qc "DROP DATABASE IF EXISTS reymen_test WITH (FORCE)" && psql -U reymen_test -d postgres -qc "ALTER DATABASE reymen_test_new RENAME TO reymen_test"'

echo "→ Migraciones de esta rama ..."
tools reymen-test-tools npx prisma migrate deploy

echo "→ Limpiando datos personales y llaves ..."
posdir="$(mktemp -d)"
sudo chmod 777 "$posdir"
tools -v "$posdir:/out" reymen-test-tools npx tsx prisma/sanitize-test.ts /out/pos.json

# POS de prueba: misma llave nueva de cada negocio y su código de enlace.
if [ -f "$POS_TEST_DIR/.env.test" ] && [ -s "$posdir/pos.json" ]; then
  orgs="$(sudo cat "$posdir/pos.json")"
  sudo sed -i "s|^REYMEN_ORGS=.*|REYMEN_ORGS=$orgs|" "$POS_TEST_DIR/.env.test"
  (cd "$POS_TEST_DIR" && sudo docker compose --env-file .env.test -f docker-compose.test.yml up -d --force-recreate pos-test >/dev/null) \
    && echo "✓ POS de prueba actualizado con las llaves nuevas." \
    || echo "⚠ No se pudo reiniciar el POS de prueba; corre su deploy/test-update.sh." >&2
fi
sudo rm -rf "$posdir"

tcompose up -d app
wait_healthy
echo "  Entra con el correo de cualquier usuario y la contraseña de prueba:  sudo grep TEST_PASSWORD .env.test"
