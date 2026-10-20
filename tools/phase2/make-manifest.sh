#!/usr/bin/env bash
set -eu; cd "$(dirname "$0")/../../runs/phase2"; [ -e manifest.sha256 ] && { echo "manifest.sha256 exists"; exit 2; }
T=$(mktemp); find . -type f ! -name .DS_Store ! -path ./manifest.sha256 | sed 's#^\./##' | LC_ALL=C sort | while read -r f; do shasum -a 256 "$f"; done > "$T"; cp "$T" manifest.sha256; rm "$T"; wc -l < manifest.sha256
