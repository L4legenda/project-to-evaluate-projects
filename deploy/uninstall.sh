#!/usr/bin/env bash
#
# Удаление Pitchroom с сервера.
#
#   sudo ./deploy/uninstall.sh              # остановит и удалит службу, данные оставит
#   sudo PITCHROOM_REMOVE_DATA=1 ./deploy/uninstall.sh   # удалит и данные
#
# Переменные: PITCHROOM_APP_DIR, PITCHROOM_SERVICE, PITCHROOM_ENV_FILE
set -euo pipefail

APP_DIR="${PITCHROOM_APP_DIR:-/opt/pitchroom}"
SERVICE="${PITCHROOM_SERVICE:-pitchroom}"
ENV_FILE="${PITCHROOM_ENV_FILE:-/etc/pitchroom.env}"

log() { printf '\033[1;35m==>\033[0m %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Нужны права root: sudo $0" >&2; exit 1; }

if systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE}.service"; then
  log "Останавливаю и удаляю службу $SERVICE"
  systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/${SERVICE}.service"
  systemctl daemon-reload
else
  log "Служба $SERVICE не найдена"
fi

if [ "${PITCHROOM_REMOVE_DATA:-0}" = "1" ]; then
  log "Удаляю $APP_DIR (вместе с данными) и $ENV_FILE"
  rm -rf "$APP_DIR" "$ENV_FILE"
else
  log "Каталог $APP_DIR оставлен (данные в $APP_DIR/.wrangler/state)"
  log "Чтобы удалить полностью: rm -rf $APP_DIR $ENV_FILE"
fi
