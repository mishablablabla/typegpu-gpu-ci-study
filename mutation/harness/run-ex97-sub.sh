#!/bin/bash
# usage: run-ex97-sub.sh <lavapipe|swiftshader> <outdir under runs/mutation/runs-ex/>  : BASE x2 + mutants M20 M13 M44 M32 on a FILTERED example list, one slot, one container.
set -u; BK="$1"; OUT="$2"; H="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$H/../.." && pwd)"; case "$OUT" in /*) ;; *) OUT="$PWD/$OUT";; esac; [ -e "$OUT" ] && exit 2; mkdir -p "$OUT"
FILTER="rendering/3d-fish,rendering/box-raytracing,rendering/cubemap-reflection,rendering/phong-reflection,rendering/simple-shadow,tests/buffer-write-benchmark,algorithms/matrix-next,simple/square,rendering/perlin-noise,tests/dispatch"
"${WITH_SLOT:-$REPO/tools/with-slot.sh}" docker run --rm --name "p3-mutation-ex97sub-$BK-$$" --cpus 2 --memory 2g -e BACKEND="$BK" -e JOBS="BASE M20 M13 M44 M32" -e EX_FILTER="$FILTER" -e EX_TIMEOUT_MS=450000 -v "$REPO/mutation/probes":/p:ro -v "$OUT":/out "tgci-p3-examples-$BK:arm64" sh /p/ex97-sub-container.sh > "$OUT/docker.stdout" 2> "$OUT/docker.stderr"
echo done > "$OUT/DONE"
