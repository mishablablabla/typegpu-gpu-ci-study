#!/bin/sh
set -u
cd /work/webgpu-poc; O=/tmp/out; mkdir -p $O; MODE="${MODE:-dump}"
log() { echo "$(date -u +%FT%TZ) $*" >> $O/commands.log; }
if [ "$MODE" = control ]; then   # negative control: nonexistent ICD must give no adapter
  log "control: VK_DRIVER_FILES=/nonexistent"
  VK_DRIVER_FILES=/nonexistent VK_ICD_FILENAMES=/nonexistent VK_LOADER_DRIVERS_SELECT= node docker/in-container/probe-strict.cjs > $O/adapter-control.json 2> $O/adapter-control.stderr; echo $? > $O/exit-code.txt; exit 0
fi
log "start mode=$MODE ops=${EXT_OPS:-} file=${EXT_FILE:-}"
{ echo "arch: $(uname -m)"; echo "kernel: $(uname -r)"; . /etc/os-release; echo "$PRETTY_NAME"; echo "node $(node -v)"
  for p in typegpu unplugin-typegpu vitest webgpu; do echo "$p $(node -p "require(\"./node_modules/$p/package.json\").version")"; done
  dpkg-query -W -f='${Package} ${Version}\n' libvulkan1 vulkan-tools libc6 libstdc++6 2>/dev/null
  dpkg -s mesa-vulkan-drivers >/dev/null 2>&1 && echo "mesa-vulkan-drivers: INSTALLED" || echo "mesa-vulkan-drivers: NOT INSTALLED"
  echo "nproc: $(nproc)"; grep -m1 "model name" /proc/cpuinfo || true; grep -m1 -E "^(Flags|flags)" /proc/cpuinfo || true; lscpu 2>/dev/null | grep -E "Model name|Architecture|Thread|Core|Socket|Flags" || true; free -m | head -2
  echo "VK_DRIVER_FILES=$VK_DRIVER_FILES"; echo "VK_ICD_FILENAMES=$VK_ICD_FILENAMES"; echo "VK_LOADER_DRIVERS_SELECT=$VK_LOADER_DRIVERS_SELECT"
  echo "icd json: $(cat /opt/swiftshader/vk_swiftshader_icd.json)"; sha256sum /opt/swiftshader/libvk_swiftshader.so /opt/swiftshader/vk_swiftshader_icd.json; file /opt/swiftshader/libvk_swiftshader.so; ldd /opt/swiftshader/libvk_swiftshader.so 2>&1 | head -12; ls -l /opt/swiftshader
  echo "libvulkan1 loader: $(ls -l /usr/lib/*/libvulkan.so.1* 2>/dev/null | tr '\n' ' ')"; } > $O/env.txt 2>&1
{ for d in /usr/share/vulkan/icd.d /etc/vulkan/icd.d "$HOME/.config/vulkan/icd.d" /usr/local/share/vulkan/icd.d; do [ -d "$d" ] && ls -A "$d" | sed "s#^#$d/#"; done; } > $O/icd-dirs.raw 2>&1
if [ -s $O/icd-dirs.raw ]; then cp $O/icd-dirs.raw $O/icd-dirs.txt; else echo ICD-DIRS-EMPTY > $O/icd-dirs.txt; fi; rm $O/icd-dirs.raw
vulkaninfo --summary > $O/vulkaninfo.txt 2> $O/vulkaninfo.stderr; echo "vulkaninfo exit $?" >> $O/commands.log
VK_LOADER_DEBUG=driver vulkaninfo --summary > /dev/null 2> $O/loader-trace.txt
node docker/in-container/probe-strict.cjs > $O/adapter-strict.json 2> $O/adapter-strict.stderr; log "probe-strict exit $?"
node third_party/adapter-probe.js > $O/adapter.json 2>&1; log "adapter-probe (frozen) exit $?"
node docker/in-container/assert-backend.mjs $O > /dev/null 2>&1; A=$?; log "assert-backend exit $A"
if [ $A -ne 0 ]; then echo "backend assertion FAILED; no run executed" > $O/ABORTED.txt; echo 3 > $O/exit-code.txt; exit 0; fi
find lib diff ported evaluator harness.ts vitest.config.mts package.json package-lock.json -type f -exec sha256sum {} + | sort -k2 > $O/sources.sha256
sha256sum third_party/dawn-node-provider.js third_party/adapter-probe.js docker/in-container/* >> $O/sources.extra.sha256 2>/dev/null
if [ "$MODE" = smoke ]; then
  log "step1.mjs"; VK_LOADER_DEBUG=driver node step1.mjs > $O/step1.txt 2> $O/step1.stderr; echo $? > $O/step1-exit.txt; log "step1 exit $(cat $O/step1-exit.txt)"
fi
log "vitest $EXT_FILE"
BD_OUT=$O/allrows-bits-ext.json VK_LOADER_DEBUG=driver npx vitest run -c evaluator/vitest.config.mts ${EXT_FILE:-dump-bits-ext.test.ts} > $O/vitest.log 2>&1; echo $? > $O/exit-code.txt; log "vitest exit $(cat $O/exit-code.txt)"
node docker/in-container/probe-strict.cjs > $O/adapter-strict-after.json 2> /dev/null
log "end"
