#!/usr/bin/env bash
set -u; HERE="$(cd "$(dirname "$0")" && pwd)"; . "$HERE/lib.sh"; V="$OUT/v2"; mkdir -p "$V"; REV=e893ad11f215f08ef164fb20daae851702007185; TG="$PWD/tg-src"; R="$PWD/examples-runner"
fetch_tg() ( mkdir -p "$TG" && cd "$TG" && git init -q && git fetch -q --depth 1 https://github.com/software-mansion/TypeGPU.git "$REV" && git checkout -q FETCH_HEAD && git log --oneline -1 )
stage v2-fetch-typegpu fetch_tg > "$V/fetch.log" 2>&1 || { echo "fetch failed"; cat "$V/fetch.log"; exit 1; }
stage v2-pnpm-setup npm install -g pnpm@11.1.2 --no-audit --no-fund > "$V/pnpm-setup.log" 2>&1 || { tail -5 "$V/pnpm-setup.log"; exit 1; }
stage v2-pnpm-install bash -c "cd '$TG' && pnpm install --frozen-lockfile --ignore-scripts" > "$V/pnpm-install.log" 2>&1 || { tail -15 "$V/pnpm-install.log"; exit 1; }
stage v2-runner-deps bash -c "cd '$R' && npm install --no-audit --no-fund" > "$V/runner-deps.log" 2>&1 || { tail -5 "$V/runner-deps.log"; exit 1; }
run_ex() { TYPEGPU_ROOT="$TG" EX_TIMEOUT_MS="${EX_TIMEOUT_MS:-240000}" EX_REPEATS="${EX_REPEATS:-1}" "$R/run-all.sh" "$SOAK_BACKEND" "$V/run" > "$V/run-all.stdout" 2> "$V/run-all.stderr"; echo $? > "$V/run-all.exit"; }
stage v2-run run_ex
node "$HERE/v2-summarize.mjs" "$V" "$R" || echo "v2-summarize failed"
exit 0
