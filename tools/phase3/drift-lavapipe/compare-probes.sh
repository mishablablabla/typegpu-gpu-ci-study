#!/bin/bash
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$ROOT/runs/drift-lavapipe"; P=raw/probes
for pair in "$@"; do a=${pair%%:*}; b=${pair##*:}; [ -s $P/pow-$a.json ] && [ -s $P/pow-$b.json ] || { echo "--- $a vs $b: (missing)"; continue; }; echo "--- $a vs $b"; node "$ROOT/tools/phase3/drift-lavapipe/probes/compare-pow-probe.mjs" $P/pow-$a.json $P/pow-$b.json | grep -v adapter; done
