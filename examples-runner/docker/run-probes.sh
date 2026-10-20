#!/bin/bash
# usage: examples-runner/docker/run-probes.sh <lavapipe|swiftshader> <new outdir>   (one slot; runs probes/{gol-check,signed-zero}.mjs inside the backend image, read-only mount)
set -u; B="$1"; OUT="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"; E="$HERE/.."; T="${WITH_SLOT:-$E/../tools/with-slot.sh}"; IMG="tgci-p3-examples-$B:arm64"; NAME="p3-examples-probes-$B-$$"
case "$OUT" in /*) ABS="$OUT";; *) ABS="$PWD/$OUT";; esac; [ -e "$ABS" ] && { echo "$ABS exists" >&2; exit 2; }; mkdir -p "$ABS"
"$T" docker run --name "$NAME" --cpus 2 --memory 2g -e BACKEND="$B" -v "$E/probes:/work/ex/runner/probes:ro" "$IMG" sh -c 'mkdir -p /tmp/p; cd /work/ex/runner/probes; node signed-zero.mjs > /tmp/p/signed-zero.json 2> /tmp/p/signed-zero.err; for s in "64 8" "256 6" "1024 6"; do set -- $s; node gol-check.mjs /work/ex/typegpu /tmp/p/gol-$1.json $1 $2 > /tmp/p/gol-$1.out 2> /tmp/p/gol-$1.err; done' > "$ABS/stdout.txt" 2> "$ABS/stderr.txt"
docker cp "$NAME:/tmp/p/." "$ABS/"; docker rm "$NAME" > /dev/null; echo "done -> $ABS"
