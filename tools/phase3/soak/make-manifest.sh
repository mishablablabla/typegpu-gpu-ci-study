#!/usr/bin/env bash
cd "$(dirname "$0")/../../../runs/soak" && find . -type f ! -name manifest.sha256 ! -name .DS_Store | sort | xargs shasum -a 256 > manifest.sha256 && wc -l manifest.sha256
