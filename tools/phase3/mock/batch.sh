#!/bin/bash
# usage: batch.sh <suffix> < ids   (non-attest unit gate per mutant, 3 parallel)
T="$(cd "$(dirname "$0")" && pwd)"; export T REPO="$(cd "$T/../../.." && pwd)" SFX="$1"
xargs -P 3 -I{} bash -c '"$T/run-in-container.sh" "{}-$SFX" "$REPO/mutation/patches/{}.patch" 0 900 > /dev/null 2>&1; echo "done {} $(date -u +%T)"'
