#!/bin/bash
# usage: KINDS="full inv ex cts" RUN=1 tools/phase3/drift-swiftshader/run-suites.sh <cfg>   -- runs the Phase-2 suites unchanged (their in-container scripts are baked into the images) under one slot each.
set -u; cd "$(dirname "$0")/../../.."; CFG="$1"; P=runs/drift-swiftshader
for k in ${KINDS:-full inv ex cts}; do
  OUT=$P/raw/$CFG/$k-run${RUN:-1}
  KIND=$k CFG=$CFG OUT=$OUT tools/phase3/drift-swiftshader/run-container.sh | tail -1
done
