# Phase 3 — residual testing to choose the CI software-GPU backend (Lavapipe vs SwiftShader)

Phase 1 (Lavapipe baseline) and Phase 2 (SwiftShader, COMPARISON_REPORT.md) are CLOSED inputs; Phase 3 adds evidence, never edits them.

## Decision question
Which backend should be the PRIMARY software-GPU backend for TypeGPU CI, which (if any) the secondary, and why — for the purpose "catch TypeGPU regressions that the mocked unit tests cannot".
Out of scope: replacing real GPUs/Metal (both emulators fail that by construction).

## Criteria and decision rule (FIXED before data; do not change after seeing results)
| id | criterion | measured by | how it counts |
|---|---|---|---|
| C1 | **Detection power** | WS-MUT: seeded TypeGPU bugs (from real fix history + synthetic), same-backend differential vs unmutated run, test pool = all GPU suites | #caught per backend, exclusive catches, and caught-only-on-GPU (missed by mocked unit tests, WS-MOCK) |
| C2 | **Flake / false-positive rate** | WS-SOAK: ≥30 independent CI jobs per backend (different runners) of the same suite | any outcome that differs between jobs of the same backend = flake. Hard gate for PRIMARY: 0 flakes (or every flake attributed + removable) |
| C3 | **Example coverage** | WS-EX: all 97 docs examples run headless on Metal/Lavapipe/SwiftShader | #examples that run to completion with a checkable output; #false reds vs Metal |
| C4 | **Truth proximity** | WS-ADJ: every Lavapipe≠SwiftShader divergence scored vs CTS interval / Metal / spec | share of divergences where each backend is the outlier |
| C5 | **f16 cost** | WS-F16: TypeGPU tests/examples that need `shader-f16` | share of the suite that SwiftShader cannot run |
| C6 | **Update drift** | WS-DRIFT-LVP / WS-DRIFT-SS: same groups/suites on adjacent versions | #outcome changes per version step (stability of the pin) |
| C7 | **Cost** | WS-SOAK timings + setup notes | median job wall time, install complexity, pin mechanism |

Rule: PRIMARY must pass the hard gates (C2 = 0 unattributed flakes; C3 ≥ 80 % of examples checkable or the gap fully explained; C5 not a blocker for the suite we actually want). Among those passing, prefer the one with higher C1 (a difference counts only if ≥2 mutations and not explained by f16 / feature gaps), then C6, then C7. If C1 is equal → decide on C2/C6/C7. SECONDARY = the other backend if it adds ≥1 exclusive catch or exclusive truth-check, else "not needed". Every verdict is labelled with its confidence and the exact data it rests on. Green ≠ correct, red ≠ defect.

## Workstreams
| ws | owner | scope | docker? |
|---|---|---|---|
| WS-MUT-CAT | catalogue | bug catalogue from TypeGPU git history (read-only) + patch files vs pristine snapshot | no |
| WS-MUT-RUN | mutation | harness + runs: apply patch to a COPY of the snapshot, run GPU suites on Metal(host)/Lavapipe/SwiftShader, differential vs unmutated | yes |
| WS-MOCK | mock | TypeGPU's own mocked unit tests on every mutant (does the existing suite already catch it?) | yes (pnpm in container) |
| WS-EX | examples | all 97 docs examples, 3 backends, classification | yes + host |
| WS-ADJ | adjudication | divergence scoring from existing data (+WS-EX data later) | no |
| WS-F16 | f16 | static+runtime census (after WS-EX) | little |
| WS-DRIFT-LVP | drift-lavapipe | other Mesa/Lavapipe versions | yes |
| WS-DRIFT-SS | drift-swiftshader | other Chromium/SwiftShader versions | yes |
| WS-SOAK | soak | real CI job in staging repo, ≥30 jobs per backend, timings, x64 perf | CI |

## Shared infrastructure and rules (all workstreams)
- Root: `<poc>/investigations/backend-diff/phase3/`. Each workstream writes ONLY into `phase3/<ws>/` (+ its own docker image tags `webgpu-poc-p3-<ws>-*`, containers `p3-<ws>-*`) and `phase3/status/<ws>.md` (short running log: what done / blocked / next; update at each milestone).
- Pristine TypeGPU snapshot: `_shared/typegpu-HEAD/` (git archive of e893ad11; never edit; `cp -R` to your own dir to modify). TypeGPU checkout `<typegpu-checkout>` is READ-ONLY (git only with `--no-optional-locks`; no build/install/write there; nothing pushed to any TypeGPU remote).
- Docker VM = 8 CPU / 8 GB shared by everyone. Every `docker run` goes through `tools/with-slot.sh <cmd>` (1 slot = `--cpus 2 --memory 2g`); anything timing-related uses `tools/with-slot.sh -x`. `docker build` is allowed unslotted but one at a time per workstream. Never `docker system prune`, never delete images/containers you did not create.
- Frozen, never modify: `investigations/backend-diff/final/**`, `evaluator-versions.sha256`, `harness.ts`, Phase-2 tree `investigations/backend-diff/swiftshader/**` (read it, reuse its tools/images by *copying* scripts into your ws dir). Never run on the host: `npm run conformance`, `scripts/run.mjs`, plain `npm test`, `build-baseline.mjs`, the browser benchmark. Phase-2 Docker images may be reused read-only (`docker run`), not retagged.
- Backend identity must be asserted per run (reuse `ss-tools/assert-backend.mjs` / the lavapipe identity check in `ss-tools/ex-in-container.sh`). dawn.node GC rule: keep the `create()` result referenced (`globalThis.__gpu`).
- Raw evidence is never overwritten: new dir per attempt, failed attempts kept with a NOTE. No secrets/tokens in artifacts. Each ws ends with `phase3/<ws>/REPORT.md` (verified facts / hypotheses / unresolved + what evidence would settle them) and `phase3/<ws>/manifest.sha256`.
- GitHub: only the private staging repo `the private staging repository` (local `<poc>/_x64-ci-repo`), manual workflows only, only WS-SOAK pushes there. Do not delete it.
