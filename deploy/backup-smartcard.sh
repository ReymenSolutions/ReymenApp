#!/usr/bin/env bash
# Respaldo de SmartCard (Supabase) hacia Backblaze B2: base de datos (public, auth, storage) + archivos del Storage.
#   sudo /home/emilianorm/reymen-ai-ops-preview/deploy/backup-smartcard.sh
# Requiere en /etc/reymen-backup.env:
#   BACKUP_REMOTE=rclone:b2:reymen-backups          (el mismo destino del respaldo principal)
#   SMARTCARD_DB_URL="postgresql://postgres.<ref>:<clave>@<host-pooler>:5432/postgres"   (Session pooler de Supabase)
# y un remoto rclone llamado "supa" (S3 de Supabase Storage). Ver docs/DEPLOY.md.
# Los archivos se COPIAN (nunca se sincroniza con borrado): si alguien borra un archivo en Supabase, la copia en B2 se conserva.
set -euo pipefail

[ -f /etc/reymen-backup.env ] && . /etc/reymen-backup.env
case "${BACKUP_REMOTE:-}" in rclone:*) dest="${BACKUP_REMOTE#rclone:}" ;; *) echo "✗ Este script necesita BACKUP_REMOTE=rclone:..." >&2; exit 1 ;; esac
repo="$(cd "$(dirname "$0")/.." && pwd)"
dir="$repo/backups"; mkdir -p "$dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

# ── 1. Base de datos de SmartCard ──────────────────────────────────────────────────────────────
if [ -n "${SMARTCARD_DB_URL:-}" ]; then
  file="$dir/smartcard-db-$stamp.dump"
  # Se usa un cliente de Postgres dentro de Docker (versión nueva: sirve para servidores más viejos); la clave no queda en argumentos.
  docker run --rm -e PGURL="$SMARTCARD_DB_URL" postgres:17-alpine sh -c 'pg_dump "$PGURL" -Fc --no-owner --no-privileges -n public -n auth -n storage' > "$file.partial"
  mv "$file.partial" "$file"
  size="$(stat -c %s "$file")"
  [ "$size" -ge 2048 ] || { echo "✗ El respaldo de la base de SmartCard pesa $size bytes: algo salió mal." >&2; exit 1; }
  rclone copy "$file" "$dest/smartcard-db"
  echo "✓ Base de SmartCard respaldada ($size bytes) → $dest/smartcard-db"
  find "$dir" -name 'smartcard-db-*.dump' -mtime +14 -delete
else
  echo "⚠ SMARTCARD_DB_URL no está configurado: se omite la base de datos de SmartCard." >&2
fi

# ── 2. Archivos del Storage (todos los buckets) ────────────────────────────────────────────────
if rclone listremotes | grep -qx 'supa:'; then
  rclone copy supa: "$dest/smartcard-storage" --transfers 4 --checksum --fast-list
  echo "✓ Archivos de Supabase Storage copiados → $dest/smartcard-storage"
else
  echo "⚠ No existe el remoto rclone 'supa': se omiten los archivos del Storage." >&2
fi

if [ -n "${HEALTHCHECK_SMARTCARD_URL:-}" ]; then curl -fsS -m 15 --retry 3 -o /dev/null "$HEALTHCHECK_SMARTCARD_URL" || true; fi
