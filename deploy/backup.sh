#!/usr/bin/env bash
# Respaldo de la base de ReymenApp: pg_dump comprimido (formato custom), rotación local y, si se configura, copia FUERA del VPS.
#   sudo /home/emilianorm/reymen-ai-ops-preview/deploy/backup.sh
# Variables opcionales (en el entorno o en /etc/reymen-backup.env):
#   DB_CONTAINER      contenedor de Postgres (por defecto reymen-ai-ops-preview-postgres)
#   BACKUP_KEEP_DAYS  días que se conservan en el VPS (por defecto 14)
#   BACKUP_REMOTE     destino externo. Dos formas:
#                       rclone:<remoto>:<carpeta>      (p. ej. rclone:b2:reymen-backups)  → requiere rclone configurado
#                       scp:usuario@host:/ruta/        → requiere llave SSH sin contraseña
# Sin BACKUP_REMOTE el respaldo queda solo en este servidor (y el script avisa).
set -euo pipefail

[ -f /etc/reymen-backup.env ] && . /etc/reymen-backup.env
repo="$(cd "$(dirname "$0")/.." && pwd)"
db_container="${DB_CONTAINER:-reymen-ai-ops-preview-postgres}"
keep_days="${BACKUP_KEEP_DAYS:-14}"
dir="$repo/backups"
mkdir -p "$dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$dir/diario-$stamp.dump"

# Usuario y base se leen del propio contenedor (no se guardan secretos en el host).
docker exec "$db_container" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file.partial"
mv "$file.partial" "$file"
size="$(stat -c %s "$file")"
if [ "$size" -lt 10240 ]; then echo "✗ El respaldo pesa $size bytes: algo salió mal." >&2; exit 1; fi
echo "✓ Respaldo local: $file ($size bytes)"

# Configuración del servidor (compose, .env, nginx): es lo único que NO está en el repositorio. Va CIFRADA (aes-256) porque
# contiene secretos; la contraseña vive en /etc/reymen-backup.pass (modo 600) y debes guardarla también en tu gestor de contraseñas.
config_file=""
if [ -f /etc/reymen-backup.pass ]; then
  config_file="$dir/config-$stamp.tar.gz.enc"
  # shellcheck disable=SC2046
  tar -czf - -C "$repo" $(cd "$repo" && ls docker/docker-compose.preview.yml .env .env.preview .env.n8n docker/nginx.conf 2>/dev/null) \
    | openssl enc -aes-256-cbc -pbkdf2 -salt -pass file:/etc/reymen-backup.pass -out "$config_file"
  echo "✓ Configuración cifrada: $config_file"
else
  echo "⚠ Falta /etc/reymen-backup.pass: la configuración del servidor (compose y .env) NO se respalda. Ver docs/DEPLOY.md." >&2
fi

ship() {
  case "${BACKUP_REMOTE:-}" in
    rclone:*) rclone copy "$1" "${BACKUP_REMOTE#rclone:}" ;;
    scp:*) scp -q -o BatchMode=yes "$1" "${BACKUP_REMOTE#scp:}" ;;
    *) return 1 ;;
  esac
}
case "${BACKUP_REMOTE:-}" in
  rclone:*|scp:*)
    ship "$file" && echo "✓ Respaldo copiado fuera del VPS (${BACKUP_REMOTE})"
    if [ -n "$config_file" ]; then ship "$config_file" && echo "✓ Configuración copiada fuera del VPS"; fi ;;
  "") echo "⚠ BACKUP_REMOTE no está configurado: este respaldo vive SOLO en este servidor." >&2 ;;
  *) echo "✗ BACKUP_REMOTE no reconocido: usa rclone:<remoto>:<carpeta> o scp:usuario@host:/ruta/" >&2; exit 1 ;;
esac

# Aviso de "todo bien" a un monitor externo (p. ej. Healthchecks.io): si un día no llega, el monitor te avisa por correo.
# Define HEALTHCHECK_BACKUP_URL en /etc/reymen-backup.env. Sin esto, un respaldo que deja de correr pasaría desapercibido.
if [ -n "${HEALTHCHECK_BACKUP_URL:-}" ]; then curl -fsS -m 15 --retry 3 -o /dev/null "$HEALTHCHECK_BACKUP_URL" || echo "⚠ No se pudo avisar al monitor de respaldos" >&2; fi

# Rotación local: solo los diarios (los "antes-de-migrar-*" los gestiona update.sh).
find "$dir" \( -name 'diario-*.dump' -o -name 'config-*.tar.gz.enc' \) -mtime +"$keep_days" -delete
