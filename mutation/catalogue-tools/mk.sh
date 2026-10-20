#!/bin/bash
# usage: mk.sh ID -> writes patches/ID.patch from _scratch/m/ID vs _scratch/pristine
C=$(cd "$(dirname "$0")/.." && pwd); ID=$1; OUT="$C/patches/$ID.patch"; : > "$OUT"
cd "$C/_scratch/m/$ID" || exit 1
for f in $(find . -type f | sed 's#^\./##' | sort); do
  diff -u --label "a/$f" --label "b/$f" "$C/_scratch/pristine/$f" "$f" >> "$OUT"
done
echo "$ID: $(grep -c '^[+-][^+-]' "$OUT") changed lines, files: $(grep -c '^+++ ' "$OUT")"
