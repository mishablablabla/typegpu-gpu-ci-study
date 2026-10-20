#!/bin/bash
# usage: tools/phase3/drift-swiftshader/run-repeat.sh <kind> <runNo,runNo..> <cfg>...   (caller holds ONE slot via with-slot.sh) : repeat a suite kind for flake attribution; never overwrites
set -u; cd "$(dirname "$0")/../../.."; P=runs/drift-swiftshader; K="$1"; RUNS="$2"; shift 2; export NOSLOT=1
for c in "$@"; do for r in ${RUNS//,/ }; do OUT=$P/raw/$c/$K-run$r; [ -e $OUT ] || KIND=$K CFG=$c OUT=$OUT tools/phase3/drift-swiftshader/run-container.sh | tail -1; done; done; echo "REPEAT-DONE $K $*"
