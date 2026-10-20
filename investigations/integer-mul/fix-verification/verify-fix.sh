#!/usr/bin/env bash
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); INV=$(dirname "$HERE")
REPO=${1:-"$HOME/Desktop/type gpu/fork/TypeGPU"}; TAG=${TAG:-v0.12.7}
COPY="$HERE/repo-copy"; OUT="$HERE/results"
rm -rf "$COPY" "$OUT"; mkdir -p "$COPY" "$OUT"
PKGS="typegpu typegpu-testing-utility tinyest unplugin-typegpu tinyest-for-wgsl tgpu-dev-cli"
git -C "$REPO" archive "$TAG" $(for p in $PKGS; do echo packages/$p; done) tsconfig.base.json package.json pnpm-workspace.yaml | tar -x -C "$COPY" || exit 2
for p in $PKGS; do [ -d "$REPO/packages/$p/node_modules" ] && cp -R "$REPO/packages/$p/node_modules" "$COPY/packages/$p/node_modules"; done
ln -s "$REPO/node_modules" "$COPY/node_modules"
cd "$COPY/packages/typegpu" || exit 2
VT="node ../../node_modules/vitest/vitest.mjs"
export GPU_MATRIX="$INV/raw/gpu-matrix.json"
echo "[1/3] repo test-suite, UNPATCHED ($TAG)";            $VT run --reporter=json --outputFile="$OUT/1-unpatched-suite.json" >/dev/null 2>&1
cp "$INV/proposed-regression-test.ts" tests/std/numeric/mulInt32.test.ts; cp "$HERE/gpu-parity.test.ts" tests/_gpuParity.test.ts
echo "[2/3] new regression + GPU-parity tests, UNPATCHED"; $VT run tests/std/numeric/mulInt32.test.ts tests/_gpuParity.test.ts --reporter=json --outputFile="$OUT/2-new-tests-unpatched.json" >/dev/null 2>&1
( cd "$COPY" && patch -p1 < "$INV/proposed-fix.patch" >/dev/null ) || { echo "patch does not apply"; exit 3; }
echo "[3/3] repo test-suite + new tests, PATCHED";          $VT run --reporter=json --outputFile="$OUT/3-patched-suite.json" >/dev/null 2>&1
node - "$OUT" <<'JS'
const fs = require('fs'), out = process.argv[2];
const rd = (n) => JSON.parse(fs.readFileSync(`${out}/${n}`, 'utf8'));
const key = (r) => new Map(r.testResults.flatMap((f) => f.assertionResults.map((a) => [f.name.split('packages/typegpu/')[1] + ' > ' + a.fullName, a.status])));
const a = rd('1-unpatched-suite.json'), b = rd('2-new-tests-unpatched.json'), c = rd('3-patched-suite.json');
const A = key(a), C = key(c);
const regressions = [...A].filter(([k, v]) => v === 'passed' && C.get(k) !== 'passed').map(([k]) => k);
const newTests = [...C.keys()].filter((k) => !A.has(k));
const summary = {
  tag: process.env.TAG || 'v0.12.7',
  unpatchedSuite: { files: a.testResults.length, tests: a.numTotalTests, passed: a.numPassedTests, failed: a.numFailedTests },
  newTestsUnpatched: { tests: b.numTotalTests, passed: b.numPassedTests, failed: b.numFailedTests },
  patchedSuite: { files: c.testResults.length, tests: c.numTotalTests, passed: c.numPassedTests, failed: c.numFailedTests },
  newTestsInPatchedRun: newTests.length, testsThatPassedBeforeButNotAfter: regressions,
};
fs.writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
const ok = c.numFailedTests === 0 && regressions.length === 0 && b.numFailedTests > 0;
console.log(ok ? '\nFIX VERIFIED: no regressions, new tests fail without the patch and pass with it' : '\nVERIFICATION FAILED');
process.exit(ok ? 0 : 1);
JS
