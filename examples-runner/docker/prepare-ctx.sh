#!/bin/bash
set -e; H="$(cd "$(dirname "$0")" && pwd)"; E="$H/.."
rsync -a --delete --exclude node_modules --exclude runs --exclude docker "$E/" "$H/ctx/runner/"
[ -d "$H/ctx/typegpu-HEAD" ] || { [ -n "${TYPEGPU_ROOT:-}" ] && rsync -a --exclude node_modules --exclude .git "$TYPEGPU_ROOT/" "$H/ctx/typegpu-HEAD/"; } || { echo "set TYPEGPU_ROOT to a TypeGPU checkout at e893ad11" >&2; exit 2; }
cp "$H/in-container.sh" "$H/ctx/"

