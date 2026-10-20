#!/bin/bash
# usage: run-in-container.sh <run-id> <patch-file|-> <attest:0|1> [timeout-seconds]
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"; ROOT="$REPO/runs/mock"; mkdir -p "$ROOT"
ID="$1"; PATCH="$2"; ATTEST="$3"; TMO="${4:-1500}"
OUT="$ROOT/$ID"; [ -e "$OUT" ] && { echo "run dir exists: $OUT" >&2; exit 2; }
mkdir -p "$OUT"
MNT=(); PATCHCMD="true"
if [ "$PATCH" != "-" ]; then cp "$PATCH" "$OUT/mutant.patch"; MNT=(-v "$OUT/mutant.patch:/in/mutant.patch:ro"); PATCHCMD="patch -p1 --no-backup-if-mismatch < /in/mutant.patch"; fi
read -r -d '' CMD <<EOS
cd /work-base && $PATCHCMD && echo PATCH_OK || { echo PATCH_FAILED; exit 3; }
# typecheck gate for each touched package that has a test:types script
for pkg in \$( (grep -h '^+++ ' /in/mutant.patch 2>/dev/null || true) | sed -E 's#^\+\+\+ [ab]/##; s#\s.*##' | awk -F/ '\$1=="packages"||\$1=="apps"{print \$1"/"\$2}' | sort -u); do
  if [ -f \$pkg/tsconfig.json ] && grep -q '"test:types"' \$pkg/package.json && ! grep -q astro \$pkg/package.json; then
    T=\$(date +%s); ( cd \$pkg && timeout 600 npx tsc --p ./tsconfig.json --noEmit ) > /out/tsc-\$(echo \$pkg | tr / _).log 2>&1; echo "TSC \$pkg rc=\$? wall=\$((\$(date +%s)-T))"
  fi
done
S=\$(date +%s)
( ENABLE_ATTEST=$ATTEST timeout $TMO npx vitest run --project='!browser' --reporter=default --reporter=json --outputFile.json=/out/vitest.json )
echo EXIT=\$?; echo WALL=\$((\$(date +%s)-S))
EOS
"${WITH_SLOT:-$REPO/tools/with-slot.sh}" docker run --rm --name "p3-mock-$ID" --cpus 2 --memory 2g -e CI=true -e NODE_OPTIONS=--max-old-space-size=1700 ${EXTRA_DOCKER_ARGS:-} "${MNT[@]}" -v "$OUT:/out" tgci-p3-mock-base:1 bash -c "$CMD" > "$OUT/raw.log" 2>&1
echo "rc=$?" >> "$OUT/raw.log"; tail -8 "$OUT/raw.log"
