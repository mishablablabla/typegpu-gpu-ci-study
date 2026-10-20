#!/bin/bash
# usage: run-pow-probe.sh cfg...   -> raw/probes/pow-<cfg>.json (never overwrites). One slot per container.
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; HERE="$ROOT/runs/drift-lavapipe"; CFGS="$ROOT/docker/drift-lavapipe/configs.tsv"; TOOLS="$ROOT/tools/phase3/drift-lavapipe"; mkdir -p "$HERE/logs" "$HERE/raw/probes"
for cfg in "$@"; do o="$HERE/raw/probes/pow-$cfg.json"; [ -e "$o" ] && { echo "$o exists"; continue; }
  bash "${WITH_SLOT:-$ROOT/tools/with-slot.sh}" docker run --rm --cpus 2 --memory 2g -v "$TOOLS/probes:/probes:ro" "tgci-p3-driftlvp-$cfg" node /probes/pow-probe.cjs > "$o" 2> "$HERE/raw/probes/pow-$cfg.stderr"; echo "$cfg exit $? $(wc -c < $o) bytes"; done
