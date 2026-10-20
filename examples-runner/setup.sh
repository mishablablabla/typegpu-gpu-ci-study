#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; : "${TYPEGPU_ROOT:?set TYPEGPU_ROOT}"
(cd "$HERE" && npm install --no-audit --no-fund)
(cd "$TYPEGPU_ROOT" && pnpm install --frozen-lockfile --ignore-scripts)
