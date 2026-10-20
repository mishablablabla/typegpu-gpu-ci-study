#!/bin/bash
# usage: tools/phase3/drift-lavapipe/make-manifest.sh  -> manifest.sha256 (every file under drift-lavapipe/ except itself and .DS_Store); verify FROM THIS DIRECTORY: shasum -a 256 -c manifest.sha256
cd "$(dirname "$0")/../../../runs/drift-lavapipe" && find . -type f ! -name manifest.sha256 ! -name .DS_Store | sort | xargs shasum -a 256 > manifest.sha256 && wc -l manifest.sha256
