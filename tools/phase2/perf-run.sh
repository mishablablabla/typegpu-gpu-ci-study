#!/usr/bin/env bash
set -u; cd "$(dirname "$0")/../.."; S=runs/phase2; OUT="$1"; [ -e "$OUT" ] && { echo "exists"; exit 2; }
LAV=${LAV:-tgci-oracle-ext}; SS=${SS:-tgci-swiftshader-oracle-ext:arm64}; PAIRS=${PAIRS:-8}
for pair in $(seq 1 $PAIRS); do for N in ${SIZES:-30000 65536}; do for k in add pow sin exp2; do
  if [ $((pair % 2)) -eq 1 ]; then order="lav ss"; else order="ss lav"; fi
  for who in $order; do img=$LAV; [ $who = ss ] && img=$SS
    r=$(docker run --rm --cpuset-cpus=${CPUSET:-0-3} -v "$PWD/tools/phase2":/perf:ro $img timeout 120 node /perf/${SCRIPT:-phase-timing.mjs} $N 30 $k 2>/dev/null); rc=$?
    if [ $rc -eq 0 ] && [ -n "$r" ]; then echo "{\"pair\":$pair,\"order\":\"$order\",\"who\":\"$who\",\"kernelArg\":\"$k\",\"N\":$N,\"result\":$r}" >> "$OUT"; else echo "{\"pair\":$pair,\"who\":\"$who\",\"kernelArg\":\"$k\",\"N\":$N,\"FAILED_rc\":$rc}" >> "$OUT"; fi
  done; done; done; echo "pair $pair done $(date -u +%T)" >&2; done
