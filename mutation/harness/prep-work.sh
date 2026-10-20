#!/bin/bash
# usage: prep-work.sh <mutant-id|BASE> <work-dir (must not exist)> <node_modules target path as seen by the runner>
set -eu; ID="$1"; W="$2"; NM="$3"; H="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$H/../.." && pwd)"; MUT="$REPO/mutation"
sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
[ -e "$W" ] && { echo "$W exists" >&2; exit 2; }
mkdir -p "$W/repo" "$W/p3"
tar -xJf "$MUT/typegpu-tree.tar.xz" -C "$W/repo"
( cd "$W/repo" && sha -c "$MUT/typegpu-tree.sha256" > "$W/tree-verify.txt" 2>&1 ) || { echo "TREE VERIFY FAILED" >&2; tail -3 "$W/tree-verify.txt" >&2; exit 5; }
if [ "$ID" != BASE ]; then
  PATCH="$MUT/patches/$ID.patch"; [ -f "$PATCH" ] || { echo "no patch $PATCH" >&2; exit 3; }
  cp "$PATCH" "$W/mutant.patch"
  ( cd "$W/repo" && patch -p1 --batch --no-backup-if-mismatch < "$W/mutant.patch" > "$W/patch-apply.log" 2>&1 ) || { echo "PATCH FAILED" >&2; cat "$W/patch-apply.log" >&2; exit 4; }
  find "$W/repo" \( -name '*.orig' -o -name '*.rej' \) -delete
fi
( cd "$W/repo" && find . -type f | LC_ALL=C sort | xargs shasum -a 256 > "$W/repo.sha256" )
"$H/build-pool.sh" "$W/pool"
mkdir -p "$W/pool/typegpu-examples/vendor"; ln -s ../../../repo/apps "$W/pool/typegpu-examples/vendor/apps"; ln -s ../../../repo/packages "$W/pool/typegpu-examples/vendor/packages"
cp "$H/fp-setup.ts" "$H/p3.config.mts" "$H/run-pool.mjs" "$H/in-env.sh" "$H/assert-adapters.mjs" "$W/p3/"
ln -s "$NM" "$W/node_modules"
echo "work ready: $W (mutant $ID)"
