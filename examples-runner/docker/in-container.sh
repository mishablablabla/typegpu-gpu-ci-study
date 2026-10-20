#!/bin/sh
set -u; O=/tmp/out; mkdir -p $O/identity; I=$O/identity; cd /work/webgpu-poc
{ echo "arch: $(uname -m)"; echo "kernel: $(uname -r)"; . /etc/os-release; echo "$PRETTY_NAME"; echo "node $(node -v)"; for p in webgpu; do echo "$p $(node -p "require('/work/ex/runner/node_modules/$p/package.json').version")"; done
  dpkg-query -W -f='${Package} ${Version}\n' mesa-vulkan-drivers libllvm20 libvulkan1 2>/dev/null; dpkg -s mesa-vulkan-drivers >/dev/null 2>&1 && echo "mesa-vulkan-drivers: INSTALLED" || echo "mesa-vulkan-drivers: NOT INSTALLED"; echo "nproc: $(nproc)"; grep -m1 "model name" /proc/cpuinfo || true; echo "VK_DRIVER_FILES=${VK_DRIVER_FILES:-}"; [ -f /opt/swiftshader/libvk_swiftshader.so ] && sha256sum /opt/swiftshader/libvk_swiftshader.so; (cd /work/ex/typegpu && git log -1 --format=%H 2>/dev/null); cat /work/ex/typegpu/../typegpu/package.json | grep '"version"' | head -1; } > $I/env.txt 2>&1
{ for d in /usr/share/vulkan/icd.d /etc/vulkan/icd.d "$HOME/.config/vulkan/icd.d"; do [ -d "$d" ] && ls -A "$d" | sed "s#^#$d/#"; done; } > $I/icd-dirs.raw 2>&1; if [ -s $I/icd-dirs.raw ]; then cp $I/icd-dirs.raw $I/icd-dirs.txt; else echo ICD-DIRS-EMPTY > $I/icd-dirs.txt; fi; rm $I/icd-dirs.raw
VK_LOADER_DEBUG=driver vulkaninfo --summary > /dev/null 2> $I/loader-trace.txt; vulkaninfo --summary > $I/vulkaninfo.txt 2> /dev/null; node third_party/adapter-probe.js > $I/adapter.json 2>&1; node docker/in-container/probe-strict.cjs > $I/adapter-strict.json 2> /dev/null
if [ "${BACKEND:-}" = swiftshader ]; then node docker/in-container/assert-backend.mjs $I > /dev/null 2>&1; A=$?; else if grep -q "llvmpipe" $I/vulkaninfo.txt && ! grep -qi swiftshader $I/vulkaninfo.txt && grep -q "mesa" $I/adapter.json; then A=0; echo "lavapipe identity: llvmpipe in vulkaninfo, mesa in adapter, no SwiftShader" > $I/backend-assert.txt; else A=3; echo "FAIL lavapipe identity" > $I/backend-assert.txt; fi; fi
echo "backend assertion exit $A" >> $O/commands.log
if [ $A -ne 0 ]; then echo "backend assertion FAILED; examples not run" > $O/ABORTED.txt; exit 0; fi
s=$(date +%s); TYPEGPU_ROOT=/work/ex/typegpu /work/ex/runner/run-all.sh "$BACKEND" $O/run > $O/run-all.stdout 2> $O/run-all.stderr; echo "run-all exit $? wall $(( $(date +%s)-s ))s" >> $O/commands.log
mkdir -p $O/probes; cd /work/ex/runner/probes; node signed-zero.mjs > $O/probes/signed-zero.json 2> $O/probes/signed-zero.err
for sz in "64 8" "256 6" "1024 6"; do set -- $sz; node gol-check.mjs /work/ex/typegpu $O/probes/gol-$1.json $1 $2 > $O/probes/gol-$1.out 2> $O/probes/gol-$1.err; done
echo "probes done" >> $O/commands.log
