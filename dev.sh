#!/usr/bin/env bash
# Periscope — local dev launcher.
#
# Starts the Bun API/WS server on :5050 and the Vite dev server on :5173
# in one command, installs deps on first run, and tears down both processes
# cleanly on Ctrl+C.
#
# Open http://localhost:5173 once both are up.

set -euo pipefail

cd "$(dirname "$0")"

# Make sure bun is on PATH.
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

cat <<'BANNER'

┌──────────────────────────────────────────────────┐
│  Periscope dev                                   │
│    API + WS       http://localhost:5050          │
│    Dashboard      http://localhost:5173  ← open  │
│                                                  │
│  Ctrl+C to stop both.                            │
└──────────────────────────────────────────────────┘

BANNER

# Backend (API + WS + raw SPA fallback). --watch auto-restarts on server edits.
bun run dev &
API_PID=$!

# Vite dev server with HMR. /api and /ws are proxied to :5050 via vite.config.
bun run dev:web &
WEB_PID=$!

# If either process exits, tear the other down too.
wait -n 2>/dev/null || true
cleanup
