#!/bin/sh
set -u; cd /work/webgpu-poc; O=/tmp/out; mkdir -p $O; log() { echo "$(date -u +%FT%TZ) $*" >> $O/commands.log; }; log start
{ echo "arch: $(uname -m)"; echo "kernel: $(uname -r)"; . /etc/os-release; echo "$PRETTY_NAME"; echo "node $(node -v)"; for p in typegpu unplugin-typegpu vitest webgpu; do echo "$p $(node -p "require(\"./node_modules/$p/package.json\").version")"; done
  dpkg -s mesa-vulkan-drivers >/dev/null 2>&1 && echo "mesa-vulkan-drivers: INSTALLED" || echo "mesa-vulkan-drivers: NOT INSTALLED"; echo "nproc: $(nproc)"; grep -m1 "model name" /proc/cpuinfo || true; echo "VK_DRIVER_FILES=$VK_DRIVER_FILES"; sha256sum /opt/swiftshader/libvk_swiftshader.so /opt/swiftshader/vk_swiftshader_icd.json; } > $O/env.txt 2>&1
{ for d in /usr/share/vulkan/icd.d /etc/vulkan/icd.d "$HOME/.config/vulkan/icd.d"; do [ -d "$d" ] && ls -A "$d" | sed "s#^#$d/#"; done; } > $O/icd-dirs.raw 2>&1; if [ -s $O/icd-dirs.raw ]; then cp $O/icd-dirs.raw $O/icd-dirs.txt; else echo ICD-DIRS-EMPTY > $O/icd-dirs.txt; fi; rm $O/icd-dirs.raw
vulkaninfo --summary > $O/vulkaninfo.txt 2> $O/vulkaninfo.stderr; VK_LOADER_DEBUG=driver vulkaninfo --summary > /dev/null 2> $O/loader-trace.txt
node docker/in-container/probe-strict.cjs > $O/adapter-strict.json 2> $O/adapter-strict.stderr; node docker/in-container/assert-backend.mjs $O > /dev/null 2>&1; A=$?; log "assert-backend exit $A"
if [ $A -ne 0 ]; then echo "backend assertion FAILED; suite not run" > $O/ABORTED.txt; echo 3 > $O/exit-code.txt; exit 0; fi
find lib diff ported selftest scripts step1.mjs step2.test.ts step3.test.ts harness.ts vitest.config.mts package.json package-lock.json -type f -exec sha256sum {} + | sort -k2 > $O/sources.sha256
node scripts/run.mjs > $O/conformance.log 2>&1; echo $? > $O/exit-code.txt; log "run.mjs exit $(cat $O/exit-code.txt)"
mkdir -p $O/reports; cp -R reports/. $O/reports/ 2>/dev/null; log end
