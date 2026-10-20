#!/usr/bin/env bash
set -u; . "$(dirname "$0")/lib.sh"; I="$OUT/identity"; mkdir -p "$I"
{ echo "VK_DRIVER_FILES=${VK_DRIVER_FILES:-}"; echo "VK_ICD_FILENAMES=${VK_ICD_FILENAMES:-}"; echo "VK_LOADER_DRIVERS_SELECT=${VK_LOADER_DRIVERS_SELECT:-}"; echo "node $(node -v)"; for p in typegpu unplugin-typegpu vitest webgpu; do echo "$p $(node -p "require('./node_modules/$p/package.json').version")"; done; } > "$I/env.txt"
vulkaninfo --summary > "$I/vulkaninfo.txt" 2> "$I/vulkaninfo.stderr"
VK_LOADER_DEBUG=driver vulkaninfo --summary > /dev/null 2> "$I/loader-trace.txt"
node docker/in-container/probe-strict.cjs > "$I/adapter-strict.json" 2> "$I/adapter-strict.stderr"
node ci/soak/assert-identity.mjs "${SOAK_BACKEND:?}" "$I"
