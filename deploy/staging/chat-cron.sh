#!/usr/bin/env bash
set -euo pipefail
[[ "$EUID" -eq 0 ]] || { echo 'Ejecuta con sudo para configurar el cron exclusivo de staging'; exit 1; }
case "${1:-}" in
  install)
    command -v docker >/dev/null
    [[ -d /etc/cron.d ]] || { echo 'Falta cron en el VPS'; exit 1; }
    task_cron=$(mktemp /etc/cron.d/.reymen-mark-staging.XXXXXX)
    trap 'rm -f "$task_cron"' EXIT
    printf '%s\n' 'SHELL=/bin/sh' 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' '* * * * * root docker exec reymen-mark-staging-app-1 node deploy/staging/chat-tick.mjs' > "$task_cron"
    chmod 644 "$task_cron"
    mv "$task_cron" /etc/cron.d/reymen-mark-staging
    echo 'Recuperación de Lía en staging configurada cada minuto'
    ;;
  *) echo 'Uso: sudo bash deploy/staging/chat-cron.sh install'; exit 1 ;;
esac
