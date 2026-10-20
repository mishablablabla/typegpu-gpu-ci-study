#!/bin/sh
set -u
O=/tmp/out; mkdir -p $O; cd /work/webgpu-poc
log() { echo "$(date -u +%FT%TZ) $*" >> $O/commands.log; }
log start
{ echo "arch: $(uname -m)"; echo "kernel: $(uname -r)"; . /etc/os-release; echo "$PRETTY_NAME"; echo "node $(node -v)"; echo "webgpu $(node -p "require('./node_modules/webgpu/package.json').version")"
  dpkg-query -W -f='${Package} ${Version}\n' libvulkan1 vulkan-tools libc6 libstdc++6 2>/dev/null
  dpkg -s mesa-vulkan-drivers >/dev/null 2>&1 && echo "mesa-vulkan-drivers: INSTALLED" || echo "mesa-vulkan-drivers: NOT INSTALLED"
  echo "nproc: $(nproc)"; grep -m1 "model name" /proc/cpuinfo || true; lscpu 2>/dev/null | grep -E "Model name|Architecture|Thread|Core|Socket" || true; free -m | head -2
  echo "VK_DRIVER_FILES=$VK_DRIVER_FILES"; sha256sum /opt/swiftshader/libvk_swiftshader.so /opt/swiftshader/vk_swiftshader_icd.json; echo "HARNESS_GRID=${HARNESS_GRID:-}"; } > $O/env.txt 2>&1
{ for d in /usr/share/vulkan/icd.d /etc/vulkan/icd.d "$HOME/.config/vulkan/icd.d"; do [ -d "$d" ] && ls -A "$d" | sed "s#^#$d/#"; done; } > $O/icd-dirs.raw 2>&1
if [ -s $O/icd-dirs.raw ]; then cp $O/icd-dirs.raw $O/icd-dirs.txt; else echo ICD-DIRS-EMPTY > $O/icd-dirs.txt; fi; rm $O/icd-dirs.raw
vulkaninfo --summary > $O/vulkaninfo.txt 2> $O/vulkaninfo.stderr; VK_LOADER_DEBUG=driver vulkaninfo --summary > /dev/null 2> $O/loader-trace.txt
node docker/in-container/probe-strict.cjs > $O/adapter-strict.json 2> $O/adapter-strict.stderr; node third_party/adapter-probe.js > $O/adapter.json 2>&1
node docker/in-container/assert-backend.mjs $O > /dev/null 2>&1; A=$?; log "assert-backend exit $A"
if [ $A -ne 0 ]; then echo "backend assertion FAILED; CTS not run" > $O/ABORTED.txt; echo 3 > $O/exit-code.txt; exit 0; fi
( cd third_party; CTS_EXTENDED=1 sh -c 'bash ./run-cts-swiftshader.sh /tmp/out/cts-files' > $O/run.log 2>&1 ); echo $? > $O/exit-code.txt; log "run-cts exit $(cat $O/exit-code.txt)"
mv $O/cts-files/* $O/ 2>/dev/null; rmdir $O/cts-files 2>/dev/null; log end
