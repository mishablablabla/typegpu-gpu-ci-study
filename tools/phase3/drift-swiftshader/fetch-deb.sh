#!/bin/bash
# usage: fetch-deb.sh <cfg-label> <version> <archive_name> <first_seen> [pkg=chromium-common]
set -eu
CFG="$1"; VER="$2"; ARCH_NAME="$3"; SEEN="$4"; PKG="${5:-chromium-common}"
A="$(cd "$(dirname "$0")/../../.." && pwd)/runs/drift-swiftshader/acquisition"; mkdir -p "$A"; D="$A/$CFG"; [ -e "$D" ] && { echo "$D exists; refusing"; exit 2; }; mkdir -p "$D/debs" "$D/extract"
SNAP_SHA1=$(curl -fsS "https://snapshot.debian.org/mr/binary/$PKG/$VER/binfiles" | python3 -I -c "import json,sys;print([x['hash'] for x in json.load(sys.stdin)['result'] if x['architecture']=='arm64'][0])")
NAME="${PKG}_${VER}_arm64.deb"; URL="https://snapshot.debian.org/archive/$ARCH_NAME/$SEEN/pool/updates/main/c/chromium/$NAME"
curl -fsSL -o "$D/debs/$NAME" "$URL"
GOT1=$(shasum -a 1 "$D/debs/$NAME" | cut -d' ' -f1); [ "$GOT1" = "$SNAP_SHA1" ] || { echo "SHA1 MISMATCH $GOT1 vs $SNAP_SHA1"; exit 3; }
SIZE=$(stat -f %z "$D/debs/$NAME"); SHA256=$(shasum -a 256 "$D/debs/$NAME" | cut -d' ' -f1)
{ echo "downloaded $(date -u +%FT%TZ)"; echo "url $URL"; echo "package $PKG version $VER arch arm64"; echo "snapshot-sha1 $SNAP_SHA1 (== downloaded)"; echo "size_bytes $SIZE"; echo "sha256 $SHA256"; } > "$D/SOURCE.txt"
echo "$SHA256  $NAME" > "$D/debs.sha256"
W=$(mktemp -d); ( cd "$W" && tar -xf "$D/debs/$NAME" && ls ) > "$D/deb-members.txt"
( cd "$W" && for m in data.tar.*; do case "$m" in *.xz) tar -xJf $m ;; *.zst) zstd -dc $m | tar -x ;; *.gz) tar -xzf $m;; *) tar -xf $m;; esac; done; find . -name 'libvk_swiftshader*' -o -name 'vk_swiftshader_icd*' | sort ) > "$D/swiftshader-files.txt" || true
cat "$D/swiftshader-files.txt"
mkdir -p "$D/extract"; for f in $(cat "$D/swiftshader-files.txt"); do mkdir -p "$D/extract/$(dirname $f)"; cp "$W/$f" "$D/extract/$f"; done
rm -rf "$W"; echo "ok $CFG size=$SIZE sha256=$SHA256"
