#!/usr/bin/env bash
set -u; . "$(dirname "$0")/lib.sh"; P="$OUT/perf"; mkdir -p "$P"; PAIRS=${PAIRS:-6}; SIZES=${SIZES:-"30000 262144 1048576"}; KERNELS=${KERNELS:-"add pow sin exp2"}; K=${K:-30}; : > "$P/runs.jsonl"
for who in lav ss; do icd=$LVP_ICD; [ $who = ss ] && icd=$SS_ICD; env -u VK_LOADER_DRIVERS_SELECT VK_DRIVER_FILES=$icd VK_ICD_FILENAMES=$icd vulkaninfo --summary 2>/dev/null | grep -E "^GPU|deviceName|driverID|driverInfo" > "$P/vulkaninfo-$who.txt"; done
for pair in $(seq 1 "$PAIRS"); do for N in $SIZES; do for k in $KERNELS; do
  if [ $((pair % 2)) -eq 1 ]; then order="lav ss"; else order="ss lav"; fi
  for who in $order; do icd=$LVP_ICD; [ $who = ss ] && icd=$SS_ICD
    r=$(env -u VK_LOADER_DRIVERS_SELECT VK_DRIVER_FILES=$icd VK_ICD_FILENAMES=$icd timeout 180 node ci/soak/phase-timing-v3.mjs "$N" "$K" "$k" 2>>"$P/stderr.txt"); rc=$?
    if [ $rc -eq 0 ] && [ -n "$r" ]; then echo "{\"pair\":$pair,\"order\":\"$order\",\"who\":\"$who\",\"kernelArg\":\"$k\",\"N\":$N,\"result\":$r}" >> "$P/runs.jsonl"; else echo "{\"pair\":$pair,\"order\":\"$order\",\"who\":\"$who\",\"kernelArg\":\"$k\",\"N\":$N,\"FAILED_rc\":$rc}" >> "$P/runs.jsonl"; fi
  done; done; done; echo "pair $pair done $(date -u +%T)" >> "$P/progress.txt"; done
