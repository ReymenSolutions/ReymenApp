#!/usr/bin/env bash
# Configura únicamente el sitio privado de Taller Wolf en el ambiente de prueba.
# Uso: sudo ./deploy/test/configure-wolf-site.sh [dominio-de-prueba]
source "$(dirname "$0")/common.sh"
need_env

domain="${1:-wolftest.reymen.mx}"
if [[ ! "$domain" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]] || [[ "$domain" != *.* ]]; then
  echo "✗ Dominio de prueba inválido" >&2
  exit 1
fi

expected_ip="$(getent ahostsv4 "$(envval TEST_APP_DOMAIN)" 2>/dev/null | awk 'NR == 1 { print $1 }' || true)"
domain_ip="$(getent ahostsv4 "$domain" 2>/dev/null | awk 'NR == 1 { print $1 }' || true)"
if [ -z "$expected_ip" ] || [ "$domain_ip" != "$expected_ip" ]; then
  echo "✗ Crea primero el registro DNS A de $domain hacia $expected_ip y espera a que resuelva." >&2
  echo "  IP actual: ${domain_ip:-(no resuelve)}" >&2
  exit 1
fi

echo "Organizaciones Wolf disponibles en la base de PRUEBA:"
sudo docker exec "$APP_CONTAINER_TEST" node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.organization.findMany({ where: { name: { contains: "Wolf", mode: "insensitive" } }, select: { id: true, name: true, isActive: true, modules: { where: { module: "WORKSHOP" }, select: { status: true } } } })
 .then(rows => rows.forEach(row => console.log(row.id, "|", row.name, "| activo:", row.isActive, "| WORKSHOP:", row.modules[0]?.status ?? "sin módulo")))
 .finally(() => p.$disconnect());
'

read -r -p "Pega el ID de la organización Wolf de PRUEBA: " organization_id
if [[ ! "$organization_id" =~ ^[a-z0-9]{10,40}$ ]]; then
  echo "✗ ID inválido" >&2
  exit 1
fi
if ! sudo docker exec "$APP_CONTAINER_TEST" node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.organization.findFirst({ where: { id: process.argv[1], isActive: true, modules: { some: { module: "WORKSHOP", status: "ACTIVE" } } }, select: { id: true } })
 .then(row => { if (!row) { console.error("✗ Activa WORKSHOP para esta organización en Reymen Admin de TEST antes de continuar."); process.exitCode = 1; } })
 .finally(() => p.$disconnect());
' "$organization_id"; then
  exit 1
fi

read -r -s -p "Contraseña privada para abrir el sitio de TEST (mínimo 12 caracteres): " site_password
echo
if [ "${#site_password}" -lt 12 ]; then
  echo "✗ Usa una contraseña de al menos 12 caracteres" >&2
  exit 1
fi
umask 077
printf 'wolf:%s\n' "$(printf '%s' "$site_password" | openssl passwd -apr1 -stdin)" > .wolf-site.htpasswd
unset site_password
nginx_gid="$(sudo docker run --rm nginx:alpine id -g nginx)"
chown root:"$nginx_gid" .wolf-site.htpasswd
chmod 640 .wolf-site.htpasswd

python3 - "$organization_id" "$domain" <<'PY'
import os, stat, sys, tempfile
from pathlib import Path

path = Path('.env.test')
if path.is_symlink():
    raise SystemExit('✗ .env.test no debe ser un enlace simbólico')
org_id, domain = sys.argv[1:]
values = {
    'TEST_WOLF_DOMAIN': domain,
    'WORKSHOP_WOLF_SITE_ORIGIN': f'https://{domain}',
    'WORKSHOP_WOLF_ORG_ID': org_id,
    'WORKSHOP_WOLF_LANDING_ENABLED': 'true',
}
lines = [line for line in path.read_text().splitlines() if line.split('=', 1)[0] not in values]
lines.extend(f'{key}={value}' for key, value in values.items())
original = path.stat()
fd, temp_name = tempfile.mkstemp(prefix='.env.test.wolf-', dir='.')
try:
    with os.fdopen(fd, 'w') as output:
        output.write('\n'.join(lines) + '\n')
    os.chown(temp_name, original.st_uid, original.st_gid)
    os.chmod(temp_name, stat.S_IMODE(original.st_mode))
    os.replace(temp_name, path)
finally:
    if os.path.exists(temp_name):
        os.unlink(temp_name)
PY

tcompose up -d app wolf-site
wait_healthy
echo "✓ Sitio privado configurado: https://$domain"
echo "  Usuario: wolf. Usa la contraseña que acabas de elegir. El certificado TLS puede tardar unos minutos."
