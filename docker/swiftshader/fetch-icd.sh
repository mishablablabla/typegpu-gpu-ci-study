#!/bin/bash
# usage: docker/swiftshader/fetch-icd.sh <arm64|amd64>
set -eu
ARCH="${1:?arm64|amd64}"; ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; D="$ROOT/docker/swiftshader/icd"
case "$ARCH" in
  amd64) SHA=3ea439a3991cac4ebc9741484bf93f848327bdd413b78853bb025454f419f9a6;;
  arm64) SHA=2f8d97e652adc2afa8cc96f79141ffdff0ca4f11c3a35671e7b61f60d10eb2b5;;
  *) echo "arch must be arm64 or amd64" >&2; exit 2;;
esac
URL="https://snapshot.debian.org/archive/debian-security/20261015T173155Z/pool/updates/main/c/chromium/chromium-common_155.0.8059.79-1~deb13u1_${ARCH}.deb"
mkdir -p "$D/debs" "$D/extract-$ARCH"
curl -fL --retry 3 -sS -o "$D/debs/chromium-common-$ARCH.deb" "$URL"
echo "$SHA  $D/debs/chromium-common-$ARCH.deb" | { command -v sha256sum >/dev/null 2>&1 && sha256sum -c - || shasum -a 256 -c -; }
W="$(mktemp -d)"; ( cd "$W" && ar x "$D/debs/chromium-common-$ARCH.deb" ) 2>/dev/null || { cd "$W" && tar -xf "$D/debs/chromium-common-$ARCH.deb"; }
for m in "$W"/data.tar.*; do case "$m" in *.xz) tar -xJf "$m" -C "$D/extract-$ARCH" ./usr/lib/chromium/libvk_swiftshader.so ./usr/lib/chromium/vk_swiftshader_icd.json;; *.zst) zstd -dc "$m" | tar -x -C "$D/extract-$ARCH" ./usr/lib/chromium/libvk_swiftshader.so ./usr/lib/chromium/vk_swiftshader_icd.json;; *) tar -xf "$m" -C "$D/extract-$ARCH" ./usr/lib/chromium/libvk_swiftshader.so ./usr/lib/chromium/vk_swiftshader_icd.json;; esac; done
rm -rf "$W"
ls -l "$D/extract-$ARCH/usr/lib/chromium"
