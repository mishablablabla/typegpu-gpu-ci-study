#!/bin/bash
# usage: run-config.sh <cfg> <run-number> [stages]   -> raw/<cfg>/run<N>/ (never overwrites). Runs the container through tools/with-slot.sh (1 slot = 2 CPU / 2 GB).
set -u; ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; HERE="$ROOT/runs/drift-lavapipe"; CFGS="$ROOT/docker/drift-lavapipe/configs.tsv"; TOOLS="$ROOT/tools/phase3/drift-lavapipe"; mkdir -p "$HERE/logs" "$HERE/raw/probes"; cfg="${1:?cfg}"; run="${2:?run}"; STAGES="${3:-dump full inv ex cts}"
IMG="tgci-p3-driftlvp-$cfg"; OUT="$HERE/raw/$cfg/run$run"; [ -e "$OUT" ] && { echo "$OUT exists; refusing" >&2; exit 2; }
line=$(grep -v '^#' "$CFGS" | awk -F'\t' -v c="$cfg" '$1==c'); IFS=$'\t' read -r _ base mesa llpkg llver note <<< "$line"
mkdir -p "$OUT"; N="p3-driftlvp-$cfg-r$run-$$"; docker rm -f "$N" >/dev/null 2>&1 || true
{ echo "date: $(date -u +%FT%TZ)"; echo "host: $(uname -srm)"; docker version --format 'docker {{.Server.Version}} server-arch {{.Server.Arch}}'; echo "image: $IMG id=$(docker image inspect --format '{{.Id}}' "$IMG")"
  echo "config: $line"; echo "stages: $STAGES"; echo "cmd: with-slot.sh docker run --cpus 2 --memory 2g -e STAGES -e EXPECT_MESA $IMG sh /work/webgpu-poc/drift-tools/run-stages.sh"; } > "$OUT/host-command.txt"
s=$(date +%s)
bash "${WITH_SLOT:-$ROOT/tools/with-slot.sh}" docker run --name "$N" --cpus 2 --memory 2g -e STAGES="$STAGES" -e EXPECT_MESA="$mesa" "$IMG" sh /work/webgpu-poc/drift-tools/run-stages.sh > "$OUT/container-stdout.txt" 2> "$OUT/container-stderr.txt"; rc=$?
echo "docker run exit $rc wall_seconds=$(( $(date +%s)-s ))" >> "$OUT/host-command.txt"
docker cp "$N:/tmp/out/." "$OUT/"; docker inspect --format 'oom={{.State.OOMKilled}} exit={{.State.ExitCode}}' "$N" >> "$OUT/host-command.txt"; docker rm "$N" >/dev/null
( cd "$OUT" && find . -type f ! -name files.sha256 | sort | xargs shasum -a 256 > files.sha256 )
echo "done -> $OUT (exit-code $(cat "$OUT/exit-code.txt" 2>/dev/null || echo none); $(tail -1 "$OUT/host-command.txt"))"
