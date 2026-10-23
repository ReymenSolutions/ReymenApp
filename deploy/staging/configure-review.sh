#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
target="$root/.env.staging"
[[ -f "$target" && ! -L "$target" ]] || { echo 'Falta archivo regular .env.staging'; exit 1; }
[[ -w "$target" ]] || { echo 'Ejecuta como el propietario del checkout'; exit 1; }
exec 9>>"$target"
flock -n 9 || { echo 'Otra configuración está en curso'; exit 1; }
if grep -Eq '^STAGING_MARK_(MODEL|ANTHROPIC_API_KEY)=' "$target"; then
  echo 'La configuración privada ya existe. No se sobrescribió ni mostró la clave.'; exit 1
fi
read -r -p 'Modelo exacto (por ejemplo, claude-sonnet-5-5): ' review_model
[[ "$review_model" =~ ^[a-zA-Z0-9._-]{1,120}$ ]] || { echo 'Modelo inválido'; exit 1; }
read -r -s -p 'Pega la API key dedicada a staging (no se mostrará): ' review_key
printf '\n'
[[ "$review_key" =~ ^sk-ant-[a-zA-Z0-9_-]+$ ]] || { unset review_key; echo 'Formato de clave inválido'; exit 1; }
umask 077
chmod 600 "$target"
printf '\nSTAGING_MARK_MODEL=%s\nSTAGING_MARK_ANTHROPIC_API_KEY=%s\n' "$review_model" "$review_key" >&9
unset review_key
echo 'Configuración guardada sin activar servicios ni llamar a Anthropic.'
