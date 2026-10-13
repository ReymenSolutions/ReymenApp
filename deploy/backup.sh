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

case "${BACKUP_REMOTE:-}" in
  rclone:*) rclone copy "$file" "${BACKUP_REMOTE#rclone:}" && echo "✓ Copiado fuera del VPS (${BACKUP_REMOTE})" ;;
  scp:*) scp -q -o BatchMode=yes "$file" "${BACKUP_REMOTE#scp:}" && echo "✓ Copiado fuera del VPS (${BACKUP_REMOTE})" ;;
  "") echo "⚠ BACKUP_REMOTE no está configurado: este respaldo vive SOLO en este servidor." >&2 ;;
  *) echo "✗ BACKUP_REMOTE no reconocido: usa rclone:<remoto>:<carpeta> o scp:usuario@host:/ruta/" >&2; exit 1 ;;
esac

# Rotación local: solo los diarios (los "antes-de-migrar-*" los gestiona update.sh).
find "$dir" -name 'diario-*.dump' -mtime +"$keep_days" -delete
