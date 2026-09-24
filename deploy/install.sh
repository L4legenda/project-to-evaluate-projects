#!/usr/bin/env bash
#
# Установка Pitchroom на сервер (Linux с systemd: Ubuntu 22.04+/Debian 12+).
#
# Запуск из каталога проекта (там, где лежит package.json):
#
#   sudo ./deploy/install.sh
#
# Скрипт: поставит Node.js 22 (если его нет), соберёт проект (если нужно),
# разложит его в PITCHROOM_APP_DIR, создаст /etc/pitchroom.env,
# поставит и запустит systemd-службу, проверит, что страница входа отвечает.
#
# Настройки (переменные окружения):
#   PITCHROOM_APP_DIR=/opt/pitchroom     куда установить
#   PITCHROOM_PORT=3000                  порт приложения
#   PITCHROOM_HOST=127.0.0.1             адрес прослушивания
#   PITCHROOM_ENV_FILE=/etc/pitchroom.env
#   PITCHROOM_SERVICE=pitchroom          имя systemd-службы
#   PITCHROOM_USER=                      запускать от этого пользователя (по умолчанию root)
#   PITCHROOM_NODE_VERSION=22.23.2       версия Node для автоустановки
#   PITCHROOM_SKIP_NODE=1                не ставить Node автоматически
#   PITCHROOM_SKIP_DEPS=1                не запускать npm ci / build
set -euo pipefail

APP_DIR="${PITCHROOM_APP_DIR:-/opt/pitchroom}"
PORT="${PITCHROOM_PORT:-3000}"
HOST="${PITCHROOM_HOST:-127.0.0.1}"
ENV_FILE="${PITCHROOM_ENV_FILE:-/etc/pitchroom.env}"
SERVICE="${PITCHROOM_SERVICE:-pitchroom}"
SERVICE_USER="${PITCHROOM_USER:-}"
NODE_VERSION="${PITCHROOM_NODE_VERSION:-22.23.2}"

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log()  { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Нужны права root: sudo $0"
command -v systemctl >/dev/null 2>&1 || die "Не найден systemctl — этот скрипт для systemd-систем. См. deploy/README.md, раздел про tmux/pm2."

# --- 1. Node.js 22 -----------------------------------------------------------
node_major_minor() {
  local bin="$1" v
  command -v "$bin" >/dev/null 2>&1 || return 1
  v="$("$bin" -v 2>/dev/null)" || return 1
  v="${v#v}"
  printf '%s %s' "${v%%.*}" "$(printf '%s' "$v" | cut -d. -f2)"
}

node_is_ok() {
  local info major minor
  info="$(node_major_minor node)" || return 1
  major="${info% *}"; minor="${info#* }"
  [ "$major" -gt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 13 ]; }
}

install_node() {
  local arch tarball url tmp
  case "$(uname -m)" in
    x86_64|amd64) arch="linux-x64" ;;
    aarch64|arm64) arch="linux-arm64" ;;
    *) die "Неизвестная архитектура $(uname -m) — поставьте Node.js 22+ вручную." ;;
  esac
  tarball="node-v${NODE_VERSION}-${arch}.tar.xz"
  url="https://nodejs.org/dist/v${NODE_VERSION}/${tarball}"
  tmp="$(mktemp -d)"

  command -v curl >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq curl; }
  log "Скачиваю Node.js ${NODE_VERSION} (${arch})"
  curl -fsSL --retry 5 --retry-all-errors -o "$tmp/$tarball" "$url" \
    || die "Не удалось скачать $url"
  curl -fsSL --retry 5 --retry-all-errors -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" || true
  if [ -f "$tmp/SHASUMS256.txt" ]; then
    (cd "$tmp" && grep " ${tarball}\$" SHASUMS256.txt | sha256sum -c - >/dev/null) \
      || die "Контрольная сумма Node.js не совпала"
  fi

  mkdir -p /opt/node22
  tar -xJf "$tmp/$tarball" -C /opt/node22 --strip-components=1
  ln -sf /opt/node22/bin/node /usr/local/bin/node
  ln -sf /opt/node22/bin/npm  /usr/local/bin/npm
  ln -sf /opt/node22/bin/npx  /usr/local/bin/npx
  rm -rf "$tmp"
  log "Node.js установлен: $(node -v)"
}

if [ "${PITCHROOM_SKIP_NODE:-0}" != "1" ]; then
  if node_is_ok; then
    log "Node.js уже есть: $(node -v)"
  else
    install_node
  fi
fi
node_is_ok || die "Нужен Node.js 22.13 или новее."

# --- 2. Сборка и зависимости -------------------------------------------------
if [ "${PITCHROOM_SKIP_DEPS:-0}" != "1" ] && [ -f "$SOURCE_DIR/package.json" ] \
   && [ ! -f "$SOURCE_DIR/dist/server/index.js" ]; then
  command -v npm >/dev/null 2>&1 || die "Не найден npm"
  if [ ! -d "$SOURCE_DIR/node_modules" ]; then
    log "Устанавливаю зависимости (npm ci)"
    (cd "$SOURCE_DIR" && npm ci --no-audit --no-fund)
  fi
  log "Собираю production-версию (npm run build)"
  (cd "$SOURCE_DIR" && npm run build)
fi

if [ ! -f "$SOURCE_DIR/dist/server/index.js" ]; then
  die "Нет сборки: $SOURCE_DIR/dist/server/index.js.
Соберите проект локально (npm run build) и загрузите каталог dist/,
либо запустите этот скрипт из полного каталога проекта."
fi

if [ ! -d "$SOURCE_DIR/node_modules/wrangler" ]; then
  log "Ставлю wrangler глобально"
  npm install -g --no-audit --no-fund "wrangler@4.92.0" >/dev/null
fi

# --- 3. Раскладка приложения -------------------------------------------------
if [ "$SOURCE_DIR" = "$APP_DIR" ]; then
  log "Проект уже в $APP_DIR — сборка на месте"
else
  log "Копирую в $APP_DIR"
  mkdir -p "$APP_DIR"
  rm -rf "$APP_DIR/dist"
  cp -R "$SOURCE_DIR/dist" "$APP_DIR/dist"
  cp "$SOURCE_DIR/deploy/start.sh" "$APP_DIR/start.sh"
  cp "$SOURCE_DIR/deploy/pitchroom.service" "$APP_DIR/pitchroom.service"
  mkdir -p "$APP_DIR/deploy"
  cp "$SOURCE_DIR/deploy/README.md" "$APP_DIR/deploy/README.md" 2>/dev/null || true
  cp "$SOURCE_DIR/deploy/apache-pitchroom.conf" "$APP_DIR/deploy/" 2>/dev/null || true
  cp "$SOURCE_DIR/deploy/nginx-pitchroom.conf" "$APP_DIR/deploy/" 2>/dev/null || true
fi
chmod +x "$APP_DIR/start.sh"
# Служебные файлы macOS ломают запуск workerd.
find "$APP_DIR/dist" -name '._*' -delete 2>/dev/null || true

# --- 4. Логин и пароль админ-панели -----------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  log "Создаю $ENV_FILE (логин и пароль по умолчанию: admin / admin)"
  {
    echo "ADMIN_LOGIN=admin"
    echo "ADMIN_PASSWORD=admin"
    echo "ADMIN_SESSION_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    echo "PITCHROOM_HOST=${HOST}"
    echo "PITCHROOM_PORT=${PORT}"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  log "Файл $ENV_FILE уже есть — оставляю без изменений"
  if ! grep -q '^ADMIN_SESSION_SECRET=.\+' "$ENV_FILE"; then
    sed -i "s|^ADMIN_SESSION_SECRET=.*|ADMIN_SESSION_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')|" "$ENV_FILE"
    log "Сгенерировал ADMIN_SESSION_SECRET"
  fi
  grep -q '^PITCHROOM_PORT=' "$ENV_FILE" || echo "PITCHROOM_PORT=${PORT}" >> "$ENV_FILE"
fi

# --- 5. systemd --------------------------------------------------------------
log "Ставлю systemd-службу $SERVICE"
UNIT_TMP="$(mktemp)"
sed -e "s|/opt/pitchroom|$APP_DIR|g" -e "s|/etc/pitchroom.env|$ENV_FILE|g" \
    "$SOURCE_DIR/deploy/pitchroom.service" > "$UNIT_TMP"
if [ -n "$SERVICE_USER" ]; then
  if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then die "Пользователь $SERVICE_USER не существует"; fi
  sed -i "/^\[Service\]/a User=$SERVICE_USER\nGroup=$(id -gn "$SERVICE_USER")" "$UNIT_TMP"
  chown -R "$SERVICE_USER":"$(id -gn "$SERVICE_USER")" "$APP_DIR" "$ENV_FILE"
fi
install -m 644 "$UNIT_TMP" "/etc/systemd/system/${SERVICE}.service"
rm -f "$UNIT_TMP"

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1 || true
systemctl restart "$SERVICE"

# --- 6. Проверка -------------------------------------------------------------
log "Жду ответа приложения на http://${HOST}:${PORT}/admin/login"
ok=""
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null -m 5 "http://${HOST}:${PORT}/admin/login" 2>/dev/null; then ok=1; break; fi
  if ! systemctl is-active --quiet "$SERVICE"; then
    warn "Служба остановилась. Журнал: journalctl -u $SERVICE -n 50 --no-pager"
    break
  fi
  sleep 3
done

if [ -n "$ok" ]; then
  log "Готово. Приложение отвечает на http://${HOST}:${PORT}"
else
  warn "Приложение пока не ответило. Смотрите: journalctl -u $SERVICE -n 80 --no-pager"
fi

cat <<TEXT

Дальше осталось поставить прокси перед приложением:

  Apache:  deploy/apache-pitchroom.conf  -> /etc/apache2/sites-available/
  nginx:   deploy/nginx-pitchroom.conf   -> /etc/nginx/sites-available/

Логин и пароль админ-панели: ${ENV_FILE} (сейчас admin / admin)
Данные (группы, оценки, PDF): ${APP_DIR}/.wrangler/state
Журнал: journalctl -u ${SERVICE} -f
Обновление: загрузить новый dist/ и выполнить systemctl restart ${SERVICE}

TEXT
