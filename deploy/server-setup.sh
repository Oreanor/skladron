#!/usr/bin/env bash
# Разовая подготовка домашнего сервера под складрон. Запускать на сервере через sudo:
#   ssh -t user@host 'sudo bash -s' < deploy/server-setup.sh
# Повторный запуск безопасен: папку, юниты и блок Caddy он не дублирует.
#
# Что делает:
#   - /srv/skladron (владелец — тот, кто выкладывает, чтобы npm run deploy шёл
#     без sudo): releases/ и shared/ (shared/.env — секреты сервера);
#   - юнит skladron: Next (standalone) из current/server.js от этого
#     пользователя на 127.0.0.1:3120, перезапуск при любом выходе (так
#     выкладка подменяет код);
#   - таймер skladron-income: раз в сутки в 00:05 UTC зовёт /api/cron/income
#     (на Vercel это делал cron из vercel.json);
#   - маршрут Caddy: /skladron и всё под ним — в игру (префикс не срезаем,
#     Next собран с basePath /skladron).
set -euo pipefail

owner=${SUDO_USER:?run through sudo}
home=$(getent passwd "$owner" | cut -d: -f6)
root=/srv/skladron
port=3120
base=/skladron
caddyfile=/etc/caddy/Caddyfile
marker='# skladron'

node=$(ls -1d "$home"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -n 1)
[ -x "$node" ] || { echo "no node under $home/.nvm" >&2; exit 1; }
command -v curl >/dev/null || { echo "curl is needed for the income timer" >&2; exit 1; }

install -d -o "$owner" -g "$owner" -m 755 "$root" "$root/releases"
install -d -o "$owner" -g "$owner" -m 700 "$root/shared"
[ -f "$root/shared/.env" ] || install -o "$owner" -g "$owner" -m 600 /dev/null "$root/shared/.env"

cat > /etc/systemd/system/skladron.service.new <<EOF
[Unit]
Description=Skladron (Next.js)
After=network-online.target
Wants=network-online.target
# Выкладка перезапускает его нарочно, а до первой выкладки запускать нечего:
# никогда не сдаёмся, как при падении в цикле.
StartLimitIntervalSec=0

[Service]
Type=simple
User=$owner
WorkingDirectory=$root/shared
EnvironmentFile=$root/shared/.env
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
Environment=PORT=$port
ExecStart=$node $root/current/server.js
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
mv /etc/systemd/system/skladron.service.new /etc/systemd/system/skladron.service

cat > /etc/systemd/system/skladron-income.service.new <<EOF
[Unit]
Description=Skladron daily income shipment
After=skladron.service

[Service]
Type=oneshot
User=$owner
EnvironmentFile=$root/shared/.env
ExecStart=/bin/sh -c 'curl -fsS --max-time 600 -H "Authorization: Bearer \$\$CRON_SECRET" http://127.0.0.1:$port$base/api/cron/income'
EOF
mv /etc/systemd/system/skladron-income.service.new /etc/systemd/system/skladron-income.service

cat > /etc/systemd/system/skladron-income.timer.new <<'EOF'
[Unit]
Description=Skladron daily income shipment (00:05 UTC)

[Timer]
OnCalendar=*-*-* 00:05:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
EOF
mv /etc/systemd/system/skladron-income.timer.new /etc/systemd/system/skladron-income.timer

systemctl daemon-reload
systemctl enable --now skladron.service skladron-income.timer

if ! grep -qF "$marker" "$caddyfile"; then
  cp "$caddyfile" "$caddyfile.bak-skladron-$(date +%Y%m%d%H%M%S)"
  block=$(cat <<'EOF'
	# skladron — Next.js (standalone) on 127.0.0.1:3120, built with basePath /skladron.
	# Deploy: npm run deploy in the game's repository.
	@skladron path /skladron /skladron/*
	handle @skladron {
		encode zstd gzip
		reverse_proxy 127.0.0.1:3120
	}
EOF
)
  # Перед общим `handle {` в конце, как у других игр.
  awk -v block="$block" '
    !done && /^\thandle \{/ { print block; done = 1 }
    { print }
    END { if (!done) exit 1 }
  ' "$caddyfile" > "$caddyfile.new" || { echo 'no catch-all "handle {" found in Caddyfile' >&2; rm -f "$caddyfile.new"; exit 1; }
  caddy validate --adapter caddyfile --config "$caddyfile.new"
  chmod 644 "$caddyfile.new"
  mv "$caddyfile.new" "$caddyfile"
fi

systemctl reload caddy
echo "ready: $root owned by $owner, skladron enabled (retries until the first deploy brings current/server.js), income timer at 00:05 UTC, Caddy serves $base"
echo "next: put server secrets into $root/shared/.env (SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, CRON_SECRET)"
