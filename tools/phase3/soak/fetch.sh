#!/usr/bin/env bash
# usage: fetch.sh <run_id> <suite: v1|dump|perf|v2|...>  (suite is written to SUITE.txt; analyze.mjs only reads runs of its suite)  -- downloads ALL artifacts of the run + the jobs/steps API json into runs/soak/raw/run-<id>/ (refuses to overwrite). Artifacts are the outcome source of truth.
set -u; R="${GH_REPO:?set GH_REPO=owner/repo}"; id=$1; D="$(cd "$(dirname "$0")/../../.." && pwd)/runs/soak/raw/run-$id"; [ -e "$D" ] && { echo "$D exists; refusing to overwrite"; exit 2; }
mkdir -p "$D"; echo "${2:?suite label required}" > "$D/SUITE.txt"; gh api repos/$R/actions/runs/$id > "$D/run.json"; gh api repos/$R/actions/runs/$id/jobs --paginate > "$D/jobs.json"
gh run download $id -R $R -D "$D/artifacts" 2>"$D/download.stderr"; echo "download exit $?" > "$D/download.status"; ls "$D/artifacts" | wc -l
