#!/usr/bin/env bash
#
# Публикация Pitchroom на сервере.
#
# Локально собирает production-версию, загружает её на сервер и перезапускает
# systemd-службу pitchroom. Данные (группы, оценки и PDF) лежат на сервере в
# /opt/pitchroom/.wrangler/state и при обновлении не трогаются.
#
# Использование:
#   PITCHROOM_SSH_PASSWORD='пароль root' ./deploy/deploy.sh
#   PITCHROOM_HOST=130.49.178.118 PITCHROOM_USER=root ./deploy/deploy.sh
#
# Параметры (переменные окружения):
#   PITCHROOM_HOST           адрес сервера         (по умолчанию 130.49.178.118)
#   PITCHROOM_USER           пользователь SSH      (по умолчанию root)
#   PITCHROOM_SSH_PASSWORD   пароль SSH            (спросим, если не задан)
#   PITCHROOM_PORT           порт приложения       (по умолчанию 80)
#   PITCHROOM_APP_DIR        каталог на сервере    (по умолчанию /opt/pitchroom)
#   PITCHROOM_SKIP_BUILD=1   не пересобирать проект
set -euo pipefail

HOST="${PITCHROOM_HOST:-130.49.178.118}"
SSH_USER="${PITCHROOM_USER:-root}"
APP_DIR="${PITCHROOM_APP_DIR:-/opt/pitchroom}"
PORT="${PITCHROOM_PORT:-80}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${PITCHROOM_SSH_PASSWORD:-}" ]; then
  read -r -s -p "Пароль SSH для ${SSH_USER}@${HOST}: " PITCHROOM_SSH_PASSWORD
  echo
fi
export PITCHROOM_SSH_PASSWORD

WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# ssh/scp получают пароль через SSH_ASKPASS — работает и в терминале, и из скрипта.
cat > "$WORK/askpass.sh" <<ASKPASS
#!/bin/sh
printf '%s\n' "\$PITCHROOM_SSH_PASSWORD"
ASKPASS
chmod +x "$WORK/askpass.sh"
export SSH_ASKPASS="$WORK/askpass.sh" SSH_ASKPASS_REQUIRE=force DISPLAY=:0
SSH_OPTS=(-4 -o ControlMaster=no -o ControlPath=none -o StrictHostKeyChecking=accept-new
  -o UserKnownHostsFile="$WORK/known_hosts" -o PreferredAuthentications=password
  -o PubkeyAuthentication=no -o NumberOfPasswordPrompts=1 -o ConnectTimeout=15
  -o ServerAliveInterval=15 -o ServerAliveCountMax=10)

retry() {
  local attempt=1
  until "$@"; do
    if [ "$attempt" -ge 8 ]; then
      echo "Не удалось выполнить: $*" >&2
      return 1
    fi
    echo "  …попытка $attempt не удалась, повторяем" >&2
    attempt=$((attempt + 1))
    sleep 4
  done
}

remote() {
  retry ssh "${SSH_OPTS[@]}" "${SSH_USER}@${HOST}" "$1"
}

if [ "${PITCHROOM_SKIP_BUILD:-0}" != "1" ]; then
  echo "==> Сборка production-версии"
  (cd "$SOURCE_DIR" && npm run build)
fi

echo "==> Подготовка пакета"
STAGE="$WORK/stage"
mkdir -p "$STAGE"
cp -R "$SOURCE_DIR/dist" "$STAGE/dist"
cp "$SOURCE_DIR/deploy/start.sh" "$STAGE/start.sh"
cp "$SOURCE_DIR/deploy/pitchroom.service" "$STAGE/pitchroom.service"

BUNDLE="$WORK/pitchroom.tar.gz"
# Служебные файлы macOS (._*) и расширенные атрибуты ломают запуск workerd:
# он считает ._*-файлы JS-модулями и падает с SyntaxError.
TAR_OPTS=(czf "$BUNDLE" --exclude '._*' --exclude '.DS_Store')
PROBE="$WORK/probe"
mkdir -p "$PROBE" && : > "$PROBE/f"
if (cd "$PROBE" && tar cf "$WORK/probe.tar" --no-xattrs f) 2>/dev/null; then
  TAR_OPTS+=(--no-xattrs)
fi
COPYFILE_DISABLE=1 tar "${TAR_OPTS[@]}" -C "$STAGE" .

echo "==> Загрузка на ${HOST}"
retry scp "${SSH_OPTS[@]}" "$BUNDLE" "${SSH_USER}@${HOST}:/tmp/pitchroom.tar.gz"

echo "==> Установка на сервере"
remote "set -e
rm -rf ${APP_DIR}.new && mkdir -p ${APP_DIR}.new
tar xzf /tmp/pitchroom.tar.gz -C ${APP_DIR}.new 2>/dev/null
test -f ${APP_DIR}.new/dist/server/index.js && test -f ${APP_DIR}.new/start.sh
mkdir -p ${APP_DIR}
rm -rf ${APP_DIR}/dist ${APP_DIR}/start.sh ${APP_DIR}/pitchroom.service
cp -R ${APP_DIR}.new/dist ${APP_DIR}/dist
cp ${APP_DIR}.new/start.sh ${APP_DIR}/start.sh
cp ${APP_DIR}.new/pitchroom.service ${APP_DIR}/pitchroom.service
chmod +x ${APP_DIR}/start.sh
find ${APP_DIR}/dist -name '._*' -delete 2>/dev/null || true
rm -rf ${APP_DIR}.new /tmp/pitchroom.tar.gz
install -m 644 ${APP_DIR}/pitchroom.service /etc/systemd/system/pitchroom.service
if [ ! -f /etc/pitchroom.env ]; then
  printf 'ADMIN_LOGIN=admin\nADMIN_PASSWORD=admin\nADMIN_SESSION_SECRET=%s\n' \"\$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')\" > /etc/pitchroom.env
  chmod 600 /etc/pitchroom.env
fi
systemctl daemon-reload
systemctl enable pitchroom >/dev/null 2>&1 || true
systemctl restart pitchroom
echo '--- состояние ---'
systemctl is-active pitchroom"

echo "==> Проверка доступности"
for i in $(seq 1 20); do
  code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "http://${HOST}:${PORT}/admin/login" || true)"
  if [ "$code" = "200" ]; then
    echo "Готово: http://${HOST}:${PORT}/admin  (вход: admin / admin)"
    exit 0
  fi
  sleep 3
done
echo "Сервис запущен, но http://${HOST}:${PORT}/admin/login не ответил 200." >&2
echo "Посмотрите журнал: ssh ${SSH_USER}@${HOST} 'journalctl -u pitchroom -n 80 --no-pager'" >&2
exit 1
