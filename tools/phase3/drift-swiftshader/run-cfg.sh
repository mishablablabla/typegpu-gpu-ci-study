#!/bin/bash
# usage: tools/phase3/drift-swiftshader/run-cfg.sh <cfg>   -- ONE slot held for all stages of one config (dumps A B C D L, full, inv, ex, cts); skips stages whose raw dir already exists; host-side post-processing is done separately (tools/phase3/drift-swiftshader/postproc-dumps.sh).
set -u; cd "$(dirname "$0")/../../.."; CFG="$1"; P=runs/drift-swiftshader
ops_of() { case $1 in A) echo add,sub,mul,neg;; B) echo div,min,max;; C) echo inverseSqrt,exp,exp2,sin,cos;; D) echo sqrt,tanh;; L) echo mod,log,log2,pow;; esac; }
export NOSLOT=1
for g in A B C D L; do OUT=$P/raw/$CFG/group$g-run1; [ -e $OUT ] || KIND=dump CFG=$CFG MODE=dump EXT_OPS=$(ops_of $g) OUT=$OUT tools/phase3/drift-swiftshader/run-container.sh | tail -1; done
for k in full inv ex cts; do OUT=$P/raw/$CFG/$k-run1; [ -e $OUT ] || KIND=$k CFG=$CFG OUT=$OUT tools/phase3/drift-swiftshader/run-container.sh | tail -1; done
echo "CFG-DONE $CFG $(date -u +%T)"
