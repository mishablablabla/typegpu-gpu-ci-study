#!/usr/bin/env bash
# usage: ingest-native.sh <gh run id> <cpu label>. Copies the run's raw group dirs (twins, artifact tree untouched) to raw/group*/swiftshader-x64-<cpu>-ghrun<id>-run<N>/, then input identity -> evaluate -> cpu-vs-gpu -> compare vs frozen Lavapipe arm64 run1 and vs SwiftShader arm64 run1. Never overwrites.
set -u; cd "$(dirname "$0")/../.."; S=runs/phase2; F=evaluator; REFD=runs/phase1/oracle-extension; id=$1; cpu=$2; A=$S/native-x64/run-$id/sw-x64-results-$id-1
for g in A B C D E L; do for src in $A/raw/group$g/*; do n=$(basename $src | sed 's/.*-run//'); dst=$S/raw/group$g/swiftshader-x64-$cpu-ghrun$id-run$n
  [ -e $dst ] && { echo "exists $dst"; continue; }; cp -R $src $dst
  if [ ! -f $dst/allrows-bits-ext.json ]; then echo "no dump: $dst (exit $(cat $dst/exit-code.txt 2>/dev/null))"; continue; fi
  ref=$REFD/group$g/lavapipe-arm64-run1; D=$dst/allrows-bits-ext.json
  node tools/phase2/check-input-identity.mjs $ref/allrows-bits-ext.json $D > $dst/input-identity.txt 2>&1 || echo "INPUT IDENTITY FAILED $dst"
  bash tools/phase2/evaluate-with-meta.sh $D $dst/eval.json > /dev/null || echo "EVAL FAILED $dst"
  node $F/cpu-vs-gpu-ext.mjs $D $dst/cpu-vs-gpu.json > /dev/null 2>&1
  node $F/compare-bits-ext.mjs $dst/cmp-vs-lavapipe.json lavapipe=$ref/allrows-bits-ext.json swiftshader=$D > /dev/null 2>&1
  node $F/compare-bits-ext.mjs $dst/cmp-vs-swiftshader-arm64.json ssarm64=$S/raw/group$g/swiftshader-arm64-run1/allrows-bits-ext.json ssx64=$D > /dev/null 2>&1
  echo "ingested $dst: $(grep -c PASS $dst/input-identity.txt) identity PASS/$(grep -c FAIL $dst/input-identity.txt) FAIL, assert $(grep -o 'RESULT: [A-Z]*' $dst/backend-assert.txt)"; done; done
