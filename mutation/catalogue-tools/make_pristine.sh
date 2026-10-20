#!/bin/bash
C=$(cd "$(dirname "$0")/.." && pwd); SNAP=$(mktemp -d)
tar -xJf "$C/typegpu-tree.tar.xz" -C "$SNAP"
rm -rf "$C/_scratch/pristine"; mkdir -p "$C/_scratch/pristine"
(cd "$SNAP" && find packages -path '*/src/*' -type f ! -path '*/node_modules/*' -print0 | tar -cf - --null -T -) | tar -xf - -C "$C/_scratch/pristine"
rm -rf "$SNAP"
