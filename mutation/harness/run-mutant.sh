#!/bin/bash
# usage: run-mutant.sh <mutant-id|BASE> <backend: metal|lavapipe|swiftshader> <outdir (new, absolute or relative to cwd)>
set -u; ID="${1:?id}"; BK="${2:?backend}"; OUT="${3:?outdir}"; H="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$H/../.." && pwd)"; M="${MUTATION_DIR:-$REPO/runs/mutation}"; mkdir -p "$M"
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT";; esac; case "$OUT" in "$M"/*) ;; *) echo "OUT must be under $M" >&2; exit 2;; esac
[ -e "$OUT" ] && { echo "$OUT exists; refusing to overwrite" >&2; exit 2; }; mkdir -p "$OUT"
POOLS="${POOLS:-ex inv-bitops inv-vector-fns inv-mul-paths inv-scalar-int inv-integer-mul inv-comptime full}"
W="$M/work/$(basename "$OUT")-$$"
case "$BK" in metal) NM="$REPO/node_modules";; lavapipe) NM=/work/webgpu-poc/node_modules; IMG="${IMG_LAVAPIPE:-tgci-ex-lavapipe:arm64}";; swiftshader) NM=/work/webgpu-poc/node_modules; IMG="${IMG_SWIFTSHADER:-tgci-ex-swiftshader:arm64}";; *) echo "bad backend" >&2; exit 2;; esac
{ echo "date: $(date -u +%FT%TZ)"; echo "mutant: $ID backend: $BK pools: $POOLS"; echo "harness sha: $(cat "$H"/fp-setup.ts "$H"/p3.config.mts "$H"/run-pool.mjs "$H"/in-env.sh "$H"/prep-work.sh "$H"/assert-adapters.mjs | shasum -a 256 | cut -c1-16)"; [ -n "${IMG:-}" ] && echo "image: $IMG id=$(docker image inspect --format '{{.Id}}' "$IMG")"; } > "$OUT/run-info.txt"
if ! "$H/prep-work.sh" "$ID" "$W" "$NM" > "$OUT/prep.log" 2>&1; then echo "PREP FAILED" > "$OUT/PREP_FAILED.txt"; cat "$OUT/prep.log"; exit 3; fi
cp "$W/repo.sha256" "$OUT/"; [ -f "$W/mutant.patch" ] && cp "$W/mutant.patch" "$W/patch-apply.log" "$OUT/"
attempt() { # <outdir> <pools>
  local o="$1" pl="$2"; mkdir -p "$o"
  if [ "$BK" = metal ]; then
    BACKEND=metal P3_WORK="$W" P3_OUT="$o" P3_SCOPE=host POOLS="$pl" P3_CACHE="$W/.vite" sh "$W/p3/in-env.sh" > "$o/in-env.stdout" 2> "$o/in-env.stderr"
  else
    if [ -n "${P3_SLOT_HELD:-}" ]; then SLOTCMD=""; else SLOTCMD="${WITH_SLOT:-$REPO/tools/with-slot.sh}"; fi
    $SLOTCMD docker run --rm --name "p3-mutation-$$-$(basename "$o")" --cpus 2 --memory 2g -e BACKEND="$BK" -e POOLS="$pl" -e P3_WORK=/work/p3 -e P3_OUT=/out -e P3_SCOPE=container -v "$W":/work/p3 -v "$o":/out "$IMG" sh /work/p3/p3/in-env.sh > "$o/docker.stdout" 2> "$o/docker.stderr"
  fi
}
s=$(date +%s); attempt "$OUT" "$POOLS"; echo "attempt1 wall $(( $(date +%s)-s ))s" >> "$OUT/run-info.txt"
crashed=""; for p in $POOLS; do j="$OUT/$p/$p.exit.json"; if [ ! -f "$j" ]; then crashed="$crashed $p"; elif grep -q '"jsonWritten":false' "$j" || grep -q '"timedOut":true' "$j"; then crashed="$crashed $p"; fi; done
if [ -n "$crashed" ] && [ ! -f "$OUT/ABORTED.txt" ] && [ -z "${NO_RETRY:-}" ]; then echo "crash/hang in:$crashed -> one re-run" >> "$OUT/run-info.txt"; attempt "$OUT/retry" "${crashed# }"; fi
[ -z "${KEEP_WORK:-}" ] && rm -rf "$W"
( cd "$OUT" && find . -type f ! -name files.sha256 ! -path './wgsl/*' | sort | xargs shasum -a 256 > files.sha256 ) 2>/dev/null
echo "done $ID $BK -> $OUT"
