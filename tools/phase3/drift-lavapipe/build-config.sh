#!/bin/bash
# usage: build-config.sh <cfg>   (one build at a time). Reads docker/drift-lavapipe/configs.tsv; image tag tgci-p3-driftlvp-<cfg>; log in logs/build-<cfg>.log
set -u; ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; HERE="$ROOT/runs/drift-lavapipe"; CFGS="$ROOT/docker/drift-lavapipe/configs.tsv"; TOOLS="$ROOT/tools/phase3/drift-lavapipe"; mkdir -p "$HERE/logs" "$HERE/raw/probes"; cfg="${1:?cfg}"
line=$(grep -v '^#' "$CFGS" | awk -F'\t' -v c="$cfg" '$1==c'); [ -n "$line" ] || { echo "unknown cfg $cfg"; exit 2; }
IFS=$'\t' read -r _ base mesa llpkg llver note <<< "$line"
cd "$ROOT"; s=$(date +%s)
docker build --progress=plain -f docker/drift-lavapipe/Dockerfile.driftlvp \
  --build-arg CFG="$cfg" --build-arg BASE="$base" --build-arg EXPECT_MESA="$mesa" --build-arg EXPECT_LLVM_PKG="$llpkg" --build-arg EXPECT_LLVM_VER="$llver" \
  -t "tgci-p3-driftlvp-$cfg" . > "$HERE/logs/build-$cfg.$(date -u +%H%M%S).log" 2>&1; rc=$?
echo "build $cfg exit $rc wall $(( $(date +%s)-s ))s"; exit $rc
