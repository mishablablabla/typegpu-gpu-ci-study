#!/bin/bash
# usage: KIND=dump|full|inv|ex|cts CFG=<cfg> OUT=<new dir under runs/drift-swiftshader/raw/> [MODE=dump|smoke EXT_OPS=.. EXT_FILE=..] tools/phase3/drift-swiftshader/run-container.sh
set -u; ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
KIND="${KIND:?}"; CFG="${CFG:?}"; OUT="${OUT:?}"; IMG="tgci-p3-driftss-$CFG-$KIND:arm64"; case "$OUT" in /*) ;; *) OUT="$PWD/$OUT";; esac
case "$OUT" in "$ROOT/runs/drift-swiftshader/raw/"*) ;; *) echo "OUT must be under runs/drift-swiftshader/raw/" >&2; exit 2;; esac
case "$OUT" in *..*) exit 2;; esac; [ -e "$OUT" ] && { echo "$OUT exists; refusing" >&2; exit 2; }
docker image inspect "$IMG" >/dev/null 2>&1 || { echo "no image $IMG" >&2; exit 2; }
case $KIND in dump) SCRIPT=in-container.sh;; full) SCRIPT=full-in-container.sh;; inv) SCRIPT=inv-in-container.sh;; ex) SCRIPT=ex-in-container.sh;; cts) SCRIPT=cts-in-container.sh;; *) exit 2;; esac
mkdir -p "$OUT"; N=p3-driftss-$CFG-$KIND-$$; docker rm -f "$N" >/dev/null 2>&1 || true
{ echo "date: $(date -u +%FT%TZ)"; echo "host: $(uname -srm)"; docker version --format 'docker {{.Server.Version}} server-arch {{.Server.Arch}}'; echo "image: $IMG id=$(docker image inspect --format '{{.Id}}' "$IMG")"; echo "cfg: $CFG kind: $KIND"; echo "cmd: MODE=${MODE:-} EXT_OPS=${EXT_OPS:-} EXT_FILE=${EXT_FILE:-} OUT=$OUT script=docker/in-container/$SCRIPT"; echo "limits: --cpus 2 --memory 2g (one with-slot.sh slot; NOSLOT=1 = caller already holds a slot)"; } > "$OUT/host-command.txt"
s=$(date +%s); if [ -n "${NOSLOT:-}" ]; then SLOTPFX=""; else SLOTPFX="${WITH_SLOT:-$ROOT/tools/with-slot.sh}"; fi
${NOSLOT:+}  $SLOTPFX docker run --name "$N" --cpus 2 --memory 2g -e MODE="${MODE:-dump}" -e EXT_OPS="${EXT_OPS:-add,sub,mul,neg}" -e EXT_FILE="${EXT_FILE:-dump-bits-ext.test.ts}" -e BACKEND=swiftshader "$IMG" sh /work/webgpu-poc/docker/in-container/$SCRIPT > "$OUT/container-stdout.txt" 2> "$OUT/container-stderr.txt"; rc=$?
echo "docker run exit $rc wall_seconds=$(( $(date +%s)-s )) (includes slot wait)" >> "$OUT/host-command.txt"
docker cp "$N:/tmp/out/." "$OUT/" 2>/dev/null; docker rm "$N" >/dev/null 2>&1
( cd "$OUT" && find . -type f ! -name files.sha256 | sort | xargs shasum -a 256 > files.sha256 )
echo "done $CFG/$KIND -> $OUT (exit-code $(cat "$OUT/exit-code.txt" 2>/dev/null || echo none), backend-assert: $(tail -1 "$OUT/backend-assert.txt" 2>/dev/null))"
