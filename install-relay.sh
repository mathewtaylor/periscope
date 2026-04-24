#!/usr/bin/env bash
# Periscope — install the enrichment relay on this machine.
#
# Works in two modes:
#
#   1. Local (you have the repo checked out):
#        ./install-relay.sh
#        ./install-relay.sh --path /opt/periscope
#
#   2. Remote (one-liner, no repo needed — the repo is public):
#        curl -fsSL https://raw.githubusercontent.com/mathewtaylor/periscope/main/install-relay.sh | bash
#        curl -fsSL https://raw.githubusercontent.com/mathewtaylor/periscope/main/install-relay.sh | bash -s -- --path /opt/periscope
#
# Flags:
#   --path <dir>    install directory (default: ~/.local/bin)
#   --ref  <ref>    git ref (branch/tag/sha) to fetch from in remote mode
#                   (default: main)
#   --print         print the resolved target path and exit
#   -h, --help      show this help

set -euo pipefail

REPO_RAW_BASE="https://raw.githubusercontent.com/mathewtaylor/periscope"
DEFAULT_DIR="$HOME/.local/bin"
TARGET_DIR="$DEFAULT_DIR"
REF="main"
PRINT_ONLY=false

# Locate a local copy if this script lives next to the repo tree.
# Under `curl | bash` BASH_SOURCE is unset or non-existent, so LOCAL_SOURCE
# stays empty and we fall through to remote fetch.
LOCAL_SOURCE=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$SCRIPT_DIR/scripts/periscope-relay.ts" ]; then
    LOCAL_SOURCE="$SCRIPT_DIR/scripts/periscope-relay.ts"
  fi
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --path)
      if [ $# -lt 2 ]; then
        echo "error: --path requires a directory argument" >&2
        exit 2
      fi
      TARGET_DIR="$2"
      shift 2
      ;;
    --ref)
      if [ $# -lt 2 ]; then
        echo "error: --ref requires a git ref argument" >&2
        exit 2
      fi
      REF="$2"
      shift 2
      ;;
    --print)
      PRINT_ONLY=true
      shift
      ;;
    -h|--help)
      sed -n '2,/^set -euo/p' "$0" | sed 's/^# \{0,1\}//; /^set -euo/d' | head -n -1
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      echo "run with --help for usage" >&2
      exit 2
      ;;
  esac
done

TARGET="$TARGET_DIR/periscope-relay.ts"

if $PRINT_ONLY; then
  echo "$TARGET"
  exit 0
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun not found on PATH." >&2
  echo "       Install first: curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

if [ -n "$LOCAL_SOURCE" ]; then
  SOURCE_DESC="local: $LOCAL_SOURCE"
  cp "$LOCAL_SOURCE" "$TARGET"
else
  REMOTE_URL="$REPO_RAW_BASE/$REF/scripts/periscope-relay.ts"
  SOURCE_DESC="remote: $REMOTE_URL"
  if ! command -v curl >/dev/null 2>&1; then
    echo "error: curl not found; can't fetch relay remotely." >&2
    echo "       Install curl, or clone the repo and run ./install-relay.sh from inside." >&2
    exit 1
  fi
  if ! curl -fsSL "$REMOTE_URL" -o "$TARGET"; then
    echo "error: failed to fetch $REMOTE_URL" >&2
    echo "       Check the ref name and that the repo is reachable." >&2
    exit 1
  fi
fi

# chmod is a no-op on Windows filesystems; ignore any failure.
chmod +x "$TARGET" 2>/dev/null || true

COLLECTOR_HINT="${PERISCOPE_URL:-http://<collector-host>:5050}"

cat <<EOF

  ✓ installed periscope-relay

    source : $SOURCE_DESC
    target : $TARGET

  next steps on this machine:

    1. Export PERISCOPE_URL in your shell profile (.bashrc / .zshrc / profile):

         export PERISCOPE_URL=$COLLECTOR_HINT

    2. Paste the command-hook block from the Config page — or from
       settings.claude.example.json in the repo — into ~/.claude/settings.json,
       using this path for every hook command:

         bun $TARGET

    3. Open Claude Code and run /hooks to approve the new command hooks.

    4. Send any prompt. The session should appear on the Periscope
       Sessions home with tokens + git context populated.

EOF
