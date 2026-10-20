#!/bin/bash
# Rewrites manifest.sha256 (sha256 of every file except itself and .git).
cd "$(dirname "$0")/.." || exit 2
find . -type f ! -name manifest.sha256 ! -path './.git/*' | LC_ALL=C sort | xargs shasum -a 256 > manifest.sha256
wc -l manifest.sha256
