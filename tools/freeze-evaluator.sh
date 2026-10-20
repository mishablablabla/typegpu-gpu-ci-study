#!/bin/bash
# Writes evaluator/evaluator-versions.sha256 (sha256 of the evaluator, its inputs and the pinned toolchain files). Check with: shasum -a 256 -c <(grep -v '^#' evaluator/evaluator-versions.sha256)
cd "$(dirname "$0")/.." || exit 2
{
  echo "# CTS commit e325d0bcc2cb785c4eab1d908339019215bd9462, node v24.21.0"
  echo "# comment-stripped tree: these hashes differ from the hashes of the original run files recorded in docs/phase1/BASELINE.md; behaviour is identical (self-test 49/49, parity with the recorded eval.json files)"
  shasum -a 256 evaluator/{evaluate-ext.mjs,selftest-evaluator.mjs,dump-bits-ext.test.ts,dump-bits-ext-f16.test.ts,vitest.config.mts,cpu-vs-gpu-ext.mjs,compare-bits-ext.mjs,compare-backends-ext.mjs,analyze-groupB.mjs,analyze-groupC.mjs,analyze-groupD.mjs,engine-allrows.ts} \
    lib/{ops,policy,engine,types,num}.ts harness.ts \
    docker/oracle-ext/{Dockerfile,Dockerfile.dockerignore,run.sh} docker/cts/{Dockerfile,run.sh} \
    third_party/{run-cts.sh,cts-oracle.cjs,dawn-node-provider.js,adapter-probe.js,package.json} third_party/poc-specs/* package.json package-lock.json
} > evaluator/evaluator-versions.sha256
wc -l evaluator/evaluator-versions.sha256
