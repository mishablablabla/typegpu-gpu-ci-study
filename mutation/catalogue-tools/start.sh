#!/bin/bash
# usage: start.sh ID relpath...   -> copies pristine files into _scratch/m/ID for editing
C=$(cd "$(dirname "$0")/.." && pwd); ID=$1; shift
for f in "$@"; do mkdir -p "$C/_scratch/m/$ID/$(dirname "$f")"; cp "$C/_scratch/pristine/$f" "$C/_scratch/m/$ID/$f"; done
