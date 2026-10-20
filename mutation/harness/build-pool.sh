#!/bin/bash
# usage: build-pool.sh <dest (must not exist)>   assembles the pre-existing test pool (13 example tests, 6 investigation suites, ported, diff and selftest suite) + the 14 own tests
set -eu; H="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$H/../.." && pwd)"; D="${1:?dest}"
[ -e "$D" ] && { echo "$D exists" >&2; exit 2; }
mkdir -p "$D/typegpu-examples" "$D/investigations" "$D/reports/cases" "$D/own"
cp "$REPO"/typegpu-examples/*.test.ts "$REPO/typegpu-examples/setup.ts" "$REPO/typegpu-examples/helpers.ts" "$D/typegpu-examples/"
for d in bitops vector-fns mul-paths scalar-int integer-mul comptime; do cp -R "$REPO/investigations/$d" "$D/investigations/$d"; done
cp "$REPO/harness.ts" "$REPO/step2.test.ts" "$REPO/step3.test.ts" "$D/"
for d in lib diff ported selftest; do cp -R "$REPO/$d" "$D/$d"; done
cp "$REPO"/mutation/own/*.test.ts "$D/own/"
