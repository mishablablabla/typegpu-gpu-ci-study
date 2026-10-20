#!/bin/sh
set -u; : "${BACKEND:?}" "${P3_WORK:?}" "${P3_OUT:?}"; POOLS="${POOLS:?}"; O="$P3_OUT"; mkdir -p "$O"; log() { echo "$(date -u +%FT%TZ) $*" >> "$O/commands.log"; }
export P3_WORK P3_ROOT="$P3_WORK/pool"; log "start backend=$BACKEND pools=$POOLS"
if [ "${P3_SCOPE:-container}" = container ]; then
  POC="${POC:-/work/webgpu-poc}"; cd "$POC" || exit 1
  { echo "arch: $(uname -m)"; echo "kernel: $(uname -r)"; . /etc/os-release; echo "$PRETTY_NAME"; echo "node $(node -v)"; for p in typegpu unplugin-typegpu vitest webgpu; do echo "$p $(node -p "require(\"./node_modules/$p/package.json\").version")"; done
    dpkg-query -W -f='${Package} ${Version}\n' mesa-vulkan-drivers libllvm20 libvulkan1 2>/dev/null; dpkg -s mesa-vulkan-drivers >/dev/null 2>&1 && echo "mesa-vulkan-drivers: INSTALLED" || echo "mesa-vulkan-drivers: NOT INSTALLED"; echo "nproc: $(nproc)"; grep -m1 "model name" /proc/cpuinfo || true; echo "VK_DRIVER_FILES=${VK_DRIVER_FILES:-}"; [ -f /opt/swiftshader/libvk_swiftshader.so ] && sha256sum /opt/swiftshader/libvk_swiftshader.so; } > "$O/env.txt" 2>&1
  { for d in /usr/share/vulkan/icd.d /etc/vulkan/icd.d "$HOME/.config/vulkan/icd.d"; do [ -d "$d" ] && ls -A "$d" | sed "s#^#$d/#"; done; } > "$O/icd-dirs.raw" 2>&1; if [ -s "$O/icd-dirs.raw" ]; then cp "$O/icd-dirs.raw" "$O/icd-dirs.txt"; else echo ICD-DIRS-EMPTY > "$O/icd-dirs.txt"; fi; rm "$O/icd-dirs.raw"
  VK_LOADER_DEBUG=driver vulkaninfo --summary > /dev/null 2> "$O/loader-trace.txt"; vulkaninfo --summary > "$O/vulkaninfo.txt" 2> /dev/null; node third_party/adapter-probe.js > "$O/adapter.json" 2>&1; node docker/in-container/probe-strict.cjs > "$O/adapter-strict.json" 2> /dev/null
  if [ "$BACKEND" = swiftshader ]; then node docker/in-container/assert-backend.mjs "$O" > /dev/null 2>&1; A=$?; else if grep -q "llvmpipe" "$O/vulkaninfo.txt" && ! grep -qi swiftshader "$O/vulkaninfo.txt" && grep -q "mesa" "$O/adapter.json"; then A=0; echo "lavapipe identity: llvmpipe in vulkaninfo, mesa in adapter, no SwiftShader" > "$O/backend-assert.txt"; else A=3; echo "FAIL lavapipe identity" > "$O/backend-assert.txt"; fi; fi
  log "preflight backend assertion exit $A"; if [ $A -ne 0 ]; then echo "backend assertion FAILED; pools not run" > "$O/ABORTED.txt"; exit 0; fi
else
  { echo "host: $(uname -srm)"; sw_vers 2>/dev/null; echo "node $(node -v)"; for p in typegpu unplugin-typegpu vitest webgpu; do echo "$p $(node -p "require('$P3_WORK/node_modules/$p/package.json').version")"; done; sysctl -n machdep.cpu.brand_string 2>/dev/null; } > "$O/env.txt" 2>&1
fi
cd "$P3_WORK" || exit 1
mkdir -p "$O/probe"; P3_FP_OUT="$O/probe" node --input-type=module -e "
import { create, globals } from 'webgpu'; import fs from 'node:fs';
const gpu = create([]); globalThis.__gpu = gpu; const a = await gpu.requestAdapter(); const i = a.info;
fs.appendFileSync(process.env.P3_FP_OUT + '/adapters-probe.jsonl', JSON.stringify({ vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description, shaderF16: a.features.has('shader-f16'), features: [...a.features].sort() }) + '\n'); process.exit(0);" > "$O/probe/probe.stdout" 2> "$O/probe/probe.stderr"
if ! node "$P3_WORK/p3/assert-adapters.mjs" "$BACKEND" "$O" > "$O/probe/assert.out" 2>&1; then echo "adapter assertion FAILED before pools" > "$O/ABORTED.txt"; log "preflight adapter assertion FAILED"; exit 0; fi
log "preflight adapter ok"
for p in $POOLS; do
  case "$p" in ex) T=600;; full) T=900;; own) T=300;; *) T=600;; esac
  s=$(date +%s); mkdir -p "$O/$p"; P3_FP_OUT="$O/$p" P3_CACHE="${P3_CACHE:-/tmp/p3-vite}-$p" node "$P3_WORK/p3/run-pool.mjs" "$p" "$O/$p" "$T"; log "pool $p done wall $(( $(date +%s)-s ))s $(cat "$O/$p/$p.exit.json" 2>/dev/null)"
done
node "$P3_WORK/p3/assert-adapters.mjs" "$BACKEND" "$O" > "$O/adapter-assert.out" 2>&1; log "final adapter assertion exit $?"; log end
