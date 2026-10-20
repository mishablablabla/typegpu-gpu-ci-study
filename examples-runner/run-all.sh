#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
: "${TYPEGPU_ROOT:?set TYPEGPU_ROOT}"
[ $# -eq 2 ] || { sed -n 2,9p "$0"; exit 2; }
OUTABS="$(cd "$(dirname "$2")" 2>/dev/null && pwd)/$(basename "$2")"
cd "$HERE"; [ -d node_modules/webgpu ] || { echo "runner deps missing: run ./setup.sh first" >&2; exit 2; }
exec node --max-old-space-size=4096 "$HERE/src/run-all.mjs" "$1" "$OUTABS"
