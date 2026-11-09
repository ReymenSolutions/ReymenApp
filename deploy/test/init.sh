#!/usr/bin/env bash
# Crea .env.test con llaves NUEVAS (ninguna de producción) y sin servicios que manden cosas hacia afuera.
# Una sola vez, en la copia de prueba:  sudo ./deploy/test/init.sh
source "$(dirname "$0")/common.sh"

if [ -f .env.test ]; then
  echo "✓ .env.test ya existe; no se cambió. (Para empezar de cero, bórralo y vuelve a correr esto.)"
  exit 0
fi

rnd() { openssl rand -hex "${1:-32}"; }
db_pw="$(rnd 24)"
test_pw="prueba-$(rnd 6)"
# Misma versión de Postgres que producción, para que el respaldo se restaure sin problemas.
pg_image="$(sudo docker inspect "$PROD_DB_CONTAINER" --format '{{.Config.Image}}' 2>/dev/null || echo postgres:16-alpine)"

umask 077
cat > .env.test <<ENV
# Ambiente de PRUEBA (apptest.reymen.mx). Generado por deploy/test/init.sh — no subir a git.
REYMEN_ENV=test
TEST_APP_DOMAIN=apptest.reymen.mx
TEST_POS_DOMAIN=postest.reymen.mx
TEST_PG_IMAGE=$pg_image
TEST_DB_PASSWORD=$db_pw
DATABASE_URL=postgresql://reymen_test:$db_pw@reymen-test-postgres:5432/reymen_test
# Contraseña de TODOS los usuarios después de clonar producción (deploy/test/clone-prod.sh).
TEST_PASSWORD=$test_pw
# Correos: en prueba solo se envían a estas direcciones (separadas por coma). Vacío = ninguno.
TEST_EMAIL_ALLOWLIST=

NEXTAUTH_URL=https://apptest.reymen.mx
NEXT_PUBLIC_APP_URL=https://apptest.reymen.mx
NEXTAUTH_SECRET=$(rnd)
AUTH_TRUST_HOST=true
CRON_SECRET=$(rnd)
WALLET_AUTH_SECRET=$(rnd)

# Sin salida hacia afuera: n8n apunta a ningún lado; sin correo, push, Wallet, Stripe, SmartCard ni IA de pago.
N8N_BASE_URL=http://127.0.0.1:9
N8N_WEBHOOK_SECRET=$(rnd)
RESEND_API_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
STRIPE_SECRET_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
AI_DRAFT_PROVIDER=mock

REYMEN_POS_URL=https://postest.reymen.mx
ENV
sudo chmod 600 .env.test
echo "✓ .env.test creado (permisos 600)."
echo "  Contraseña de prueba para entrar a apptest después de clonar:  sudo grep TEST_PASSWORD .env.test"
