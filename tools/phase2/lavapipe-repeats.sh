#!/usr/bin/env bash
set -u; cd "$(dirname "$0")/../.."; S=runs/phase2; F=evaluator; REFD=runs/phase1/oracle-extension
ops_of() { case $1 in A) echo add,sub,mul,neg;; B) echo div,min,max;; C) echo inverseSqrt,exp,exp2,sin,cos;; D) echo sqrt,tanh;; E) echo add,sub,mul;; L) echo mod,log,log2,pow;; esac; }
for r in ${RUNS:-1 2}; do for g in ${GROUPS_TO_RUN:-A B D E L}; do OUT=$S/lavapipe-repeats/group$g/lavapipe-arm64-repeat$r
  if [ $g = E ]; then ref=$REFD/groupE/lavapipe-arm64-run2; EXT_FILE=dump-bits-ext-f16.test.ts EXT_OPS=$(ops_of $g) OUT=$OUT docker/oracle-ext/run.sh tgci-oracle-ext > /dev/null; else ref=$REFD/group$g/lavapipe-arm64-run1; EXT_OPS=$(ops_of $g) OUT=$OUT docker/oracle-ext/run.sh tgci-oracle-ext > /dev/null; fi
  D=$OUT/allrows-bits-ext.json; [ -f $D ] || { echo "NO DUMP $g r$r"; continue; }
  bash tools/phase2/evaluate-with-meta.sh $D $OUT/eval.json > /dev/null || echo "EVAL FAILED"
  echo "group$g repeat$r: dump $( [ "$(shasum -a 256 < $D | cut -d' ' -f1)" = "$(shasum -a 256 < $ref/allrows-bits-ext.json | cut -d' ' -f1)" ] && echo BYTE-IDENTICAL-to-frozen || echo DIFFERS-from-frozen) | eval $(node -e "const a=require('./$OUT/eval.json'),b=require('./$ref/eval.json');a.input=b.input=0;console.log(JSON.stringify(a)===JSON.stringify(b)?'identical':'DIFFERENT')")"
done; done
