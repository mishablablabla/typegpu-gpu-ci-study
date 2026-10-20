#!/bin/bash
cd "$(dirname "$0")/../../.."; W=runs/drift-lavapipe; REF=$W/raw/noble-25.2.8/run2; mkdir -p $W/analysis/arch-noise; : > $W/analysis/arch-noise/arch-noise.txt
N=runs/phase2/native-x64
for g in A B C D L E; do
  for x in $N/run-3928705*/cmp-x64-results-*/pinned-lavapipe/group$g/lavapipe-pinned-x64/allrows-bits-ext.json $N/run-3928707*/cmp-x64-results-*/pinned-lavapipe/group$g/lavapipe-pinned-x64/allrows-bits-ext.json runs/phase1/oracle-extension/group$g/x64-*/allrows-bits-ext.json; do
    [ -f "$x" ] || continue; env=$(dirname "$x")/env.txt; mv=$(grep -h '^mesa-vulkan-drivers' "$env" 2>/dev/null | head -1); tag=$(echo "$x" | sed 's#/allrows-bits-ext.json##; s#.*/\(run-[0-9]*\).*/pinned-lavapipe/group./\(.*\)#\1-\2#; s#runs/phase1/oracle-extension/group./##')
    echo "group$g x64 [$tag] ($mv): $(node tools/phase3/drift-lavapipe/analysis/dump-drift.mjs $W/analysis/arch-noise/arm64-vs-x64-group$g-$tag.json $REF/dump/group$g/allrows-bits-ext.json $x)" | tee -a $W/analysis/arch-noise/arch-noise.txt
  done
done
