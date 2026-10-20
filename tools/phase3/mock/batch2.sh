#!/bin/bash
# usage: batch2.sh < lines "ID attest suffix"
T="$(cd "$(dirname "$0")" && pwd)"; export T REPO="$(cd "$T/../../.." && pwd)"
xargs -P 3 -n 3 bash -c '"$T/run-in-container.sh" "$0-$2" "$REPO/mutation/patches/$0.patch" "$1" 1500 > /dev/null 2>&1; echo "done $0 $1 $2 $(date -u +%T)"'
