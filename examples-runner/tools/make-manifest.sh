#!/bin/bash
# usage: examples-runner/tools/make-manifest.sh <examples dir> -> <examples dir>/manifest.sha256 (everything except work/ (installs), examples-runner/docker/ctx copies, node_modules, runs/_dev scratch)
set -e; D="$(cd "$1" && pwd)"; cd "$D"
find . -type f ! -path './work/*' ! -path './docker/ctx/*' ! -path '*/node_modules/*' ! -path './runs/_dev/*' ! -name manifest.sha256 ! -name '.DS_Store' -print0 | sort -z | xargs -0 shasum -a 256 > manifest.sha256
wc -l manifest.sha256
