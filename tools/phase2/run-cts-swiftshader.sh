#!/usr/bin/env bash
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; CTS="${CTS_DIR:-$HERE/cts}"; OUT="${1:?outdir}"
OUT="$(cd "$(dirname "$OUT")" 2>/dev/null && pwd)/$(basename "$OUT")"; [ -e "$OUT" ] && { echo "refusing to overwrite $OUT"; exit 2; }; mkdir -p "$OUT"
E=webgpu:shader,execution,expression
QUERIES=("$E,binary,f32_remainder:*" "$E,binary,f16_remainder:*" "$E,call,builtin,log:*" "$E,call,builtin,log2:*" "$E,call,builtin,pow:*" "$E,call,builtin,normalize:*")
[ -n "${HARNESS_GRID:-}" ] && QUERIES+=("$E,binary,harness_grid_remainder:*")
if [ -n "${CTS_EXTENDED:-}" ]; then
  for f in binary,f32_addition binary,f32_subtraction binary,f32_multiplication binary,f32_division unary,f32_arithmetic \
           call,builtin,min call,builtin,max call,builtin,inversesqrt call,builtin,exp call,builtin,exp2 call,builtin,sin call,builtin,cos \
           call,builtin,sqrt call,builtin,tanh binary,f16_addition binary,f16_subtraction binary,f16_multiplication; do QUERIES+=("$E,$f:*"); done
fi
cd "$CTS"
{ echo "cts_commit=$(git rev-parse HEAD)"; echo "cts_worktree_status=$(git status --short | grep -v node_modules | tr "\n" " ")"; echo "node=$(node -v)"; echo "uname=$(uname -srm)"; echo "webgpu_pkg=$(node -p "require('$HERE/../node_modules/webgpu/package.json').version")"; } > "$OUT/meta.txt"
for q in "${QUERIES[@]}"; do
  n="$(echo "$q" | sed 's/.*expression,//; s/:\*//; s/,/_/g')"
  t0=$(date +%s); timeout "${CTS_FILE_TIMEOUT:-3000}" ./tools/run_node --gpu-provider "$HERE/dawn-node-provider.js" ${EXTRA_FLAGS:-} --verbose --print-json "$q" > "$OUT/$n.log" 2>&1; rc=$?; t1=$(date +%s)
  echo "$n exit=$rc wall_s=$((t1-t0))" >> "$OUT/meta.txt"
done
