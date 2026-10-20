#!/bin/sh
# usage: MODE=smoke|dump|control EXT_OPS=... [EXT_FILE=...] OUT=<new dir under runs/phase2/> docker/swiftshader/run.sh <image:tag>
set -u
IMG="${1:?image required}"; OUT="${OUT:?set OUT}"; MODE="${MODE:-dump}"
case "$IMG" in tgci-oracle-ext*|tgci-cts*|tgci-e1*|tgci-e2*|tgci-e3*|tgci-allrows*) echo "refusing frozen/Lavapipe image $IMG" >&2; exit 2;; esac
case "$IMG" in tgci-swiftshader-*) ;; *) echo "image must be tgci-swiftshader-*" >&2; exit 2;; esac
case "$OUT" in /*) ABS="$OUT";; *) ABS="$PWD/$OUT";; esac
case "$ABS" in *..*) echo "OUT must not contain .." >&2; exit 2;; esac
case "$ABS" in */runs/phase2/*) ;; *) echo "OUT must be under runs/phase2/" >&2; exit 2;; esac
[ -e "$OUT" ] && { echo "$OUT exists; refusing to overwrite" >&2; exit 2; }
mkdir -p "$OUT"; N=ss-run-$$; docker rm -f "$N" >/dev/null 2>&1 || true
{ echo "date: $(date -u +%FT%TZ)"; echo "host: $(uname -srm)"; docker version --format 'docker {{.Server.Version}} server-arch {{.Server.Arch}}'; echo "image: $IMG id=$(docker image inspect --format '{{.Id}}' "$IMG")"; echo "base-image-id: $(docker image inspect --format '{{.Id}}' ubuntu:24.04 2>/dev/null)"; echo "cmd: MODE=$MODE EXT_OPS=${EXT_OPS:-} EXT_FILE=${EXT_FILE:-} OUT=$OUT"; } > "$OUT/host-command.txt"
docker run --name "$N" -e MODE="$MODE" -e EXT_OPS="${EXT_OPS:-add,sub,mul,neg}" -e EXT_FILE="${EXT_FILE:-dump-bits-ext.test.ts}" "$IMG" sh /work/webgpu-poc/docker/in-container/in-container.sh > "$OUT/container-stdout.txt" 2> "$OUT/container-stderr.txt"; echo "docker run exit $?" >> "$OUT/host-command.txt"
docker cp "$N:/tmp/out/." "$OUT/" ; docker rm "$N" >/dev/null
( cd "$OUT" && find . -type f ! -name files.sha256 | sort | xargs shasum -a 256 > files.sha256 )
echo "done -> $OUT (exit-code $(cat "$OUT/exit-code.txt" 2>/dev/null || echo none))"
