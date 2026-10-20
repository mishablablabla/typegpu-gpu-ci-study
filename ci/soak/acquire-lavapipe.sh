#!/usr/bin/env bash
set -u; . "$(dirname "$0")/lib.sh"; D="$OUT/acq-lavapipe"; mkdir -p "$D"
stage apt-update sudo apt-get update > "$D/apt-update.log" 2>&1 || { tail -5 "$D/apt-update.log"; exit 1; }
{ apt-cache madison mesa-vulkan-drivers libvulkan1 vulkan-tools; apt-cache policy mesa-vulkan-drivers libllvm20; cat /etc/apt/apt-mirrors.txt 2>/dev/null; } > "$D/apt-madison.txt" 2>&1
stage apt-install sudo apt-get install -y --no-install-recommends mesa-vulkan-drivers libvulkan1 vulkan-tools > "$D/apt-install.log" 2>&1 || { tail -15 "$D/apt-install.log"; exit 1; }
dpkg-query -W -f='${Package} ${Version}\n' mesa-vulkan-drivers libvulkan1 vulkan-tools 'libllvm*' libdrm2 libstdc++6 libc6 2>/dev/null > "$D/versions.txt"
ICD=$(ls /usr/share/vulkan/icd.d/lvp_icd*.json 2>/dev/null | head -1); [ -n "$ICD" ] || { echo "no lvp ICD manifest found"; ls /usr/share/vulkan/icd.d; exit 1; }
echo "VK_DRIVER_FILES=$ICD" >> "$GITHUB_ENV"; echo "$ICD" > "$D/icd-path.txt"; cat "$ICD" > "$D/icd.json"
