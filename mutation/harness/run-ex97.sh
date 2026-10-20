#!/bin/bash
# usage: run-ex97.sh <mutant|BASE> <rep-count> <outdir under runs/mutation/runs-ex/>   (Metal, host; second-pass pool = WS-EX runner over all 97 docs examples)
set -u; ID="$1"; REP="$2"; OUT="$3"; H="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$H/../.." && pwd)"; M="${MUTATION_DIR:-$REPO/runs/mutation}"; T="${EX97_CHECKOUT:-$M/ex97/typegpu}"; RUN="$REPO/examples-runner"
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT";; esac; [ -e "$OUT" ] && { echo "$OUT exists" >&2; exit 2; }; mkdir -p "$(dirname "$OUT")"
treehash() { ( cd "$T" && find packages apps/typegpu-docs/src -type f -not -path '*/node_modules/*' | sort | xargs shasum -a 256 | shasum -a 256 | cut -c1-16 ); }
PRE=$(treehash)
if [ "$ID" != BASE ]; then ( cd "$T" && patch -p1 --batch --no-backup-if-mismatch < "$REPO/mutation/patches/$ID.patch" > /dev/null ) || { echo "patch fail"; exit 3; }; fi
MUT=$(treehash)
TYPEGPU_ROOT="$T" EX_REPEATS="$REP" EX_JOBS="${EX_JOBS:-3}" EX_TIMEOUT_MS=300000 EX_TYPEGPU_REV="e893ad11+$ID" "$RUN/run-all.sh" metal "$OUT" > "$OUT.stdout" 2> "$OUT.stderr"; RC=$?
if [ "$ID" != BASE ]; then ( cd "$T" && patch -R -p1 --batch --no-backup-if-mismatch < "$REPO/mutation/patches/$ID.patch" > /dev/null ); fi
find "$T" \( -name '*.orig' -o -name '*.rej' \) -not -path '*/node_modules/*' -delete; POST=$(treehash)
echo "{\"mutant\":\"$ID\",\"rc\":$RC,\"treePre\":\"$PRE\",\"treeMutated\":\"$MUT\",\"treePost\":\"$POST\",\"restoredOk\":$([ "$PRE" = "$POST" ] && echo true || echo false)}" > "$OUT/p3-run.json"
node "$H/collect-ex.mjs" "$OUT" > /dev/null; echo "done $ID rc=$RC restored=$([ "$PRE" = "$POST" ] && echo ok || echo FAIL)"
