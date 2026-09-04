#!/bin/bash
# Install the Qapture collector on a VPS. Run it FROM YOUR MAC:
#
#   ./server/deploy.sh root@1.2.3.4 [path/to/ssh-key]
#
# ---------------------------------------------------------------------------
# WHAT THIS IS CAREFUL ABOUT, AND WHY
# ---------------------------------------------------------------------------
# This box is not empty. It is expected to be running other things, so this
# script is written on the assumption that breaking one of them is the worst
# outcome available — worse than not installing at all.
#
# Therefore it:
#   * touches nothing outside /opt/qapture-collector and one systemd unit;
#   * NEVER writes to nginx, and never restarts, reloads or reconfigures any
#     service it did not install. It prints the proxy config for you to add
#     yourself, because an automated edit to a working web server is exactly
#     how a live site goes down at midnight;
#   * refuses to overwrite an existing config, so re-running it cannot rotate
#     the tokens out from under sites that are already using them;
#   * binds the service to 127.0.0.1, so nothing is exposed until you
#     deliberately put a proxy in front of it;
#   * installs no packages beyond node, and only if node is missing.
#
# It is safe to run twice: the second run updates the code and leaves the
# config, the data and the tokens exactly as they were.
set -euo pipefail

TARGET="${1:-}"
KEY="${2:-}"
if [ -z "$TARGET" ]; then
    echo "usage: ./server/deploy.sh root@HOST [ssh-key]" >&2
    exit 1
fi

SSH_ARGS=(-o StrictHostKeyChecking=accept-new)
[ -n "$KEY" ] && SSH_ARGS+=(-i "$KEY")

HERE="$(cd "$(dirname "$0")" && pwd)"
APP=/opt/qapture-collector

echo "==> Checking what is already on the box (changing nothing)"
ssh "${SSH_ARGS[@]}" "$TARGET" bash -s <<'PROBE'
set -u
echo "    host:  $(hostname)"
echo "    os:    $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")"
echo "    node:  $(command -v node >/dev/null && node -v || echo 'not installed')"
echo "    nginx: $(command -v nginx >/dev/null && echo present || echo absent)"
echo "    port 8787: $( (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -q ':8787 ' && echo 'IN USE' || echo free)"
echo "    existing install: $([ -d /opt/qapture-collector ] && echo yes || echo no)"
echo "    other services listening:"
(ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | awk 'NR>1{print "      " $4 "  " $NF}' | sort -u | head -15
PROBE

echo
read -r -p "Continue and install into $APP? [y/N] " ok
[ "$ok" = "y" ] || { echo "Stopped. Nothing was changed."; exit 0; }

echo "==> Copying the collector"
ssh "${SSH_ARGS[@]}" "$TARGET" "mkdir -p $APP"
scp "${SSH_ARGS[@]}" "$HERE/collector.mjs" "$TARGET:$APP/collector.mjs"

echo "==> Installing (node only if missing; no other packages)"
ssh "${SSH_ARGS[@]}" "$TARGET" bash -s <<'REMOTE'
set -euo pipefail
APP=/opt/qapture-collector

if ! command -v node >/dev/null; then
    echo "    node missing — installing from NodeSource"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
    apt-get install -y nodejs >/dev/null 2>&1
fi
echo "    node $(node -v)"

mkdir -p "$APP/data"

# Never clobber an existing config: the tokens in it are live on client sites.
if [ -f "$APP/collector.config.json" ]; then
    echo "    config already present — left untouched"
else
    ADMIN="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"
    cat > "$APP/collector.config.json" <<JSON
{
  "adminToken": "$ADMIN",
  "projects": {}
}
JSON
    chmod 600 "$APP/collector.config.json"
    echo "    config created"
fi

# A dedicated unprivileged user: this process handles other people's data and
# has no business running as root.
id -u qapture >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin qapture
chown -R qapture:qapture "$APP"

cat > /etc/systemd/system/qapture-collector.service <<'UNIT'
[Unit]
Description=Qapture collector
After=network.target

[Service]
Type=simple
User=qapture
WorkingDirectory=/opt/qapture-collector
Environment=QA_HOST=127.0.0.1
Environment=QA_PORT=8787
Environment=QA_DATA=/opt/qapture-collector/data
Environment=QA_CONFIG=/opt/qapture-collector/collector.config.json
ExecStart=/usr/bin/node /opt/qapture-collector/collector.mjs
Restart=on-failure
RestartSec=3

# It reads a config and writes notes. Nothing else on this machine is its
# business, and a compromise should not become a compromise of the box.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/qapture-collector/data
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6
UNIT

systemctl daemon-reload
systemctl enable --now qapture-collector >/dev/null 2>&1
sleep 1
systemctl is-active --quiet qapture-collector && echo "    service running" || {
    echo "    service FAILED to start:"; journalctl -u qapture-collector -n 20 --no-pager; exit 1;
}
curl -fsS http://127.0.0.1:8787/health >/dev/null && echo "    health check ok"
REMOTE

echo
echo "==> Installed, and reachable only from the box itself."
echo
echo "    Nothing was exposed to the internet, and no web server was touched."
echo "    To publish it, add this to your nginx config YOURSELF and reload:"
echo
cat <<'NGINX'
        location /qa/ {
            proxy_pass         http://127.0.0.1:8787/;
            proxy_set_header   Host $host;
            client_max_body_size 16m;
        }
NGINX
echo
echo "    Then add a project (on the box):"
echo "      nano /opt/qapture-collector/collector.config.json"
echo "      systemctl restart qapture-collector"
echo
echo "    Your admin token (for listing projects):"
ssh "${SSH_ARGS[@]}" "$TARGET" "grep adminToken $APP/collector.config.json"
