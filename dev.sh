#!/usr/bin/env bash
# Periscope — local dev launcher.
#
# Starts the Bun API/WS server and the Vite dev server in one command,
# installs deps on first run, and tears down both processes cleanly on
# Ctrl+C. Open the Vite URL (WEB_PORT) in your browser.
#
# Override any port via env, e.g.:
#   PORT=5080 WEB_PORT=5180 ./dev.sh

set -euo pipefail

cd "$(dirname "$0")"

# Load .env if present so ports etc. override defaults without extra flags.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

export PORT="${PORT:-5050}"
export WEB_PORT="${WEB_PORT:-5173}"
export API_URL="${API_URL:-http://localhost:${PORT}}"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun not found on PATH. Install from https://bun.sh" >&2
  exit 1
fi

# One-time installs.
if [ ! -d node_modules ]; then
  echo "[dev] installing server deps…"
  bun install
fi
if [ ! -d web/node_modules ]; then
  echo "[dev] installing web deps…"
  (cd web && bun install)
fi

API_PID=""
WEB_PID=""

cleanup() {
  echo
  echo "[dev] shutting down…"
  if [ -n "$API_PID" ]; then kill "$API_PID" 2>/dev/null || true; fi
  if [ -n "$WEB_PID" ]; then kill "$WEB_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

cat <<BANNER

┌──────────────────────────────────────────────────┐
│  Periscope dev                                   │
│    API + WS       http://localhost:${PORT}          $(printf '%*s' $((5 - ${#PORT})) '')│
│    Dashboard      http://localhost:${WEB_PORT}  ← open $(printf '%*s' $((5 - ${#WEB_PORT})) '')│
│                                                  │
│  Ctrl+C to stop both.                            │
└──────────────────────────────────────────────────┘

BANNER

bun run dev &
API_PID=$!

bun run dev:web &
WEB_PID=$!

wait -n 2>/dev/null || true
cleanup
