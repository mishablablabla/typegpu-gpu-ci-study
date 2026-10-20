#!/bin/bash
# usage: RUNS="1" GROUPS_TO_RUN="A B C D L" tools/phase3/drift-swiftshader/run-dumps.sh <cfg>
set -u; cd "$(dirname "$0")/../../.."; CFG="$1"; P=runs/drift-swiftshader; F=evaluator; REFD=runs/phase1/oracle-extension; BASE=runs/phase2/raw
ops_of() { case $1 in A) echo add,sub,mul,neg;; B) echo div,min,max;; C) echo inverseSqrt,exp,exp2,sin,cos;; D) echo sqrt,tanh;; L) echo mod,log,log2,pow;; esac; }
for run in ${RUNS:-1}; do for g in ${GROUPS_TO_RUN:-A B C D L}; do
  OUT=$P/raw/$CFG/group$g-run$run; ref=$REFD/group$g/lavapipe-arm64-run1; base=$BASE/group$g/swiftshader-arm64-run1
  KIND=dump CFG=$CFG MODE=dump EXT_OPS=$(ops_of $g) OUT=$OUT tools/phase3/drift-swiftshader/run-container.sh | tail -1
  D=$OUT/allrows-bits-ext.json; [ -f $D ] || { echo "NO DUMP for $CFG $g run$run" | tee $OUT/NOTE.md; continue; }
  node tools/phase3/drift-swiftshader/check-input-identity.mjs $ref/allrows-bits-ext.json $D > $OUT/input-identity.txt 2>&1 || echo "INPUT IDENTITY FAILED $CFG $g run$run"
  bash tools/phase3/drift-swiftshader/evaluate-with-meta.sh $D $OUT/eval.json > /dev/null || echo "EVAL FAILED $CFG $g run$run"
  node $F/compare-bits-ext.mjs $OUT/cmp-vs-m155.json m155=$base/allrows-bits-ext.json $CFG=$D > /dev/null 2>&1
  node tools/phase3/drift-swiftshader/analyze-drift.mjs $OUT/analysis-vs-m155.json $base/allrows-bits-ext.json $D > $OUT/analysis-vs-m155.txt 2>&1
  echo "$CFG group$g run$run: $(grep -c PASS $OUT/input-identity.txt) identity PASS, $(grep -c FAIL $OUT/input-identity.txt) FAIL"
done; done
