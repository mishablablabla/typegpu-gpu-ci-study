#!/bin/bash
# usage: tools/phase3/drift-swiftshader/ssbuild-run.sh <Subzero|LLVM> <outdir (new)>   builds Dawn's SwiftShader pin in a slot-limited container (2 CPU / 2 GB / 2 jobs)
set -u; B="$1"; OUT="$2"; T="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$T/../../.." && pwd)"; [ -e "$OUT" ] && { echo "$OUT exists"; exit 2; }; mkdir -p "$OUT"
SHA="${3:-1e80438d2b93ef36a7c05f8d2b81233bac0e3d16}"
"${WITH_SLOT:-$ROOT/tools/with-slot.sh}" docker run --rm --cpus 2 --memory 2g -v "$T":/tools:ro -v "$OUT":/out -e BACKEND=$B -e SS_SHA=$SHA -e JOBS=2 tgci-p3-driftss-ssbuild:arm64 sh /tools/ssbuild-in-container.sh > "$OUT/container-stdout.txt" 2> "$OUT/container-stderr.txt"; echo "docker exit $?" >> "$OUT/host.txt"
