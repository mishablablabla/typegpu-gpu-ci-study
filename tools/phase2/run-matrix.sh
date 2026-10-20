#!/usr/bin/env bash
set -u; cd "$(dirname "$0")/../.."; S=runs/phase2; F=evaluator; REFD=runs/phase1/oracle-extension; IMG=tgci-swiftshader-oracle-ext:arm64
ops_of() { case $1 in A) echo add,sub,mul,neg;; B) echo div,min,max;; C) echo inverseSqrt,exp,exp2,sin,cos;; D) echo sqrt,tanh;; L) echo mod,log,log2,pow;; esac; }
for run in ${RUNS:-1 2 3}; do for g in ${GROUPS_TO_RUN:-A B C D L}; do
  OUT=$S/raw/group$g/swiftshader-arm64-run$run; ref=$REFD/group$g/lavapipe-arm64-run1
  s=$(date +%s); MODE=dump EXT_OPS=$(ops_of $g) OUT=$OUT docker/swiftshader/run.sh $IMG; e=$(date +%s); echo "wall_seconds_including_container_start=$((e-s))" >> $OUT/host-command.txt
  D=$OUT/allrows-bits-ext.json; [ -f $D ] || { echo "NO DUMP for $g run$run"; continue; }
  node tools/phase2/check-input-identity.mjs $ref/allrows-bits-ext.json $D > $OUT/input-identity.txt 2>&1 || echo "INPUT IDENTITY FAILED $g run$run"
  bash tools/phase2/evaluate-with-meta.sh $D $OUT/eval.json > /dev/null || echo "EVAL FAILED $g run$run"
  node $F/cpu-vs-gpu-ext.mjs $D $OUT/cpu-vs-gpu.json > /dev/null 2>&1
  node $F/compare-bits-ext.mjs $OUT/cmp-vs-lavapipe.json lavapipe=$ref/allrows-bits-ext.json swiftshader=$D > /dev/null 2>&1
  echo "group$g run$run done: $(grep -c PASS $OUT/input-identity.txt) identity PASS, $(grep -c FAIL $OUT/input-identity.txt) FAIL"
done; done
