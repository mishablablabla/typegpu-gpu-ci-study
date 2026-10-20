#!/bin/bash
# usage: mutation/harness/canary.sh <lavapipe|swiftshader> [out dir under runs/]   BASE x2 + canary M24 (pools: full, inv-vector-fns) and M26 (pools: inv-bitops, inv-scalar-int); needs the tgci-ex-<backend>:arm64 image
set -eu
BK="${1:?lavapipe|swiftshader}"; H="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$H/../.." && pwd)"
export MUTATION_DIR="${MUTATION_DIR:-$REPO/runs}"
OUT="${2:-$REPO/runs/canary/$BK}"
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT";; esac
rc=0
for spec in "M24|full inv-vector-fns" "M26|inv-bitops inv-scalar-int"; do
  M="${spec%%|*}"; export POOLS="${spec#*|}"; D="$OUT/$M"
  for r in 1 2; do "$H/run-mutant.sh" BASE "$BK" "$D/BASE__${BK}__v__r$r" > /dev/null; node "$H/collect.mjs" "$D/BASE__${BK}__v__r$r" > /dev/null; done
  "$H/run-mutant.sh" "$M" "$BK" "$D/${M}__${BK}__v__r1" > /dev/null; node "$H/collect.mjs" "$D/${M}__${BK}__v__r1" > /dev/null
  node "$H/canary-verdict.mjs" "$D" "$BK" "$M" || rc=1
done
exit $rc
