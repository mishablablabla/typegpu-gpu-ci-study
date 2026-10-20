#!/bin/bash
# usage: post-dumps.sh <run dir>  : for each dump group: input identity vs Phase-1 frozen reference, frozen evaluator (evaluate-with-meta, adapted ROOT), cpu-vs-gpu. Writes next to the dump. Never overwrites.
set -u; ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; HERE="$ROOT/runs/drift-lavapipe"; CFGS="$ROOT/docker/drift-lavapipe/configs.tsv"; TOOLS="$ROOT/tools/phase3/drift-lavapipe"; mkdir -p "$HERE/logs" "$HERE/raw/probes"; R="$(cd "${1:?run dir}" && pwd)"; F=evaluator; REFD=runs/phase1/oracle-extension; cd "$ROOT"
for gd in "$R"/dump/group*; do [ -d "$gd" ] || continue; g=${gd##*group}; D=$gd/allrows-bits-ext.json; [ -f "$D" ] || { echo "NO DUMP $g"; continue; }
  case $g in E) ref=$REFD/groupE/lavapipe-arm64-run2;; *) ref=$REFD/group$g/lavapipe-arm64-run1;; esac
  [ -e $gd/input-identity.txt ] || node tools/phase2/check-input-identity.mjs $ref/allrows-bits-ext.json $D > $gd/input-identity.txt 2>&1 || echo "INPUT IDENTITY FAILED $g ($R)"
  [ -e $gd/eval.json ] || bash "$TOOLS/evaluate-with-meta.sh" $D $gd/eval.json > /dev/null || echo "EVAL FAILED $g"
  [ -e $gd/cpu-vs-gpu.json ] || node $F/cpu-vs-gpu-ext.mjs $D $gd/cpu-vs-gpu.json > /dev/null 2>&1
  echo "group$g: $(grep -c PASS $gd/input-identity.txt) identity PASS, $(grep -c FAIL $gd/input-identity.txt) FAIL"; done
