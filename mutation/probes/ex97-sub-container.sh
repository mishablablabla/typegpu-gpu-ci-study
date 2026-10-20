#!/bin/sh
set -u; O=/out; I=$O/identity; mkdir -p $I; cd /work/webgpu-poc
{ echo "arch: $(uname -m)"; . /etc/os-release; echo "$PRETTY_NAME"; echo "node $(node -v)"; dpkg-query -W -f='${Package} ${Version}\n' mesa-vulkan-drivers libllvm20 2>/dev/null; dpkg -s mesa-vulkan-drivers >/dev/null 2>&1 && echo "mesa-vulkan-drivers: INSTALLED" || echo "mesa-vulkan-drivers: NOT INSTALLED"; echo "nproc: $(nproc)"; echo "VK_DRIVER_FILES=${VK_DRIVER_FILES:-}"; [ -f /opt/swiftshader/libvk_swiftshader.so ] && sha256sum /opt/swiftshader/libvk_swiftshader.so; } > $I/env.txt 2>&1
{ for d in /usr/share/vulkan/icd.d /etc/vulkan/icd.d "$HOME/.config/vulkan/icd.d"; do [ -d "$d" ] && ls -A "$d" | sed "s#^#$d/#"; done; } > $I/icd-dirs.raw 2>&1; if [ -s $I/icd-dirs.raw ]; then cp $I/icd-dirs.raw $I/icd-dirs.txt; else echo ICD-DIRS-EMPTY > $I/icd-dirs.txt; fi; rm $I/icd-dirs.raw
VK_LOADER_DEBUG=driver vulkaninfo --summary > /dev/null 2> $I/loader-trace.txt; vulkaninfo --summary > $I/vulkaninfo.txt 2> /dev/null; node third_party/adapter-probe.js > $I/adapter.json 2>&1; node docker/in-container/probe-strict.cjs > $I/adapter-strict.json 2> /dev/null
if [ "${BACKEND:-}" = swiftshader ]; then node docker/in-container/assert-backend.mjs $I > /dev/null 2>&1; A=$?; else if grep -q "llvmpipe" $I/vulkaninfo.txt && ! grep -qi swiftshader $I/vulkaninfo.txt && grep -q "mesa" $I/adapter.json; then A=0; echo "lavapipe identity: llvmpipe in vulkaninfo, mesa in adapter, no SwiftShader" > $I/backend-assert.txt; else A=3; echo "FAIL lavapipe identity" > $I/backend-assert.txt; fi; fi
echo "backend assertion exit $A" >> $O/commands.log; [ $A -ne 0 ] && { echo FAILED > $O/ABORTED.txt; exit 0; }
cd /work/ex/typegpu; ( find packages -type f -not -path "*/node_modules/*" | sort | xargs sha256sum | sha256sum ) > $O/tree-BASE-before.sha 2>&1
for J in $JOBS; do
  if [ "$J" != BASE ]; then ( cd /p/mut/$J && find . -type f ) | while read f; do mkdir -p /tmp/orig/$J/$(dirname $f); cp /work/ex/typegpu/$f /tmp/orig/$J/$f; cp /p/mut/$J/$f /work/ex/typegpu/$f; done; ( cd /work/ex/typegpu && find packages -type f -not -path '*/node_modules/*' | sort | xargs sha256sum | sha256sum ) > $O/tree-$J.sha 2>&1; fi
  REP=1; [ "$J" = BASE ] && REP=2
  s=$(date +%s); TYPEGPU_ROOT=/work/ex/typegpu EX_REPEATS=$REP EX_JOBS=1 EX_TYPEGPU_REV="e893ad11+$J" /work/ex/runner/run-all.sh "$BACKEND" $O/$J > $O/$J.stdout 2> $O/$J.stderr; echo "$J exit $? wall $(( $(date +%s)-s ))s" >> $O/commands.log
  if [ "$J" != BASE ]; then ( cd /tmp/orig/$J && find . -type f ) | while read f; do cp /tmp/orig/$J/$f /work/ex/typegpu/$f; done; fi
done
( find packages -type f -not -path "*/node_modules/*" | sort | xargs sha256sum | sha256sum ) > $O/tree-after.sha 2>&1; echo end >> $O/commands.log
