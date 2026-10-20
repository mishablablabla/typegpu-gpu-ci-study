#!/usr/bin/env bash
# usage: wait-run.sh <run_id> [max_seconds]  -- polls the jobs API until no job is incomplete (run status display lags; jobs are the truth). Prints job table.
R="${GH_REPO:?set GH_REPO=owner/repo}"; id=$1; max=${2:-540}; t=0
inc() { gh api "repos/$R/actions/runs/$id/jobs?per_page=100" --jq '[.jobs[]|select(.status!="completed")]|length'; }
until [ "$(inc)" = 0 ] || [ $t -ge $max ]; do sleep 10; t=$((t+10)); done
gh api "repos/$R/actions/runs/$id/jobs?per_page=100" --jq '.jobs[] | [.name,.status,.conclusion,.started_at,.completed_at] | @tsv'
