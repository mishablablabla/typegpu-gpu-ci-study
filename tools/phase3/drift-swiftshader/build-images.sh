#!/bin/bash
# usage: [ACQ=<acquisition dir if != cfg>] [DF=Dockerfile.overlay-libcxx] build-images.sh <cfg> [kinds: dump full inv ex cts]   (run from anywhere; one docker build at a time)
set -eu; ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; CFG="$1"; shift; KINDS="${*:-dump full inv ex cts}"; cd "$ROOT"
P=runs/drift-swiftshader
ACQ="${ACQ:-$CFG}"; DF="${DF:-Dockerfile.overlay}"
SHA=$(shasum -a 256 $P/acquisition/$ACQ/extract/usr/lib/chromium/libvk_swiftshader.so | cut -d' ' -f1)
for k in $KINDS; do
  case $k in dump) B=tgci-swiftshader-oracle-ext:arm64;; full) B=tgci-swiftshader-full:arm64;; inv) B=tgci-inv-swiftshader:arm64;; ex) B=tgci-ex-swiftshader:arm64;; cts) B=tgci-swiftshader-cts:arm64;; esac
  T=tgci-p3-driftss-$CFG-$k:arm64
  docker image inspect "$T" >/dev/null 2>&1 && { echo "$T exists; skipping"; continue; }
  docker build --no-cache --progress=plain --iidfile $P/acquisition/$ACQ/docker-build-$CFG-$k.id --build-arg BASE=$B --build-arg CFG=$CFG --build-arg ACQ=$ACQ --build-arg ICD_SHA256=$SHA -f docker/drift-swiftshader/$DF -t $T . > $P/acquisition/$ACQ/docker-build-$CFG-$k.log 2>&1 || { echo "BUILD FAILED $T"; tail -5 $P/acquisition/$ACQ/docker-build-$CFG-$k.log; continue; }
  echo "built $T $(cat $P/acquisition/$ACQ/docker-build-$CFG-$k.id)"
done
