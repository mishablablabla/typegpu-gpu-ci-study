#!/usr/bin/env bash
set -u; . "$(dirname "$0")/lib.sh"; D="$OUT/acq-swiftshader"; mkdir -p "$D"
DEB_URL=https://snapshot.debian.org/archive/debian-security/20261015T173155Z/pool/updates/main/c/chromium/chromium-common_155.0.8059.79-1~deb13u1_amd64.deb
DEB_SHA256=3ea439a3991cac4ebc9741484bf93f848327bdd413b78853bb025454f419f9a6
stage apt-update sudo apt-get update > "$D/apt-update.log" 2>&1 || { tail -5 "$D/apt-update.log"; exit 1; }
stage apt-install sudo apt-get install -y --no-install-recommends libvulkan1 vulkan-tools > "$D/apt-install.log" 2>&1 || { tail -15 "$D/apt-install.log"; exit 1; }
dpkg-query -W -f='${Package} ${Version}\n' libvulkan1 vulkan-tools mesa-vulkan-drivers 2>&1 | sed 's/^dpkg-query: no packages found matching \(.*\)/\1 NOT INSTALLED/' > "$D/versions.txt"
mkdir -p ss; stage deb-download curl -fL --retry 3 --retry-delay 2 -sS -w 'http=%{http_code} size=%{size_download} time=%{time_total}\n' -o ss/c.deb "$DEB_URL" > "$D/deb-download.txt" 2>&1 || { cat "$D/deb-download.txt"; exit 1; }
stage deb-verify bash -c 'echo "'"$DEB_SHA256"'  ss/c.deb" | sha256sum -c -' > "$D/deb-sha256-check.txt" 2>&1 || { cat "$D/deb-sha256-check.txt"; exit 1; }
stage deb-extract dpkg-deb -x ss/c.deb ss/x || exit 1
X=ss/x/usr/lib/chromium; sha256sum $X/libvk_swiftshader.so $X/vk_swiftshader_icd.json > "$D/icd-files.sha256"; cp $X/vk_swiftshader_icd.json "$D/icd.json"
ICD="$PWD/$X/vk_swiftshader_icd.json"; echo "$ICD" > "$D/icd-path.txt"
{ echo "VK_DRIVER_FILES=$ICD"; echo "VK_ICD_FILENAMES=$ICD"; echo "VK_LOADER_DRIVERS_SELECT=vk_swiftshader_icd.json"; } >> "$GITHUB_ENV"
