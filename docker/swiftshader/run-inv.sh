#!/bin/sh
# usage: BACKEND=lavapipe|swiftshader OUT=<new dir under runs/phase2/> docker/swiftshader/run-inv.sh <image>   (image: tgci-inv-lavapipe* | tgci-inv-swiftshader*)
set -u; IMG="${1:?image}"; OUT="${OUT:?}"; BACKEND="${BACKEND:?}"; case "$IMG" in tgci-inv-*) ;; *) echo "image must be tgci-inv-*" >&2; exit 2;; esac
case "$OUT" in /*) ABS="$OUT";; *) ABS="$PWD/$OUT";; esac; case "$ABS" in *..*) exit 2;; esac; case "$ABS" in */runs/phase2/*) ;; *) echo "OUT must be under runs/phase2/" >&2; exit 2;; esac
[ -e "$OUT" ] && { echo "$OUT exists; refusing" >&2; exit 2; }; mkdir -p "$OUT"; N=inv-$$; docker rm -f "$N" >/dev/null 2>&1 || true
{ echo "date: $(date -u +%FT%TZ)"; docker version --format 'docker {{.Server.Version}} {{.Server.Arch}}'; echo "image: $IMG id=$(docker image inspect --format '{{.Id}}' "$IMG")"; echo "BACKEND=$BACKEND"; } > "$OUT/host-command.txt"
s=$(date +%s); docker run --name "$N" -e BACKEND="$BACKEND" "$IMG" sh /work/webgpu-poc/docker/in-container/inv-in-container.sh > "$OUT/container-stdout.txt" 2> "$OUT/container-stderr.txt"; echo "docker run exit $? wall_seconds=$(( $(date +%s)-s ))" >> "$OUT/host-command.txt"
docker cp "$N:/tmp/out/." "$OUT/"; docker rm "$N" >/dev/null; ( cd "$OUT" && find . -type f ! -name files.sha256 | sort | xargs shasum -a 256 > files.sha256 ); echo "done -> $OUT"
