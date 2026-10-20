#!/bin/bash
# usage: fetch-zip.sh <cfg-label> <url> <zip-member-prefix-or-empty>
set -eu
CFG="$1"; URL="$2"; A="$(cd "$(dirname "$0")/../../.." && pwd)/runs/drift-swiftshader/acquisition"; mkdir -p "$A"; D="$A/$CFG"; [ -e "$D" ] && { echo "$D exists; refusing"; exit 2; }; mkdir -p "$D/zips" "$D/extract/usr/lib/chromium"
NAME=$(basename "$URL"); curl -fsSL -o "$D/zips/$NAME" "$URL"
SIZE=$(stat -f %z "$D/zips/$NAME"); SHA256=$(shasum -a 256 "$D/zips/$NAME" | cut -d' ' -f1)
{ echo "downloaded $(date -u +%FT%TZ)"; echo "url $URL"; echo "size_bytes $SIZE"; echo "sha256 $SHA256"; } > "$D/SOURCE.txt"
unzip -l "$D/zips/$NAME" | grep -iE 'swiftshader|vk_|libvulkan|libEGL|libGLES' > "$D/zip-listing-grep.txt" || true; cat "$D/zip-listing-grep.txt"
W=$(mktemp -d); unzip -q -j "$D/zips/$NAME" '*libvk_swiftshader.so' '*vk_swiftshader_icd.json' -d "$W"
cp "$W/libvk_swiftshader.so" "$W/vk_swiftshader_icd.json" "$D/extract/usr/lib/chromium/"; rm -rf "$W"
echo "ok $CFG size=$SIZE sha256=$SHA256"
