#!/bin/bash
# usage: tools/phase3/drift-swiftshader/postproc-dumps.sh <cfg>  : host-side: input identity vs frozen Lavapipe reference, frozen evaluator, comparison vs Phase-2 M155 baseline, lane analysis (skips what exists)
set -u; cd "$(dirname "$0")/../../.."; CFG="$1"; P=runs/drift-swiftshader; F=evaluator; REFD=runs/phase1/oracle-extension; BASE=runs/phase2/raw
for g in A B C D L; do OUT=$P/raw/$CFG/group$g-run1; D=$OUT/allrows-bits-ext.json; ref=$REFD/group$g/lavapipe-arm64-run1; base=$BASE/group$g/swiftshader-arm64-run1; [ -f $D ] || continue
  [ -f $OUT/input-identity.txt ] || node tools/phase3/drift-swiftshader/check-input-identity.mjs $ref/allrows-bits-ext.json $D > $OUT/input-identity.txt 2>&1 || echo "INPUT IDENTITY FAILED $CFG $g"
  [ -f $OUT/eval.json ] || bash tools/phase3/drift-swiftshader/evaluate-with-meta.sh $D $OUT/eval.json > /dev/null || echo "EVAL FAILED $CFG $g"
  [ -f $OUT/cmp-vs-m155.json ] || node $F/compare-bits-ext.mjs $OUT/cmp-vs-m155.json m155=$base/allrows-bits-ext.json $CFG=$D > /dev/null 2>&1
  [ -f $OUT/analysis-vs-m155.json ] || node tools/phase3/drift-swiftshader/analyze-drift.mjs $OUT/analysis-vs-m155.json $base/allrows-bits-ext.json $D > $OUT/analysis-vs-m155.txt 2>&1
done; echo "postproc $CFG done"
