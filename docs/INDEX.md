# Index: claims to evidence

## Where each claim is documented

| Claim | Report | Summary data | Code that produced it |
|---|---|---|---|
| Verdict, scorecard, limits, review addendum | [FINAL_DECISION.md](FINAL_DECISION.md) | [join-mutation-vs-mock.md](../results/join-mutation-vs-mock.md) | all below |
| Pre-registered criteria C1-C7 and decision rule | [PLAN.md](PLAN.md) | | |
| Phase 1: frozen Lavapipe oracle baseline, 198 759 lanes, CTS 1159/1162 | [phase1/BASELINE.md](phase1/BASELINE.md) | | [harness.ts](../harness.ts), [evaluator/](../evaluator/), [lib/](../lib/), [selftest/](../selftest/), [third_party/](../third_party/) |
| Phase 2: SwiftShader acquisition, matrix, CTS, native x86_64 | [phase2/COMPARISON_REPORT.md](phase2/COMPARISON_REPORT.md), [phase2/FINAL_REPORT.md](phase2/FINAL_REPORT.md), [phase2/PLAN.md](phase2/PLAN.md) | | [tools/phase2/](../tools/phase2/), [docker/swiftshader/](../docker/swiftshader/), [ci/parity/](../ci/parity/) |
| C1 detection of 50 seeded bugs, arm64 | [workstreams/mutation.md](workstreams/mutation.md), [workstreams/catalogue.md](workstreams/catalogue.md) | [results/mutation/](../results/mutation/), [results/catalogue/CATALOGUE.md](../results/catalogue/CATALOGUE.md) | [mutation/](../mutation/) (`catalogue.json`, `patches/`, `own/`, `harness/`) |
| C1 replication on native x86_64 | [workstreams/x64-mutation.md](workstreams/x64-mutation.md) | [results/x64-mutation/](../results/x64-mutation/) | [ci/x64mut/](../ci/x64mut/), [.github/workflows/x64-mutation.yml](../.github/workflows/x64-mutation.yml) |
| Mocked unit tests catch 37 of 50 | [workstreams/mock.md](workstreams/mock.md) | [results/mock/](../results/mock/) | [docker/mock/](../docker/mock/), [tools/phase3/mock/](../tools/phase3/mock/) |
| C2/C7 CI soak, 299 jobs, timings, performance | [workstreams/soak.md](workstreams/soak.md) | [results/soak/](../results/soak/) | [ci/soak/](../ci/soak/), [.github/workflows/ci-soak.yml](../.github/workflows/ci-soak.yml), [tools/phase3/soak/](../tools/phase3/soak/) |
| C3/C5 all 97 examples | [workstreams/examples.md](workstreams/examples.md) | [results/examples/](../results/examples/) | [examples-runner/](../examples-runner/), [typegpu-examples/](../typegpu-examples/) |
| C4 divergence adjudication | [workstreams/adjudication.md](workstreams/adjudication.md) | [results/adjudication/](../results/adjudication/) | [tools/phase3/adjudication/](../tools/phase3/adjudication/) |
| C6 Mesa version drift | [workstreams/drift-lavapipe.md](workstreams/drift-lavapipe.md) | [results/drift-lavapipe/](../results/drift-lavapipe/) | [docker/drift-lavapipe/](../docker/drift-lavapipe/), [tools/phase3/drift-lavapipe/](../tools/phase3/drift-lavapipe/) |
| C6 SwiftShader version drift | [workstreams/drift-swiftshader.md](workstreams/drift-swiftshader.md) | [results/drift-swiftshader/](../results/drift-swiftshader/) | [docker/drift-swiftshader/](../docker/drift-swiftshader/), [tools/phase3/drift-swiftshader/](../tools/phase3/drift-swiftshader/) |
| Six investigation suites | [investigations/*/FINDINGS.md](../investigations/) | | [investigations/](../investigations/) |

## Path mapping for the history documents

Documents under `phase1/`, `phase2/` and `workstreams/` were written in the original working tree; paths in them refer to that tree. Raw run directories (several GB) are not part of this repository; the manifests in [results/manifests-summary.txt](../results/manifests-summary.txt) identify them.

| Original location | In this repository |
|---|---|
| `investigations/backend-diff/final/` (frozen baseline) | `docs/phase1/BASELINE.md`, `evaluator/`, `selftest/` |
| `investigations/backend-diff/swiftshader/tools/` | `tools/phase2/` |
| `investigations/backend-diff/swiftshader/typegpu-examples/` | `typegpu-examples/` |
| `investigations/backend-diff/phase3/<workstream>/` | `docs/workstreams/<workstream>.md`, `results/<workstream>/`, `tools/phase3/<workstream>/` |
| `phase3/catalogue/` | `mutation/` (`catalogue.json`, `patches/`) |
| `phase3/mutation/harness/` | `mutation/harness/` |
| `phase3/examples/runner/` | `examples-runner/` |
| `docker-*`, `docker-swiftshader/`, `ss-tools/` | `docker/` |
| staging repository `.github/workflows/` | `.github/workflows/` |

## Counting conventions

Lanes are individual GPU result elements of the CPU/GPU oracle groups (A-D, f16 group E, legacy group L). A mutant is DETECTED when a test changes pass to fail, or changes its value fingerprint where that test was deterministic across two baseline repeats, or crashes; a change visible only in generated WGSL is text-only. A flake is a pass/fail difference of one test between jobs of the same backend.
