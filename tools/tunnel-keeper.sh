#!/bin/sh
# Keeps the preview reachable. Yash has lost the link twice in one day: a
# trycloudflare quick tunnel is ephemeral, dies with its process, and mints a
# NEW random URL every time it restarts — so a dead tunnel is not just downtime,
# it silently invalidates whatever link he is holding.
#
# This checks all three layers every 60s and restarts only what is actually
# down, then writes the CURRENT url to tools/CURRENT-URL.txt so there is one
# place that is always right. It never restarts a healthy tunnel, because that
# would change a working link for no reason.
#
#   sh tools/tunnel-keeper.sh &        (run once; leave it)
cd "$(dirname "$0")/.."
URLFILE="tools/CURRENT-URL.txt"

while :; do
  # 1. the built site
  curl -s -o /dev/null --max-time 5 http://127.0.0.1:5295/ || {
    echo "$(date '+%H:%M') dist server down — restarting"
    nohup python3 -m http.server 5295 -d dist --bind 0.0.0.0 >/tmp/dist-serve.log 2>&1 &
    sleep 2
  }
  # 2. the LAN proxy (python, because macOS blocks LAN access to node listeners)
  curl -s -o /dev/null --max-time 5 http://127.0.0.1:5280/ || {
    echo "$(date '+%H:%M') lan proxy down — restarting"
    nohup python3 tools/lan-proxy.py 5280 5295 >/tmp/lan-proxy.log 2>&1 &
    sleep 2
  }
  # 3. the tunnel — only if genuinely gone
  if ! pgrep -f "cloudflared tunnel" >/dev/null; then
    echo "$(date '+%H:%M') tunnel down — starting a new one (URL WILL CHANGE)"
    rm -f /tmp/cf.log
    nohup /opt/homebrew/bin/cloudflared tunnel --url http://127.0.0.1:5295 >/tmp/cf.log 2>&1 &
    for i in $(seq 1 30); do
      sleep 2
      U=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf.log | head -1)
      [ -n "$U" ] && break
    done
    [ -n "$U" ] && { echo "$U" > "$URLFILE"; echo "$(date '+%H:%M') new url: $U"; }
  fi
  sleep 60
done
