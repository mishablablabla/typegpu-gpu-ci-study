#!/bin/sh
# usage: OUT=<new dir under runs/phase2/> docker/swiftshader/run-cts.sh <tgci-swiftshader-cts:tag>
set -u
IMG="${1:?image required}"; OUT="${OUT:?set OUT}"
case "$IMG" in tgci-swiftshader-cts*) ;; *) echo "image must be tgci-swiftshader-cts*" >&2; exit 2;; esac
case "$OUT" in /*) ABS="$OUT";; *) ABS="$PWD/$OUT";; esac; case "$ABS" in *..*) exit 2;; esac
case "$ABS" in */runs/phase2/*) ;; *) echo "OUT must be under runs/phase2/" >&2; exit 2;; esac
[ -e "$OUT" ] && { echo "$OUT exists; refusing to overwrite" >&2; exit 2; }
mkdir -p "$OUT"; N=ss-cts-$$; docker rm -f "$N" >/dev/null 2>&1 || true
{ echo "date: $(date -u +%FT%TZ)"; echo "host: $(uname -srm)"; docker version --format 'docker {{.Server.Version}} server-arch {{.Server.Arch}}'; echo "image: $IMG id=$(docker image inspect --format '{{.Id}}' "$IMG")"; echo "cmd: CTS_EXTENDED=1 (+HARNESS_GRID in image) $0 $IMG OUT=$OUT"; } > "$OUT/host-command.txt"
s=$(date +%s); docker run --name "$N" "$IMG" sh /work/webgpu-poc/docker/in-container/cts-in-container.sh > "$OUT/container-stdout.txt" 2> "$OUT/container-stderr.txt"; rc=$?; e=$(date +%s)
echo "docker run exit $rc wall_seconds=$((e-s))" >> "$OUT/host-command.txt"
docker cp "$N:/tmp/out/." "$OUT/"; docker rm "$N" >/dev/null
( cd "$OUT" && find . -type f ! -name files.sha256 | sort | xargs shasum -a 256 > files.sha256 )
echo "done -> $OUT (exit-code $(cat "$OUT/exit-code.txt" 2>/dev/null || echo none))"
