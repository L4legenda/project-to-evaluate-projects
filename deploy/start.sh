#!/usr/bin/env bash
#
# Запуск Pitchroom на сервере: production-сборка в workerd
# (локальные биндинги Cloudflare D1 + R2, данные — в .wrangler/state).
#
# Запускается вручную или из systemd (см. pitchroom.service).
# Настройки берутся из переменных окружения — их удобно держать в /etc/pitchroom.env:
#
#   ADMIN_LOGIN=admin              логин в админ-панель
#   ADMIN_PASSWORD=admin           пароль в админ-панель
#   ADMIN_SESSION_SECRET=<строка>  секрет подписи cookie сессии
#   PITCHROOM_HOST=127.0.0.1       адрес прослушивания
#   PITCHROOM_PORT=3000            порт
#   PITCHROOM_STATE_DIR=...        каталог с данными (по умолчанию <app>/.wrangler/state)
set -euo pipefail

# Каталог приложения — тот, в котором лежит этот скрипт.
APP_DIR="${PITCHROOM_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
ENV_FILE="${PITCHROOM_ENV_FILE:-/etc/pitchroom.env}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

NODE_BIN="${PITCHROOM_NODE_BIN:-$(command -v node || true)}"
HOST="${PITCHROOM_HOST:-127.0.0.1}"
PORT="${PITCHROOM_PORT:-3000}"
STATE_DIR="${PITCHROOM_STATE_DIR:-$APP_DIR/.wrangler/state}"
CONFIG="$APP_DIR/dist/server/wrangler.json"

# wrangler: сначала локальный из проекта, потом глобальный.
WRANGLER_JS="${PITCHROOM_WRANGLER_JS:-}"
if [ -z "$WRANGLER_JS" ] && [ -f "$APP_DIR/node_modules/wrangler/bin/wrangler.js" ]; then
  WRANGLER_JS="$APP_DIR/node_modules/wrangler/bin/wrangler.js"
fi
if [ -z "$WRANGLER_JS" ]; then
  # Глобальный wrangler может лежать в любом префиксе npm (в т.ч. /opt/node22).
  for root in "$(npm root -g 2>/dev/null || true)" /usr/local/lib/node_modules /usr/lib/node_modules /opt/node22/lib/node_modules; do
    if [ -n "$root" ] && [ -f "$root/wrangler/bin/wrangler.js" ]; then
      WRANGLER_JS="$root/wrangler/bin/wrangler.js"; break
    fi
  done
fi

if [ -z "$NODE_BIN" ]; then
  echo "[pitchroom] Не найден node. Установите Node.js 22+ или задайте PITCHROOM_NODE_BIN." >&2
  exit 1
fi
if [ -z "$WRANGLER_JS" ] && ! command -v wrangler >/dev/null 2>&1; then
  echo "[pitchroom] Не найден wrangler. Выполните: npm install -g wrangler@4.92.0" >&2
  exit 1
fi
if [ ! -f "$CONFIG" ]; then
  echo "[pitchroom] Нет сборки $CONFIG — сначала выполните: npm run build" >&2
  exit 1
fi

# Логин и пароль админ-панели передаём воркеру как переменные окружения.
VARS=()
[ -n "${ADMIN_LOGIN:-}" ] && VARS+=(--var "ADMIN_LOGIN:${ADMIN_LOGIN}")
[ -n "${ADMIN_PASSWORD:-}" ] && VARS+=(--var "ADMIN_PASSWORD:${ADMIN_PASSWORD}")
[ -n "${ADMIN_SESSION_SECRET:-}" ] && VARS+=(--var "ADMIN_SESSION_SECRET:${ADMIN_SESSION_SECRET}")

export WRANGLER_SEND_METRICS=false
export NO_COLOR=1
export CI=1

mkdir -p "$STATE_DIR"
cd "$APP_DIR"

echo "[pitchroom] слушаю http://${HOST}:${PORT} (данные: ${STATE_DIR})"

if [ -n "$WRANGLER_JS" ]; then
  exec "$NODE_BIN" "$WRANGLER_JS" dev \
    --config "$CONFIG" --ip "$HOST" --port "$PORT" \
    --persist-to "$STATE_DIR" --show-interactive-dev-session=false "${VARS[@]}"
fi

exec wrangler dev \
  --config "$CONFIG" --ip "$HOST" --port "$PORT" \
  --persist-to "$STATE_DIR" --show-interactive-dev-session=false "${VARS[@]}"
