#!/bin/bash
REPO="$(cd "$(dirname "$0")/../.." && pwd)"; M="${MUTATION_DIR:-$REPO/runs/mutation}"; cd "$M"
for m in M24 M38 M02 M04 M05 M06 M08 M11 M12 M13 M15 M16 M20 M25 M32 M44; do [ -e runs-ex/${m}__metal__ex97__r1 ] || "$REPO/mutation/harness/run-ex97.sh" $m 1 runs-ex/${m}__metal__ex97__r1 >> queue-ex97.log 2>&1; done; echo drained >> queue-ex97.log
