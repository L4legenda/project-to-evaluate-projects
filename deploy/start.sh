#!/usr/bin/env bash
# Запуск Pitchroom на сервере: production-сборка в workerd
# (локальные биндинги Cloudflare D1 + R2, данные — в ./wrangler-state).
set -euo pipefail

APP_DIR="${PITCHROOM_APP_DIR:-/opt/pitchroom}"
NODE_BIN="${PITCHROOM_NODE_BIN:-/opt/node22/bin/node}"
WRANGLER_JS="${PITCHROOM_WRANGLER_JS:-/opt/node22/lib/node_modules/wrangler/bin/wrangler.js}"
PORT="${PITCHROOM_PORT:-80}"

# Необязательный файл с логином/паролем админ-панели:
#   ADMIN_LOGIN=admin
#   ADMIN_PASSWORD=admin
#   ADMIN_SESSION_SECRET=<случайная строка>
ENV_FILE="${PITCHROOM_ENV_FILE:-/etc/pitchroom.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

VARS=()
[ -n "${ADMIN_LOGIN:-}" ] && VARS+=(--var "ADMIN_LOGIN:${ADMIN_LOGIN}")
[ -n "${ADMIN_PASSWORD:-}" ] && VARS+=(--var "ADMIN_PASSWORD:${ADMIN_PASSWORD}")
[ -n "${ADMIN_SESSION_SECRET:-}" ] && VARS+=(--var "ADMIN_SESSION_SECRET:${ADMIN_SESSION_SECRET}")

export WRANGLER_SEND_METRICS=false
export NO_COLOR=1
export CI=1
cd "$APP_DIR"

exec "$NODE_BIN" "$WRANGLER_JS" dev \
  --config "$APP_DIR/dist/server/wrangler.json" \
  --ip 0.0.0.0 \
  --port "$PORT" \
  --persist-to "${PITCHROOM_STATE_DIR:-$APP_DIR/.wrangler/state}" \
  --show-interactive-dev-session=false \
  "${VARS[@]}"
