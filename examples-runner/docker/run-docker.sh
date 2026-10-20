#!/bin/bash
# usage: [EX_*=...] examples-runner/docker/run-docker.sh <lavapipe|swiftshader> <new outdir under runs/examples/>   (holds one slot: 2 CPU / 2 GB)
set -u; B="${1:?backend}"; OUT="${2:?outdir}"; HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"; T="${WITH_SLOT:-$ROOT/tools/with-slot.sh}"
case "$B" in lavapipe|swiftshader) ;; *) echo "backend must be lavapipe|swiftshader" >&2; exit 2;; esac
IMG="tgci-p3-examples-$B:arm64"; case "$OUT" in /*) ABS="$OUT";; *) ABS="$PWD/$OUT";; esac
case "$ABS" in */runs/examples/*) ;; *) echo "OUT must be under runs/examples/" >&2; exit 2;; esac
[ -e "$ABS" ] && { echo "$ABS exists; refusing" >&2; exit 2; }; mkdir -p "$ABS"; N="p3-examples-$B-$$"
ENVS=(); for v in $(env | grep -E '^(EX_|HIDE_FEATURES)' | cut -d= -f1); do ENVS+=(-e "$v=${!v}"); done
{ echo "date: $(date -u +%FT%TZ)"; docker version --format 'docker {{.Server.Version}} {{.Server.Arch}}'; echo "image: $IMG id=$(docker image inspect --format '{{.Id}}' "$IMG")"; echo "BACKEND=$B"; env | grep -E '^(EX_|HIDE_FEATURES)'; } > "$ABS/host-command.txt"
s=$(date +%s)
"$T" docker run --name "$N" --cpus 2 --memory 2g -e BACKEND="$B" "${ENVS[@]}" "$IMG" sh /work/ex/in-container.sh > "$ABS/container-stdout.txt" 2> "$ABS/container-stderr.txt"; rc=$?
echo "docker run exit $rc wall_seconds=$(( $(date +%s)-s ))" >> "$ABS/host-command.txt"
docker cp "$N:/tmp/out/." "$ABS/" ; docker inspect --format 'OOMKilled={{.State.OOMKilled}} exit={{.State.ExitCode}}' "$N" >> "$ABS/host-command.txt"; docker rm "$N" > /dev/null
( cd "$ABS" && find . -type f ! -name files.sha256 | sort | xargs shasum -a 256 > files.sha256 ); echo "done -> $ABS"
