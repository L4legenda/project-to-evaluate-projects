# Развёртывание Pitchroom на сервере

Инструкция для любого сервера на Linux с systemd (Ubuntu 22.04+/Debian 12+).
Подходит и для чистого сервера, и для сервера, где уже стоит Apache или nginx.

---

## Как это устроено

```
Интернет → Apache/nginx (порт 80/443) → приложение (127.0.0.1:3000) → workerd
                                                          └── данные в .wrangler/state
```

Приложение — это не обычный Node-сервер. Оно собрано под runtime Cloudflare
Workers и хранит данные в биндингах **D1** (база) и **R2** (файлы PDF). Оба
биндинга эмулирует workerd, поэтому запускать надо **собранный `dist/`** через
`wrangler dev`. Именно это делает `deploy/start.sh`.

Прокси нужен, чтобы отдавать приложение наружу на 80/443 с доменом и HTTPS.
Само приложение слушает только `127.0.0.1` — снаружи этот порт не виден.

### Две вещи, которые важно знать заранее

1. **`vinext start` и `next start` не заработают.** Node-сервер отдаёт воркеру
   пустое окружение без биндингов D1/R2, приложение падает на первом обращении
   к базе (`/api/groups` → 500). Рабочий production — только `wrangler dev` по
   собранному `dist/`.

2. **Не ставьте за прокси dev-сервер (`npm run dev` / `npm run lan`).**
   Dev-сервер обслуживает запросы через Node → undici, а undici запрещает
   заголовок `Upgrade`. Apache с `ProxyPass … upgrade=websocket|any` и nginx с
   `proxy_set_header Upgrade $http_upgrade` пробрасывают его бэкенду, и
   **любой** такой запрос (например, сканер с `Upgrade: h2c`) убивает процесс
   целиком — сайт отдаёт 502/503 до перезапуска. Production-режим из этой
   инструкции от этого не страдает: workerd обрабатывает `Upgrade` сам.

---

## Быстрый старт (скрипт)

```bash
# 1. Положите проект на сервер (git clone или scp) и зайдите в его каталог
cd /opt/pitchroom

# 2. Запустите установщик
sudo ./deploy/install.sh
```

Скрипт сам: поставит Node.js 22 (если его нет), соберёт проект, разложит файлы,
создаст `/etc/pitchroom.env` со случайным секретом сессии, поставит и запустит
службу `pitchroom`, проверит, что страница входа отвечает. Дальше останется
подключить прокси — конфиги ниже.

Полезные переменные:

```bash
sudo PITCHROOM_PORT=8080 PITCHROOM_APP_DIR=/srv/pitchroom ./deploy/install.sh
sudo PITCHROOM_USER=pitchroom ./deploy/install.sh   # запускать не от root
```

---

## Пошагово вручную

### 1. Node.js 22

На чистом сервере:

```bash
cd /tmp
# для x86_64; для ARM (aarch64) замените linux-x64 на linux-arm64
curl -fsSLO https://nodejs.org/dist/v22.23.2/node-v22.23.2-linux-x64.tar.xz
curl -fsSLO https://nodejs.org/dist/v22.23.2/SHASUMS256.txt
grep 'node-v22.23.2-linux-x64.tar.xz' SHASUMS256.txt | sha256sum -c -

sudo mkdir -p /opt/node22
sudo tar -xJf node-v22.23.2-linux-x64.tar.xz -C /opt/node22 --strip-components=1
sudo ln -sf /opt/node22/bin/node /usr/local/bin/node
sudo ln -sf /opt/node22/bin/npm  /usr/local/bin/npm
sudo ln -sf /opt/node22/bin/npx  /usr/local/bin/npx
node -v      # должно быть v22.x
```

Пакет `nodejs` из репозитория Ubuntu ставить не нужно — там версия 18, она
слишком старая.

### 2. Код и сборка

```bash
sudo mkdir -p /opt/pitchroom && cd /opt/pitchroom
# git clone <адрес репозитория> .     либо загрузите файлы через scp/rsync

npm ci                 # зависимости (включая dev — они нужны для сборки)
npm run build          # получается каталог dist/
```

Если сервер слабый (меньше 2 ГБ RAM) — соберите у себя и загрузите только
результат:

```bash
# на своём компьютере
npm run build
rsync -a --delete dist/ root@СЕРВЕР:/opt/pitchroom/dist/
scp deploy/start.sh root@СЕРВЕР:/opt/pitchroom/start.sh
```

macOS-служебные файлы ломают запуск workerd, если их занести на сервер:

```bash
find /opt/pitchroom/dist -name '._*' -delete
```

### 3. Логин и пароль админ-панели

```bash
sudo cp deploy/pitchroom.env.example /etc/pitchroom.env
sudo nano /etc/pitchroom.env        # ADMIN_LOGIN, ADMIN_PASSWORD
sudo chmod 600 /etc/pitchroom.env
```

Если `ADMIN_SESSION_SECRET` оставить пустым, приложение использует значение по
умолчанию — лучше вписать случайную строку:

```bash
head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
```

Логин и пароль по умолчанию — `admin` / `admin`.

### 4. Запуск как фоновой задачи

#### Вариант A — systemd (рекомендуется)

```bash
sudo cp deploy/pitchroom.service /etc/systemd/system/pitchroom.service
sudo systemctl daemon-reload
sudo systemctl enable --now pitchroom

systemctl status pitchroom          # состояние
journalctl -u pitchroom -f          # живой журнал
```

Юнит уже настроен: автозапуск при загрузке (`WantedBy=multi-user.target`),
перезапуск при падении (`Restart=always`), логи в journald. Если ставите не в
`/opt/pitchroom` — поправьте пути `WorkingDirectory`, `ExecStart`,
`EnvironmentFile` в юните.

#### Вариант B — pm2

```bash
sudo npm install -g pm2
sudo pm2 start /opt/pitchroom/start.sh --name pitchroom --interpreter bash
sudo pm2 save
sudo pm2 startup systemd -u root --hp /root    # автозапуск после перезагрузки
sudo pm2 logs pitchroom
```

#### Вариант C — tmux (быстро, но без автозапуска)

Годится, чтобы посмотреть/отладить. После перезагрузки сервера и при падении
приложение само не поднимется.

```bash
sudo apt-get install -y tmux
tmux new -s pitchroom -d 'PITCHROOM_PORT=3000 /opt/pitchroom/start.sh 2>&1 | tee -a /var/log/pitchroom.log'
tmux attach -t pitchroom        # посмотреть, Ctrl+B затем D — выйти
```

Похожий по смыслу запуск без мультиплексора:

```bash
sudo nohup /opt/pitchroom/start.sh > /var/log/pitchroom.log 2>&1 &
```

---

## Apache

Конфиг: [`deploy/apache-pitchroom.conf`](apache-pitchroom.conf).

```bash
sudo a2enmod proxy proxy_http headers rewrite ssl
sudo cp deploy/apache-pitchroom.conf /etc/apache2/sites-available/pitchroom.conf
sudo nano /etc/apache2/sites-available/pitchroom.conf   # ServerName и порт
sudo a2ensite pitchroom
sudo apache2ctl configtest && sudo systemctl reload apache2
```

Что важно в этом конфиге:

- `ProxyPass / http://127.0.0.1:3000/ **retry=0**` — без `retry=0` Apache после
  перезапуска приложения минуту отдаёт 503, не пробуя подключиться снова;
- **нет параметра `upgrade=`** — приложению WebSocket не нужен, а именно
  `upgrade=websocket|any` пробрасывает в бэкенд «неправильный» `Upgrade` и
  роняет dev-сервер (для production это не критично, но и пользы нет);
- `ProxyPreserveHost On` и `RequestHeader set X-Forwarded-Proto` — по этим
  заголовкам приложение включает `Secure`-cookie и строит правильные ссылки;
- `ProxyTimeout 300` и `LimitRequestBody 0` — чтобы проходили загрузки PDF до
  30 МБ на медленных каналах.

Если Apache стоит **не** на том же сервере, что приложение, замените
`127.0.0.1:3000` на внутренний адрес приложения и не открывайте порт наружу.

## nginx

Конфиг: [`deploy/nginx-pitchroom.conf`](nginx-pitchroom.conf).

```bash
sudo cp deploy/nginx-pitchroom.conf /etc/nginx/sites-available/pitchroom.conf
sudo nano /etc/nginx/sites-available/pitchroom.conf     # server_name и порт
sudo ln -s /etc/nginx/sites-available/pitchroom.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Что важно:

- `client_max_body_size 40m` — иначе nginx отдаст 413 на PDF;
- `proxy_request_buffering off` — файл уходит на бэкенд сразу, не оседая целиком
  в памяти/на диске nginx;
- `proxy_buffering off` и таймауты 300 с — корректная отдача потокового SSR и
  длинных загрузок;
- `X-Forwarded-Proto $scheme` — для `Secure`-cookie и ссылок;
- **не добавляйте** блок `map $http_upgrade …` и `proxy_set_header Upgrade` —
  приложению WebSocket не нужен.

## HTTPS

```bash
# Apache
sudo apt-get install -y certbot python3-certbot-apache
sudo certbot --apache -d pitchroom.example.com

# nginx
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pitchroom.example.com
```

Раскомментируйте HTTPS-блок в конфиге прокси (в обоих файлах он есть готовым) —
там уже выставлен `X-Forwarded-Proto: https`, благодаря которому cookie сессии
получает флаг `Secure`.

---

## Обновление версии

Данные при обновлении не трогаются — они лежат в `APP_DIR/.wrangler/state`.

**На сервере:**

```bash
cd /opt/pitchroom
git pull                 # или загрузите новые файлы
npm ci && npm run build
sudo systemctl restart pitchroom
```

**Со своего компьютера** (сборка локально, заливка на сервер): в проекте есть
готовый скрипт [`deploy.sh`](deploy.sh):

```bash
PITCHROOM_SSH_PASSWORD='пароль' PITCHROOM_HOST=СЕРВЕР ./deploy/deploy.sh
```

Он собирает проект, заливает `dist/`, обновляет юнит и перезапускает службу.

## Резервные копии и перенос

```bash
# копия (группы, оценки, все PDF)
sudo tar czf ~/pitchroom-$(date +%F).tar.gz -C /opt/pitchroom .wrangler/state

# восстановление на этом или другом сервере
sudo tar xzf ~/pitchroom-2026-01-01.tar.gz -C /opt/pitchroom
sudo systemctl restart pitchroom
```

## Диагностика

| Симптом | Что смотреть |
|---|---|
| Прокси отдаёт 502/503 | `systemctl status pitchroom`, `journalctl -u pitchroom -n 80 --no-pager` |
| `Unit pitchroom.service could not be found` | юнит не установлен или забыт `systemctl daemon-reload` |
| `Address already in use` | `ss -tlnp \| grep :3000` — порт занят, поменяйте `PITCHROOM_PORT` |
| `Нет сборки …/dist/server/wrangler.json` | не выполнен `npm run build` |
| `Не найден wrangler` | `npm install -g wrangler@4.92.0` |
| Приложение падает при загрузке страницы | проверьте `ADMIN_*` в `/etc/pitchroom.env` и права на `APP_DIR` |
| Сервер тормозит, процессы убиваются | мало RAM: добавьте swap (`fallocate -l 2G /swapfile && mkswap /swapfile && swapon /swapfile`) |
| После заливки с macOS workerd падает на `SyntaxError` | в `dist/` попали файлы `._*` — удалите их: `find dist -name '._*' -delete` |
| Забыли пароль админ-панели | `sudo nano /etc/pitchroom.env`, затем `sudo systemctl restart pitchroom` |

Проверить приложение в обход прокси:

```bash
curl -i http://127.0.0.1:3000/admin/login     # ожидаем 200
curl -i http://127.0.0.1:3000/admin           # ожидаем 307 на /admin/login
```

## Удаление

```bash
sudo ./deploy/uninstall.sh                        # убрать службу, данные оставить
sudo PITCHROOM_REMOVE_DATA=1 ./deploy/uninstall.sh   # убрать вместе с данными
```
