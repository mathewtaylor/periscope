#!/usr/bin/env bash
# Periscope — install the enrichment relay on this machine.
#
# Copies scripts/periscope-relay.ts to a stable path so Claude Code hooks
# can invoke it. Run on every machine where Claude Code will produce
# events you want enriched.
#
# Usage:
#   ./install-relay.sh                       # → ~/.local/bin/periscope-relay.ts
#   ./install-relay.sh --path /opt/periscope # → /opt/periscope/periscope-relay.ts
#   ./install-relay.sh --print               # show the target path; don't copy
#
# On Windows, run from Git Bash. The default ~/.local/bin resolves under
# your user profile — you can also pass --path %USERPROFILE%/bin.

set -euo pipefail

cd "$(dirname "$0")"

SOURCE="scripts/periscope-relay.ts"
DEFAULT_DIR="$HOME/.local/bin"
TARGET_DIR="$DEFAULT_DIR"
PRINT_ONLY=false

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
    --print)
      PRINT_ONLY=true
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Installs scripts/periscope-relay.ts so Claude Code hooks can invoke it.

Options:
  --path <dir>   override install directory (default: ~/.local/bin)
  --print        print the target path without copying
  -h, --help     show this help
EOF
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      echo "run with --help for usage" >&2
      exit 2
      ;;
  esac
done

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun not found on PATH. Install from https://bun.sh first." >&2
  exit 1
fi

if [ ! -f "$SOURCE" ]; then
  echo "error: $SOURCE not found." >&2
  echo "       Run install-relay.sh from the Periscope repo root." >&2
  exit 1
fi

TARGET="$TARGET_DIR/periscope-relay.ts"

if $PRINT_ONLY; then
  echo "$TARGET"
  exit 0
fi

mkdir -p "$TARGET_DIR"
cp "$SOURCE" "$TARGET"
# chmod is a no-op on Windows filesystems; ignore any failure.
chmod +x "$TARGET" 2>/dev/null || true

COLLECTOR_HINT="${PERISCOPE_URL:-http://<collector-host>:5050}"

cat <<EOF

  ✓ installed periscope-relay

    source : $SOURCE
    target : $TARGET

  next steps on this machine:

    1. Export PERISCOPE_URL in your shell profile (.bashrc / .zshrc / profile):

         export PERISCOPE_URL=$COLLECTOR_HINT

    2. Paste the command-hook block from the Config page — or from
       settings.claude.example.json — into ~/.claude/settings.json,
       using this path for every hook command:

         bun $TARGET

    3. Open Claude Code and run /hooks to approve the new command hooks.

    4. Send any prompt. The session should appear on the Periscope
       Sessions home with tokens + git context populated.

EOF
