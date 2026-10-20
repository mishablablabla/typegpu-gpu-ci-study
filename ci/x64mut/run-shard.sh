#!/usr/bin/env bash
set -u
ROOT="$PWD"; X="$ROOT/ci/x64mut"; MUT="$ROOT/mutation"; OUT="${OUT:-$ROOT/out}"; BK="${SOAK_BACKEND:?}"; PLAN="${X64_PLAN:?}"; SHARD="${X64_SHARD:?}"; DEADLINE_MIN="${DEADLINE_MIN:-320}"
TMP="${RUNNER_TEMP:-/tmp}/x64mut"; T="$TMP/tree"; WK="$TMP/work"; RUNS="$OUT/runs"; mkdir -p "$T" "$WK" "$RUNS"
. "$ROOT/ci/soak/lib.sh"            # stage <name> <cmd...> -> $OUT/timing.tsv
T0=$(date +%s); log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/shard.log"; }
timeout_for() { case "$1" in ex) echo 600;; full) echo 900;; own) echo 300;; *) echo 600;; esac; }
POOLS_ALL="ex inv-bitops inv-vector-fns inv-mul-paths inv-scalar-int inv-integer-mul inv-comptime full own"

extract_tree() { tar -xJf "$MUT/typegpu-tree.tar.xz" -C "$T" && (cd "$T" && sha256sum -c "$MUT/typegpu-tree.sha256" > "$OUT/tree-verify.txt" 2>&1); }
stage tree-extract extract_tree || { log "TREE VERIFY FAILED"; tail -5 "$OUT/tree-verify.txt"; exit 1; }
log "tree verified: $(grep -c ': OK' "$OUT/tree-verify.txt") files OK, $(grep -vc ': OK' "$OUT/tree-verify.txt") not OK"
[ "$(grep -vc ': OK' "$OUT/tree-verify.txt")" = 0 ] || exit 1
POOL_SRC="$TMP/pool-src"; rm -rf "$POOL_SRC"; "$MUT/harness/build-pool.sh" "$POOL_SRC" || exit 1
sha256sum "$MUT/typegpu-tree.tar.xz" "$MUT/typegpu-tree.sha256" "$MUT/plans/$PLAN.json" "$MUT"/harness/{fp-setup.ts,p3.config.mts,run-pool.mjs,assert-adapters.mjs,collect.mjs,build-pool.sh} "$X"/run-shard.sh > "$OUT/inputs.sha256"
(cd "$POOL_SRC" && find . -type f | sort | xargs sha256sum) > "$OUT/pool-src.sha256"
node -e '
const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); const j=p.jobs.find(j=>j.backend===process.argv[2]&&String(j.shard)===process.argv[3]); if(!j){console.error("no such job in plan");process.exit(2);}
console.log(j.items.map(i=>i.id+"\t"+i.pools.join(" ")).join("\n"));' "$MUT/plans/$PLAN.json" "$BK" "$SHARD" > "$OUT/items.tsv" || exit 1
NEED=" $(cut -f2 "$OUT/items.tsv" | tr '\n' ' ') "; BASE_POOLS=""; for p in $POOLS_ALL; do if [[ "$NEED" == *" $p "* ]]; then BASE_POOLS="$BASE_POOLS$p "; fi; done; BASE_POOLS="${BASE_POOLS% }"
log "backend=$BK shard=$SHARD plan=$PLAN items=$(wc -l < "$OUT/items.tsv") base-pools=[$BASE_POOLS]"

prep_work() { # <id> <W>
  local id="$1" W="$2"; rm -rf "$W"; mkdir -p "$W/repo" "$W/pool" "$W/p3" || return 1
  cp -a "$T/." "$W/repo/" || return 1
  if [ "$id" != BASE ]; then cp "$MUT/patches/$id.patch" "$W/mutant.patch" || return 3
    ( cd "$W/repo" && patch -p1 --batch --no-backup-if-mismatch < "$W/mutant.patch" > "$W/patch-apply.log" 2>&1 ) || { cat "$W/patch-apply.log"; return 4; }
    find "$W/repo" \( -name '*.orig' -o -name '*.rej' \) -delete; fi
  ( cd "$W/repo" && find . -type f | sort | xargs sha256sum > "$W/repo.sha256" )
  cp -a "$POOL_SRC/." "$W/pool/"; mkdir -p "$W/pool/typegpu-examples/vendor"
  ln -s ../../../repo/apps "$W/pool/typegpu-examples/vendor/apps"; ln -s ../../../repo/packages "$W/pool/typegpu-examples/vendor/packages"
  cp "$MUT/harness/fp-setup.ts" "$MUT/harness/p3.config.mts" "$MUT/harness/run-pool.mjs" "$MUT/harness/assert-adapters.mjs" "$W/p3/"
  ln -s "$ROOT/node_modules" "$W/node_modules"
}
attempt() { # <W> <outdir> <pools>   (native analogue of in-env.sh's pool loop)
  local W="$1" o="$2" pl="$3" p s; mkdir -p "$o/probe"; export P3_WORK="$W" P3_ROOT="$W/pool"
  ( cd "$W" && P3_FP_OUT="$o/probe" node --input-type=module -e "
import { create } from 'webgpu'; import fs from 'node:fs';
const gpu = create([]); globalThis.__gpu = gpu; const a = await gpu.requestAdapter(); const i = a.info;
fs.appendFileSync(process.env.P3_FP_OUT + '/adapters-probe.jsonl', JSON.stringify({ vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description, shaderF16: a.features.has('shader-f16'), features: [...a.features].sort() }) + '\n'); process.exit(0);" > "$o/probe/probe.stdout" 2> "$o/probe/probe.stderr" )
  if ! node "$W/p3/assert-adapters.mjs" "$BK" "$o" > "$o/probe/assert.out" 2>&1; then echo "adapter assertion FAILED before pools" > "$o/ABORTED.txt"; return 0; fi
  for p in $pl; do s=$(date +%s); mkdir -p "$o/$p"
    ( cd "$W" && P3_FP_OUT="$o/$p" P3_CACHE="$W/.vite-$p" node "$W/p3/run-pool.mjs" "$p" "$o/$p" "$(timeout_for "$p")" )
    echo "$(date -u +%FT%TZ) pool $p done wall $(( $(date +%s)-s ))s $(cat "$o/$p/$p.exit.json" 2>/dev/null)" >> "$o/commands.log"
    rm -rf "$W/.vite-$p"; done
  node "$W/p3/assert-adapters.mjs" "$BK" "$o" > "$o/adapter-assert.out" 2>&1; echo "$(date -u +%FT%TZ) final adapter assertion exit $?" >> "$o/commands.log"
}
run_one() { # <id> <rep> <pools>
  local id="$1" rep="$2" pl="$3" name="$1__${BK}__r$2" W="$WK/$1__r$2" o s e; o="$RUNS/$name"; [ -e "$o" ] && { log "refusing to overwrite $o"; return 2; }; mkdir -p "$o"
  s=$(date +%s.%N)
  { echo "date: $(date -u +%FT%TZ)"; echo "mutant: $id backend: $BK pools: $pl"; echo "harness sha: $(cat "$MUT"/harness/fp-setup.ts "$MUT"/harness/p3.config.mts "$MUT"/harness/run-pool.mjs | sha256sum | cut -c1-16)"; echo "cpu: $(grep -m1 'model name' /proc/cpuinfo | sed 's/.*: //')"; echo "nproc: $(nproc)"; } > "$o/run-info.txt"
  if ! prep_work "$id" "$W" > "$o/prep.log" 2>&1; then echo "PREP FAILED" > "$o/PREP_FAILED.txt"; log "PREP FAILED $name"; return 3; fi
  cp "$W/repo.sha256" "$o/repo.sha256"; [ -f "$W/mutant.patch" ] && cp "$W/mutant.patch" "$W/patch-apply.log" "$o/"
  echo "$(date -u +%FT%TZ) start backend=$BK pools=$pl" >> "$o/commands.log"
  attempt "$W" "$o" "$pl"; echo "attempt1 wall $(( $(date +%s)-${s%.*} ))s" >> "$o/run-info.txt"
  local crashed=""; for p in $pl; do j="$o/$p/$p.exit.json"; if [ ! -f "$j" ]; then crashed="$crashed $p"; elif grep -q '"jsonWritten":false' "$j" || grep -q '"timedOut":true' "$j"; then crashed="$crashed $p"; fi; done
  if [ -n "$crashed" ] && [ ! -f "$o/ABORTED.txt" ]; then echo "crash/hang in:$crashed -> one re-run" >> "$o/run-info.txt"; attempt "$W" "$o/retry" "${crashed# }"; fi
  ( cd "$o" && node "$MUT/harness/collect.mjs" "$o" > collect.out 2>&1 )
  if [ "$id" = BASE ] || [ -n "${KEEP_RAW:-}" ]; then ( cd "$o" && tar -czf raw-pools.tar.gz $(ls -d */ 2>/dev/null) && rm -rf */ ); else
    find "$o" \( -name 'fp-*.jsonl' -o -name '*.vitest.json' -o -name '*.stdout' \) -delete; find "$o" -type d -name wgsl -prune -exec rm -rf {} +; fi
  if [ "$id" != BASE ] && [ -f "$OUT/base.repo.sha256" ]; then diff "$OUT/base.repo.sha256" "$W/repo.sha256" | grep '^[<>]' | awk '{print $1, $3}' | sort -u > "$o/files-changed-vs-base.txt"; fi
  [ "$id" = BASE ] && [ ! -f "$OUT/base.repo.sha256" ] && cp "$W/repo.sha256" "$OUT/base.repo.sha256"
  rm -rf "$W"; e=$(date +%s.%N); printf '%s\t%s\t%s\t%s\n' "run:$name" "$s" "$e" "0" >> "$OUT/timing.tsv"
  log "done $name wall $(awk -v a="$s" -v b="$e" 'BEGIN{printf "%.0f", b-a}')s $(cat "$o/collect.out" 2>/dev/null | head -c 300)"
}

if [ "${X64_SKIP_BASE:-0}" != 1 ]; then run_one BASE 1 "$BASE_POOLS"; run_one BASE 2 "$BASE_POOLS"; fi
while IFS=$'\t' read -r id pools; do
  [ -z "$id" ] && continue
  el=$(( ($(date +%s)-T0)/60 )); if [ "$el" -ge "$DEADLINE_MIN" ]; then echo "$id" >> "$OUT/NOT_RUN_DEADLINE.txt"; log "deadline reached ($el min): skipping $id"; continue; fi
  run_one "$id" 1 "$pools" < /dev/null
done < "$OUT/items.tsv"
log "shard done in $(( ($(date +%s)-T0)/60 )) min"
( cd "$OUT" && find runs -type f | sort | xargs sha256sum > runs.sha256 ) 2>/dev/null
exit 0
