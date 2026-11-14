#!/usr/bin/env bash
# Runs the Flarmalodebop server (auto-restarts). Set TUNNEL=1 to also open a free Cloudflare HTTPS quick tunnel
# (needs `cloudflared` installed; URL is written to ./LIVE_URL.txt and changes each time the tunnel restarts).
cd "$(dirname "$0")"; mkdir -p logs
[ -f data/flarm.db ] || node setup.js
( while true; do node server.js >> logs/server.log 2>&1; echo "server exited $(date)" >> logs/server.log; sleep 2; done ) &
if [ "${TUNNEL:-0}" = "1" ]; then
  CF=$(command -v cloudflared || echo ~/bin/cloudflared)
  ( while true; do
      "$CF" tunnel --no-autoupdate --protocol http2 --url "http://127.0.0.1:${PORT:-8787}" 2>&1 | while read -r line; do
        echo "$line" >> logs/tunnel.log
        url=$(echo "$line" | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'); [ -n "$url" ] && echo "$url" > LIVE_URL.txt
      done; sleep 3; done ) &
fi
wait
