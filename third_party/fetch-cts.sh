#!/bin/bash
set -eu
CTS_COMMIT=e325d0bcc2cb785c4eab1d908339019215bd9462; HERE="$(cd "$(dirname "$0")" && pwd)"
[ -e "$HERE/cts" ] && { echo "$HERE/cts exists" >&2; exit 2; }
git clone --filter=blob:none https://github.com/gpuweb/cts.git "$HERE/cts"
git -C "$HERE/cts" checkout --detach "$CTS_COMMIT"
test "$(git -C "$HERE/cts" rev-parse HEAD)" = "$CTS_COMMIT"
cp "$HERE/poc-specs/harness_grid_remainder.spec.ts" "$HERE/cts/src/webgpu/shader/execution/expression/binary/"
( cd "$HERE/cts" && npm ci --ignore-scripts --no-audit --no-fund && npm run node )
