#!/usr/bin/env bash
#
# Give the local proof server a public HTTPS URL.
#
# The browser demo needs to reach a proof server from wherever it is loaded, and
# a Codespace's own forwarded port is auth-gated by default. A Cloudflare quick
# tunnel needs no account and no domain: it prints a *.trycloudflare.com URL
# that anyone can reach.
#
#   .devcontainer/tunnel.sh              tunnels the proof server on :6300
#   .devcontainer/tunnel.sh 3000         tunnels the UI dev server instead
#
# The URL is ephemeral -- it dies with this process. That is fine for a demo or
# a judging session; for anything persistent use a named tunnel (needs a free
# Cloudflare account and a domain) or a VM with a stable IP.
set -euo pipefail

PORT="${1:-6300}"
LOG="$(mktemp)"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not installed -- run .devcontainer/setup.sh" >&2
  exit 1
fi

# Warn rather than fail: the tunnel is still useful if the service starts later.
if ! curl -sS -m 5 -o /dev/null "http://localhost:${PORT}" 2>/dev/null; then
  echo "warning: nothing answering on localhost:${PORT} yet" >&2
  if [ "$PORT" = "6300" ]; then
    echo "         start it with: docker compose -f proof-server/docker-compose.yml up -d" >&2
  fi
fi

echo "starting quick tunnel to localhost:${PORT} ..."
cloudflared tunnel --url "http://localhost:${PORT}" >"$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill $TUNNEL_PID 2>/dev/null || true' EXIT

# cloudflared prints the assigned hostname a second or two after start.
URL=""
for _ in $(seq 1 30); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "could not determine tunnel URL; cloudflared output follows:" >&2
  tail -20 "$LOG" >&2
  exit 1
fi

cat <<BANNER

  Proof server is public at:
    $URL

  Point the UI at it:
    echo 'VITE_PROOF_SERVER_URL=$URL' >> ui/.env.local
    cd ui && npm run dev

  Leave this process running -- the URL dies with it.

BANNER

wait $TUNNEL_PID
