# Software-GPU backend for TypeGPU CI: Lavapipe vs SwiftShader

This repository holds the code, tests, Docker files, CI workflows and summary data of a study that picks a software WebGPU backend for running TypeGPU's GPU tests in CI.
Both candidates run through the same path (`webgpu` npm package = dawn.node, Vulkan, Ubuntu 24.04): Mesa Lavapipe (apt) and Chromium's SwiftShader (pinned Debian package).
Evidence: the Phase-1 conformance harness and frozen CTS-interval evaluator, six investigation suites, 13 real docs-example tests, all 97 docs examples, 50 seeded TypeGPU bugs (mutation catalogue),
a soak of 299 native x86_64 CI jobs, Mesa/Chromium version drift, and an adjudication of every backend divergence.
Raw run directories (GBs) are not included; they stay in the original workspace and are identified by the manifests in `results/`.

## Verdict

**Primary backend: Lavapipe** (Mesa `mesa-vulkan-drivers` from apt, version-pinned). **Secondary: not needed for detection**; SwiftShader is an optional cross-check only.
Confidence medium-high for "Lavapipe, not SwiftShader, as the single backend", medium for "secondary not needed". Scope: regression detection on x86_64 GitHub runners, not parity with real GPUs (Metal, NVIDIA, ...).
The backends tie on detection (34 of 36 mutants once f16 is excluded, 0 flakes each, same 87/97 examples); Lavapipe wins the tie-breakers (`shader-f16`, 3.7-6.2x faster steady-state compute, no example timeouts, one apt package).
Full decision, scorecard and caveats: [docs/FINAL_DECISION.md](docs/FINAL_DECISION.md); pre-registered criteria: [docs/PLAN.md](docs/PLAN.md); claim-to-folder map: docs/INDEX.md.

## Layout

| Path | Content |
|---|---|
| `package.json`, `harness.ts`, `step1.mjs`, `step2.test.ts`, `step3.test.ts`, `vitest.config.mts` | Phase-1 harness entry points (node project root) |
| `lib/`, `diff/`, `ported/`, `selftest/`, `scripts/` | CPU/GPU/oracle engine and policies, generated diff suites, GPU ports of TypeGPU `std` tests, self-tests, runner |
| `third_party/` | adapter probe, dawn.node provider, `cts-oracle.cjs`, `run-cts.sh`, `fetch-cts.sh` (CTS pinned to `e325d0bcc2cb`, not stored) |
| `evaluator/` | frozen CTS-interval evaluator (`evaluate-ext.mjs`, `selftest-evaluator.mjs`), bit-exact dump tests, compare/analyze scripts, `evaluator-versions.sha256` |
| `investigations/` | six suites: bitops, comptime, integer-mul, mul-paths, scalar-int, vector-fns (each with FINDINGS.md) |
| `typegpu-examples/` | 13 docs-example tests + shim + vendored TypeGPU example sources (MIT, `vendor/LICENSE`) |
| `examples-runner/` | headless runner for all 97 docs examples (`run-all.sh`, `src/`, `tools/`, `docker/`, `probes/`) |
| `mutation/` | `catalogue.json`, `CATALOGUE.md`, `patches/` (50), `own/` (own tests), `harness/` (docker harness, `canary.sh`), `plans/`, pinned TypeGPU subset `typegpu-tree.tar.xz` |
| `docker/` | Dockerfiles and run scripts: `e1 e2 e3 allrows cts oracle-ext swiftshader in-container mock drift-lavapipe drift-swiftshader` |
| `ci/`, `.github/workflows/` | soak / x64-mutation / parity scripts and the five manual workflows |
| `tools/` | Phase-2 and Phase-3 analysis tools (`phase2/`, `phase3/<workstream>/`), `with-slot.sh`, `check-paths.mjs`, `scan-clean.sh`, `freeze-evaluator.sh` |
| `docs/`, `results/` | reports and summary data per workstream (`results/<workstream>/{RESULTS.md,results.json}`) |
| `runs/` | git-ignored output of every script (nothing is written elsewhere) |

Report (PDF): [docs/REPORT.pdf](docs/REPORT.pdf).

History reports: [Phase 1 baseline](docs/phase1/BASELINE.md), [Phase 2 comparison](docs/phase2/COMPARISON_REPORT.md), [Phase 2 final report](docs/phase2/FINAL_REPORT.md).

## Prerequisites

- Docker (verified on Docker Desktop 29.8.2, linux/arm64; the CI workflows run the same files on native linux/amd64). Commands below build images from the repo root; image tags `...:arm64` are labels, use `amd64` and `SS_ARCH=amd64` on x86_64.
- Pinned inputs: Ubuntu 24.04 base, Node 24.21.0 (downloaded in the images), `package-lock.json` (typegpu 0.12.7, unplugin-typegpu 0.12.5, webgpu/dawn.node 0.6.2, vitest 4.1.11),
  Lavapipe from apt (Mesa 25.2.8 on noble-updates at the time), SwiftShader from Debian `chromium-common 155.0.8059.79-1~deb13u1` (sha256 checked by `docker/swiftshader/fetch-icd.sh`),
  WebGPU CTS `e325d0bcc2cb785c4eab1d908339019215bd9462`, TypeGPU `e893ad11f215f08ef164fb20daae851702007185`, pnpm 11.1.2 (examples runner).
- Docker admission slots (`tools/with-slot.sh`, 3 slots of 2 CPU / 2 GB) are optional; set `WITH_SLOT=<path>` to use another admission script.

## Commands

Images (once):

    docker build -f docker/oracle-ext/Dockerfile -t tgci-oracle-ext .
    docker build --build-arg BASE=tgci-oracle-ext -f docker/swiftshader/Dockerfile.ex -t tgci-ex-lavapipe:arm64 .
    docker/swiftshader/fetch-icd.sh arm64
    docker build --build-arg SS_ARCH=arm64 -f docker/swiftshader/Dockerfile.oracle-ext -t tgci-swiftshader-oracle-ext:arm64 .
    docker build --build-arg BASE=tgci-swiftshader-oracle-ext:arm64 -f docker/swiftshader/Dockerfile.ex -t tgci-ex-swiftshader:arm64 .
    docker build -f docker/cts/Dockerfile -t tgci-cts .

(a) Evaluator self-test and parity (self-test must print `49/49`, parity `PARITY RESULT: PASS`; re-evaluates 4 stored dumps and compares with the stored `eval.json`):

    sh ci/parity/run-parity.sh tgci-cts runs/parity

(b) Example tests on Lavapipe (one file, then all 13 with backend identity check):

    docker run --rm --cpus 2 --memory 2g tgci-ex-lavapipe:arm64 sh -c 'cd typegpu-examples && npx vitest run -c vitest.config.mts a-simple.test.ts'
    BACKEND=lavapipe OUT=runs/phase2/ex-lavapipe docker/swiftshader/run-ex.sh tgci-ex-lavapipe:arm64     # 13/13 pass, mnist without f16 3/3

(c) Mutation canaries M24 (`std.mix` arguments swapped) and M26 (`countLeadingZeros` emits `countTrailingZeros`) on both backends; each prints `DETECTED-value`:

    mutation/harness/canary.sh lavapipe
    mutation/harness/canary.sh swiftshader

Reference outcome of this exact setup (arm64 Docker): M24 detected on both backends, M26 detected by 19 tests on both. A single mutant run: `mutation/harness/run-mutant.sh <Mxx|BASE> <lavapipe|swiftshader> runs/mutation/runs/<name>` then `node mutation/harness/collect.mjs <that dir>`.

(d) All-97-examples runner on one example (Docker; needs a TypeGPU checkout at the pinned commit):

    mkdir -p runs/typegpu-src && git -C runs/typegpu-src init -q && git -C runs/typegpu-src fetch -q --depth 1 https://github.com/software-mansion/TypeGPU.git e893ad11f215f08ef164fb20daae851702007185 && git -C runs/typegpu-src checkout -q FETCH_HEAD
    TYPEGPU_ROOT=$PWD/runs/typegpu-src examples-runner/docker/prepare-ctx.sh
    docker build --build-arg BASE=tgci-ex-lavapipe:arm64 -f examples-runner/docker/Dockerfile -t tgci-p3-examples-lavapipe:arm64 examples-runner/docker/ctx
    EX_FILTER=simple/increment EX_REPEATS=1 examples-runner/docker/run-docker.sh lavapipe runs/examples/one

Without `EX_FILTER` all 97 examples run (about 26 min on Lavapipe, 46 min on SwiftShader in a 2-CPU arm64 container; give SwiftShader `EX_TIMEOUT_MS>=450000`). Options and output format: `examples-runner/README.md`.

Checks: `node tools/check-paths.mjs` (paths in scripts, workflows and docs resolve), `tools/scan-clean.sh` (prints nothing when no secrets, absolute paths, e-mails or attribution strings are present), `tools/freeze-evaluator.sh` (rewrites `evaluator/evaluator-versions.sha256`).

## CI workflows

All are manual (`workflow_dispatch`), run on `ubuntu-24.04` (native x86_64) and write one artifact per run. They were run from a private staging repository; the files here are the same ones. Dispatch with the GitHub CLI after pushing this repository:

| Workflow | Dispatch | What it does |
|---|---|---|
| `ci-soak.yml` | `gh workflow run ci-soak.yml -f suite=v1 -f reps=2` | what a team would run: apt Lavapipe vs pinned SwiftShader, suites v1/v2/dump/perf, matrix job per backend and repetition |
| `x64-mutation.yml` | `gh workflow run x64-mutation.yml -f plan=calib` | mutation campaign on native x86_64 from `mutation/plans/<plan>.json` (`calib`, `full1`, `full2`, `rerun5`) |
| `lavapipe-x64-check.yml` | `gh workflow run lavapipe-x64-check.yml -f full=true -f cts=true -f allrows=true` | Phase-1 stages on Lavapipe (smoke, step2/3, full suite, CTS, all-rows dump, oracle-extension dump) |
| `swiftshader-x64-check.yml` | `gh workflow run swiftshader-x64-check.yml -f repeats=2` | SwiftShader oracle dumps A-E/L, evaluator parity (`ci/parity/`), extended CTS, optional timing pairs |
| `backend-compare-x64.yml` | `gh workflow run backend-compare-x64.yml` | full suite, six investigation suites and 13 example tests on both backends, pinned vs unpinned Lavapipe |

## What was verified for this repository

Run from this tree in Docker (arm64): evaluator self-test 49/49 and parity PASS; 13/13 example tests on Lavapipe and on SwiftShader (identity assertions pass); Phase-1 stages 1-2 (`step1.mjs`, 12 tests);
full conformance pool on Lavapipe 394 pass / 15 fail / 17 skip (the recorded numbers); canaries M24 and M26 detected on both backends; examples runner on one example through the Docker route; every Dockerfile in `docker/` used by the workflows builds;
shell scripts pass `bash -n`, `.mjs`/`.cjs` pass `node --check`, workflows parse as YAML. Not re-run from this tree: the GitHub workflows themselves, the Mesa/Chromium drift matrices, the mock (TypeGPU unit tests) harness,
the analysis tools that read raw run directories, the full CTS and the 97-example batch; these need data or time that is not part of the repository.

## Notes

- Comments were stripped from all code (only shebangs, directives, a few hazards such as the dawn.node GC rule and `usage:` lines remain). The recorded hashes of the original evaluator files in the Phase-1 reports therefore differ from `evaluator/evaluator-versions.sha256`;
  parity with the recorded `eval.json` files (command (a)) is the evidence that behaviour is unchanged.
- `typegpu-examples/vendor/`, `mutation/typegpu-tree.tar.xz` and `mutation/patches/` are TypeGPU material (MIT): see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- Container-internal paths keep the name `/work/webgpu-poc` (the working directory inside the images).
