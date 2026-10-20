#!/usr/bin/env bash
set -u; cd "$(dirname "$0")/../.."; OUT="$1"; [ -e "$OUT" ] && { echo exists; exit 2; }
LAV=tgci-oracle-ext; SS=tgci-swiftshader-oracle-ext:arm64
ops_of() { case $1 in A) echo add,sub,mul,neg;; C) echo inverseSqrt,exp,exp2,sin,cos;; L) echo mod,log,log2,pow;; esac; }
for pair in $(seq 1 ${PAIRS:-6}); do for g in A C L; do if [ $((pair % 2)) -eq 1 ]; then order="lav ss"; else order="ss lav"; fi
  for who in $order; do img=$LAV; [ $who = ss ] && img=$SS; s=$(date +%s.%N 2>/dev/null || date +%s)
    d=$(docker run --rm --cpuset-cpus=0-3 -e EXT_OPS=$(ops_of $g) $img sh -c 'cd /work/webgpu-poc && BD_OUT=/tmp/x.json npx vitest run -c evaluator/vitest.config.mts dump-bits-ext.test.ts 2>&1 | sed "s/\x1b\[[0-9;]*m//g" | grep -E "Duration|passed|failed"' | tr '\n' ' '); e=$(date +%s.%N 2>/dev/null || date +%s)
    echo "{\"pair\":$pair,\"group\":\"$g\",\"who\":\"$who\",\"order\":\"$order\",\"vitest\":\"$d\"}" >> "$OUT"; done; done; done
