#!/bin/bash
D="$(cd "$(dirname "$0")/.." && pwd)/.slots"; N=3; mkdir -p "$D"
alive() { [ -n "$1" ] && kill -0 "$1" 2>/dev/null; }
reclaim() { for d in "$D"/slot-* "$D"/gate; do [ -d "$d" ] || continue; p=$(cat "$d/pid" 2>/dev/null); alive "$p" || rm -rf "$d"; done; }
take() { mkdir "$1" 2>/dev/null && echo $$ > "$1/pid"; }
held=""
cleanup() { for h in $held; do rm -rf "$h"; done; }
trap cleanup EXIT INT TERM
if [ "$1" = "-x" ]; then
  shift
  until take "$D/gate"; do reclaim; sleep 3; done; held="$D/gate"
  for i in $(seq 1 $N); do until take "$D/slot-$i"; do reclaim; sleep 3; done; held="$held $D/slot-$i"; done
  echo "[with-slot] EXCLUSIVE acquired $(date -u +%T)" >&2
else
  while :; do
    reclaim
    if [ ! -d "$D/gate" ]; then for i in $(seq 1 $N); do if take "$D/slot-$i"; then held="$D/slot-$i"; break 2; fi; done; fi
    sleep 3
  done
  echo "[with-slot] slot acquired $(date -u +%T)" >&2
fi
"$@"; rc=$?; exit $rc
