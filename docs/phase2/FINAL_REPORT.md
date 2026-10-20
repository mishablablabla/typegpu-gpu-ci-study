> Paths in this document refer to the original working tree. See [docs/INDEX.md](../INDEX.md) for the mapping to this repository.

# Phase 2 — SwiftShader vs the frozen Lavapipe baseline: final report

Date: 2026-10-19. Frozen Phase 1 tree untouched (check: `report/frozen-tree-check.txt`). Everything below is derived from files under `investigations/backend-diff/swiftshader/` unless a path says otherwise. Facts, interpretations and open questions are labelled.

> **Second round (2026-10-19, later):** full-suite, investigation-suite and real TypeGPU-example comparison of Lavapipe and SwiftShader on arm64 and native x86_64, pinned-Lavapipe test and a correction of the crash analysis: see `COMPARISON_REPORT.md` (this file keeps the first-round content; the crash statements below are corrected in place).

## A. Executive summary

- **Acquired and executed: yes.** SwiftShader runs through the *unchanged* PoC path (`webgpu@0.6.2` / dawn.node → system Vulkan loader → ICD). `dawn.node` bundles no SwiftShader, so an ICD had to be supplied.
- **Route used:** `libvk_swiftshader.so` + `vk_swiftshader_icd.json` extracted (extract only, no install) from Debian `chromium-common_155.0.8059.79-1~deb13u1` (immutable snapshot.debian.org URL; .deb sha256 recorded, see §B). Provenance label: **"SwiftShader as vendored by Chromium M155"** — not an upstream SwiftShader release (upstream has no releases/tags/binaries), and not the SwiftShader commit Dawn pins for this `webgpu` version (`1e80438d…`, not tested).
- **Backend identity is proven, not assumed:** every run asserts (and fails loudly otherwise) one Vulkan device with vendorID 0x1ae0 / deviceID 0xc0de / CPU / driver SwiftShader, no other ICD manifest and no Mesa package in the image, loader trace shows only the SwiftShader ICD, `requestAdapter({forceFallbackAdapter:true})` returns the same adapter, a known-answer compute (`step1.mjs`) passes.
- **Two different SwiftShader JIT backends depending on architecture (fact):** arm64 build reports `SwiftShader Device (LLVM 16.0.0)`, x86_64 build reports `SwiftShader Device (Subzero)`. This confounds any arm64↔x64 comparison.
- **CTS categories are identical to Lavapipe in every group** (A, B, C, D, L: 195 210 lanes per configuration, see §C): `rejected = 0` on every lane, same accepted/indeterminate/unverified totals. Extended CTS: **686 passed, 476 skipped (all `shader-f16` absent), 0 failed, 0 warned, 0 unexecuted** on 1 162 cases, arm64 ×2 and native x86_64 ×4 (3 CPU models).
- **Most important differences from Lavapipe:**
  1. **No `shader-f16`** (group E not runnable; 476 of 1 162 CTS cases skipped). Cause traced to SwiftShader (`shaderFloat16`, `shaderInt16`, 16-bit storage all `VK_FALSE` upstream) + Dawn's requirements.
  2. **Subzero (x86_64) flushes subnormals to zero** (same lane pattern as Metal); LLVM-16 (arm64) keeps them like Lavapipe. All in the same CTS category (CTS allows flush).
  3. **Value differences in transcendentals/legacy ops** (sin/cos/exp/exp2/tanh/log/log2/pow) and **different special-value results** outside CTS-defined domains (e.g. `log(0)` = −88.03, `log(NaN)` = 89.13, `pow(0, 0.5)` = 7.7e-20, `exp(NaN)` = +inf; Lavapipe gives −inf / NaN / 0 / NaN). Unconstrained by the CTS ⇒ `indeterminate`, not "defects".
  4. **`mod` is exact on SwiftShader** (all 2 667 accepted f32 scalar lanes equal `fround(want)`); Lavapipe's `mod` is approximate (Phase 1 policy failures: 280 rows → 0 on SwiftShader).
  5. **Determinism is better than Lavapipe's:** GPU outputs are byte-identical across all runs on the same architecture (arm64 ×3; x86_64 ×8 dumps on 3 CPU models) — no NaN-sign variation on the GPU side.
- **Performance (relative, same host, interleaved):** harness-level (TypeGPU dump test) time ≈ Lavapipe (ratio 0.97–1.07 on arm64); CTS per-case time ≈ 1.07× Lavapipe (arm64, indicative). Raw-WebGPU steady dispatch: ≈1× on arm64 but ≈4× slower on native x86_64 (two hosts); cold start (compile + first submit) is similar/faster. See §E for limits.
- **Crash observation — CORRECTED in second round:** my raw timing script crashed (SIGSEGV/SIGABRT/SIGBUS, glibc mutex asserts) on both backends in longer runs. Root cause found and confirmed: the `create()` result was garbage-collected (documented dawn.node hazard, `harness.ts` comment); keeping a reference removes all crashes (24/24 → 0/24, `perf/crash-investigation/GC-HYPOTHESIS-RESULT.md`). It is a script bug, **not** a SwiftShader or Lavapipe defect; the earlier wording "cause unknown / SwiftShader crashes earlier" is superseded. The frozen harness (TypeGPU, 15+24 dumps), the CTS and all second-round suites never crashed.
- **Is the comparison reliable?** For f32 operations A–D, L and the CTS: yes (inputs proven identical by hash, evaluator frozen and parity-checked on Linux arm64 and native x86_64, repeats byte-identical). For f16: not available. For performance: indicative only.
- **Useful for the intended testing workflow?** As a *second* deterministic CPU backend for f32 shader-correctness checks inside CTS-style bounds — yes, with the limits above. Not for f16, not for NaN/inf/subnormal/special-value semantics, not as proof of correct behavior on real GPUs.
- **Next step for the team:** see §F (controlled CI proof of concept is supported; items needing more evidence listed).

## B. Environment and methodology

Pinned (exact facts): Node 24.21.0, `webgpu@0.6.2` (Dawn commit `77f9a9aa…` by tag pin), typegpu 0.12.7, vitest 4.1.11, CTS `e325d0bc…`, evaluator = frozen Phase 1 (`evaluator-versions.sha256`, hashes verified before every evaluation by `tools/evaluate-with-meta.sh`, recorded in each `eval.meta.json`), dump-test files = frozen `7ef74b00…`/`54a06d7a…`.

| item | value |
|---|---|
| ICD source | `https://snapshot.debian.org/archive/debian-security/20261015T173155Z/pool/updates/main/c/chromium/chromium-common_155.0.8059.79-1~deb13u1_{arm64,amd64}.deb` |
| .deb sha256 | arm64 `2f8d97e652ad…b2b5`, amd64 `3ea439a3991c…f9a6` (`env/acquisition/debs.sha256`; CI verifies amd64) |
| `libvk_swiftshader.so` sha256 | arm64 `fa5d1251299c…931a` (27 MB, LLVM 16), amd64 `12be11b09ef3…026e` (5.4 MB, Subzero); same amd64 hash observed on the CI runner |
| ICD manifest | `{"file_format_version":"1.0.0","ICD":{"library_path":"./libvk_swiftshader.so","api_version":"1.0.5"}}` |
| Adapter (dawn.node) | vendor `google`, architecture `swiftshader`, device `swiftshader-device-llvm-16-0-0-` (arm64) / `swiftshader-device-subzero-` (x64), description `SwiftShader driver 5.0.0`, `isFallbackAdapter` true, 19 features, subgroups 4/4, no `shader-f16` |
| Vulkan loader | `libvulkan1 1.3.275.0-1build1` (Ubuntu 24.04) with `VK_DRIVER_FILES`, `VK_ICD_FILENAMES`, `VK_LOADER_DRIVERS_SELECT` pointing only at the ICD |
| Images | new tags `webgpu-poc-swiftshader-{oracle-ext,cts}:{arm64,amd64}` built from new `docker-swiftshader/*` (no `mesa-vulkan-drivers`; build-time checks passed); image ids in each run's `host-command.txt` |
| Native CI | 4 runs, GitHub `ubuntu-24.04` x86_64, 2 vCPU, EPYC 9V74 / 9V45 (×2) / 7763; commit `555316b` of the private staging repo; artifacts under `native-x64/` (untouched) with twins in `raw/` and `cts/` |
| Local | Docker 29.8.2 arm64 on Apple M3 Pro (8 CPUs given to the VM) |

**Unpinned / not available (fact):** base image digest of `ubuntu:24.04` (id recorded, not pinned), apt package versions (recorded in `env.txt`), GitHub runner image drift (`ImageVersion` recorded), the SwiftShader source revision inside the Chromium build (not exposed by the binary), Debian `Packages` signature not independently checked (sha256 pinned by us at first fetch).

**Method.** Same input lists as Phase 1: for every dump `tools/check-input-identity.mjs` proves identical schema, ops, group list, row ids and sha256 of all input bits against the frozen Lavapipe reference (A `a9061d0c…`, B `b76721f2…`, C `8c2fa0b8…`, D `5c4c8a84…`, L `30c00725…`), identical `want` and TypeGPU-CPU columns after NaN canonicalisation, no all-zero GPU output, `cpuRecompute` mismatches 0. All 55 valid dumps passed. Evaluation by the frozen evaluator; comparison with `compare-bits-ext.mjs` plus `tools/analyze-ss-vs-lav.mjs` (lane-level ULP/abs error on lanes accepted by both). Categories keep Phase 1 meaning (accepted = inside bounded CTS interval, not proof of correctness; rejected = outside; indeterminate = NaN operand or unbounded interval; unverified = no CPU result).

Evaluator validation on the target environments (§6 of the task): self-tests 49/49 and re-evaluation of frozen dumps byte-identical to frozen `eval.json` — arm64 Linux container (8 dumps: A, B, C×2, D, E, L×2; `eval/parity-linux-arm64/PARITY.md`) and **native Linux x86_64 on 3 CPU models, 4 runs** (`native-x64/*/parity/PARITY.txt`; dumps D, C, E, L): identical except the documented host counter `oldRecompute.wantMismatches` (group C, JS `Math.pow` of the producing host; 0 vs 10 in frozen file; affects no verdict). Phase 1's open limitation "evaluator not checked on Linux x86_64" is closed.

## C. Numerical results

Per-configuration identical GPU category totals (accepted / rejected / indeterminate / unverified lanes) in every config; CPU column (TypeGPU CPU path) identical to Lavapipe as well:

| group | ops | lanes | GPU a/r/i/u (SwiftShader = Lavapipe) | CPU a/r/i/u |
|---|---|---|---|---|
| A | add, sub, mul, neg | 75 500 | 63 720 / 0 / 11 780 / 0 | 49 242 / 0 / 2 744 / 23 514 |
| B | div, min, max | 75 000 | 62 960 / 0 / 12 040 / 0 | 46 924 / 0 / 2 343 / 25 733 |
| C | inverseSqrt, exp, exp2, sin, cos | 2 200 | 1 920 / 0 / 280 / 0 | 1 476 / 0 / 82 / 642 |
| D | sqrt, tanh | 900 | 770 / 0 / 130 / 0 | 645 / 0 / 25 / 230 |
| L | mod, log, log2, pow (f64 `want`) | 41 610 | 32 860 / 0 / 8 750 / 0 | 25 574 / 0 / 2 840 / 13 196 |
| E | f16 add, sub, mul | — | **not runnable** (capability blocker) | — |

`rejected = 0` everywhere does not prove correctness; 12–16 % of GPU lanes are `indeterminate`. No lane changed CTS category between SwiftShader and Lavapipe (`categoryChanges = {}` in every pair).

Lane-level differences against Lavapipe (value-differing lanes; same category in all; generated: `compare/lavapipe-vs-swiftshader.md`):

| group | SwiftShader arm64 (LLVM 16) vs Lavapipe arm64 | SwiftShader x64 (Subzero) vs Lavapipe arm64 |
|---|---|---|
| A | 0 (bit-identical) | 2 150 (2.85 %) + 72 NaN-sign-only |
| B | 0 (bit-identical) | 3 460 (4.61 %) + 42 NaN-sign-only |
| C | 890 (40.45 %) | 910 (41.36 %) + 36 |
| D | 90 (10 %) | 110 (12.22 %) + 39 |
| L | 9 920 (23.84 %) | 10 140 (24.37 %) + 1 232 |

(x64-vs-arm64 NaN-sign-only lanes reflect the architecture, as in Phase 1. Against **Lavapipe native x64** the x64 SwiftShader numbers are A 2 150, B 3 460, C 910, D 110, L 10 140 value-differing lanes; `raw/group*/swiftshader-x64-*/cmp-vs-lavapipe-x64.json`.)

**Findings with evidence (anomaly log).**
1. *Subnormal flush on Subzero (x64).* In A the 2 150 lanes split into 2 030 "zero/subnormal involved", 40 normal-finite, 80 NaN-vs-non-NaN; operand classes: 1 940 subnormal-operand, 130 normal/zero-operand (products below FLT_MIN), 80 inf-operand — the same class pattern as Phase 1's Metal-vs-Lavapipe. B: 3 300 zero/subnormal, 120 NaN-vs-non-NaN, 40 inf-vs-finite. Hypothesis (not traced): Subzero-generated code runs with flush-to-zero/denormals-are-zero. All lanes are accepted/indeterminate on both sides.
2. *`mod` exact vs approximate.* On lanes accepted by both, SwiftShader equals `fround(want)` in 2 667/2 667, Lavapipe in 2 225/2 667 (max abs error 10.3). Old harness policy: SwiftShader `mod` fail rows 0 (Lavapipe 280). `log`/`log2` keep the same 20 failing rows (subnormal inputs) on both. Interpretation: Phase 1's "mod 280 failures" were Lavapipe-specific and inside the CTS interval.
3. *sin/cos.* SwiftShader abs error on accepted lanes up to 1.88e-4 vs Lavapipe 5.0e-8 (CTS bound 2^-11 = 4.9e-4): passes, but uses ~38 % of the allowed budget on these inputs; e.g. `sin(π_f32)` = 0 vs Lavapipe −8.7e-8; `sin(−0)` = +0, `tanh(−0)` = +0, `mod(−0, y)` = −0 (Lavapipe −0 / −0 / +0 respectively). Median difference 825 ULP (sin) — ULP is not the CTS metric for these.
4. *exp/exp2/tanh/pow/log.* 1-ULP-class differences (exp, exp2: all 1 ULP; pow max 19 ULP; tanh max 12 ULP). My pre-run hypothesis that SwiftShader's `Exp2` input clamp (≈ −127) would break CTS underflow cases is **refuted**: on the inputs of the harness and the CTS, SwiftShader returns the same flushed 0 as Lavapipe for x ≤ −100 and passes CTS exp/exp2/pow.
5. *Special values (unconstrained by CTS, `compare/special-values-arm64.md`).* `log(0)` −88.03 (Lavapipe −inf), `log2(0)` −127, `log(NaN)` 89.13, `log2(NaN)` 128.58, `log(−1)` 0, `exp(NaN)`/`exp2(NaN)` +inf, `pow(0,0)` 1 (Lavapipe 0), `pow(0,0.5)` 7.67e-20 (should be 0), `pow(0,−1)` 1.7e38, `mod(0, ±inf)` 0 (Lavapipe NaN). Fact only; consistent with polynomial implementations without special-case handling (upstream source read by check 5/6), mechanism not traced here.
6. *x64 vs arm64 on SwiftShader itself:* C 100, D 20, L 340 value-differing lanes (transcendentals/legacy) besides the flush effects above — consequence of different JIT backends (and architecture); cannot be separated without a second build (see G).
7. *Determinism.* arm64: 3 runs per group byte-identical. x86_64: 8 dumps per group (4 CI runs × 2, 3 CPU models) byte-identical for A, B, C, D; for L one dump differs only in one `want` NaN sign (JS host, Phase 1 effect) — GPU and CPU columns identical, eval.json identical. Cross-CPU bit-identity of the GPU output on x86_64 (EPYC 9V74/9V45/7763) holds.
8. *f16 (E).* `shaderF16:false` in every run, 6 independent environments; CTS-style device (all offered features + adapter max limits) is created fine, so it is not a device-creation problem. Recorded as `NOT_APPLICABLE.md` in each group-E dir (not `INVALID`).

## D. CTS results

Spec set = Phase 1's: 23 original spec files + 1 PoC-only grid spec (`coverage-matrix.json` → `cts`; same selection as `third_party/run-cts.sh` CTS_EXTENDED=1 — `tools/run-cts-swiftshader.sh` is a diff-checked copy adding only a per-file timeout and wall time). Per-file case counts equal to the frozen Lavapipe logs (68/72/36/27/16/3).

| configuration | cases | passed | warned | skipped | failed | unexecuted | exit codes |
|---|---|---|---|---|---|---|---|
| Lavapipe arm64 (frozen) | 1 162 | 1 162 | 0 | 0 | 0 | 0 | 0 |
| SwiftShader arm64 run1 / run2 | 1 162 | 686 | 0 | 476 | 0 | 0 | all 24 files 0 |
| SwiftShader x64 ×4 (EPYC 9V74, 9V45 ×2, 7763) | 1 162 | 686 | 0 | 476 | 0 | 0 | all 24 files 0 |

All 476 skips carry the reason `SKIP: device does not have feature: 'shader-f16'` and belong to f16 tests (4 f16 binary files = 272 cases + f16 parts of 13 call-builtin files = 204). Comparable denominator: **686 cases** (683 original + 3 grid). Status of every case identical between arm64 run1 and run2 (0 differences of 1 162). Interpretation limits: a CTS pass means the spec's own interval checks pass for the spec's own inputs; one case checks a whole input list; nothing here classifies a CTS failure as a backend defect (there were none).

## E. Performance and CI

Comparable (fact): same host, interleaved, one kernel per process, same `--cpuset-cpus`, adapter identity verified in every run (`tools/perf-run.sh`, `perf/phase-timing.mjs`; summaries in `compare/perf-summary-*.txt`). Medians of paired ratios SwiftShader/Lavapipe, N = 30 000 invocations, 8 pairs per cell, kernels add/pow/sin/exp2:

| metric | arm64 (Docker, 4 CPUs) | native x64 EPYC 9V74 | native x64 EPYC 9V45 |
|---|---|---|---|
| requestDevice | 0.12× (1.6 vs 13 ms) | 0.08× | 0.08× |
| shader+pipeline compile | 7.6–8.7× (≈8 vs ≈1 ms) | 2.9–3.5× | 3.0–4.0× |
| first submit (cold) | 0.17–0.20× | 0.24–0.40× | 0.24–0.35× |
| compile + first submit | comparable (≈9 vs ≈7–8 ms) | SwiftShader lower (≈11–13 vs ≈14–19 ms) | similar |
| steady dispatch median | 0.86–1.12× (≈0.1 ms, overhead-dominated) | 3.7–4.0× | 3.96–4.4× |
| max RSS | 139 vs 172 MB | ≈120 vs ≈169 MB | similar |

Other: TypeGPU dump tests (harness level, 6 interleaved pairs, arm64): tests-phase 1.07× / 0.97× / 1.07× (A / C / L), import+init 0.88×. CTS per-case time (686 comparable cases, arm64, **not interleaved**, Lavapipe from the frozen run): median ratio 1.07, sum 31.2 s vs 25.6 s. CI (native, 2 vCPU): ICD download+verify+extract 1–2 s, image build ≈30 s (cold), whole job 213 s (CTS included, no perf) to 502 s (with perf); extended CTS 71–112 s wall inside the container (Lavapipe's 285 s Phase 1 stage included the docker build — not comparable).

Not claimable: any absolute speed statement; x86_64 workloads ≥ 65 536 invocations (not re-measured after the crash fix); GPU-real performance. x64 N = 65 536 cells have 1–4 valid pairs (SwiftShader crashed in 24 and 28 of 32 runs) and are not used.

**Crash observation (CORRECTED):** see `perf/crash-investigation/GC-HYPOTHESIS-RESULT.md`: the crashes of `perf/phase-timing.mjs` (arm64 and x64 CI, `perf/runs-arm64.jsonl`, `runs-arm64-v2.jsonl`, `runs-x64.jsonl` in the CI artifacts) came from the garbage-collected `create()` result, not from a backend. With the one-line fix (`perf/phase-timing-v2.mjs`) a re-run at N = 30 000 / 262 144 / 1 048 576 had 144/144 successful processes (`perf/runs-arm64-v3.jsonl`, `compare/perf-summary-arm64-v3.txt`). Larger-N steady-state on arm64 (6 interleaved pairs): SwiftShader/Lavapipe dispatch 1.0× at 30 k, 1.3–2.1× at 262 k, 1.4–2.4× at 1 M; compile 7–8× (SwiftShader), first submit 0.2–0.45×, readback 0.35–0.65×. The x86_64 N = 65 536 cells of the first round are invalid for the same reason; the N = 30 000 x64 ratios (≈4×) were measured without crashes and stand.

**CI suitability (fact + proposal).** Reproducible in a standard `ubuntu-24.04` runner and container with: `curl` of a sha256-pinned .deb, `dpkg-deb -x`, an image without `mesa-vulkan-drivers`, `VK_DRIVER_FILES` set, and the assertions of `ss-tools/assert-backend.mjs`. Needs no GPU/privileges. Proposed minimal job = `ci-proposal/swiftshader-x64-check.yml` (already exercised 4×, manual only, in the private staging repo; **not** added to any production workflow). Pin/record on every run: .deb sha256, `.so` sha256, image id, base image digest, runner `ImageVersion`, CPU model, adapter strings, evaluator hashes.

## F. Engineering recommendations (no commitment by the team implied)

- **Suitable for immediate experimentation:** running the existing f32 PoC pipeline (dumps A–D, L) and the CTS subset on SwiftShader to cross-check Lavapipe; using `forceFallbackAdapter:true` + the assertion script as a backend guard.
- **Suitable for a controlled CI proof of concept:** a manual/scheduled job running the 23-file CTS (≈1.5–2 min) plus group A–D dumps (each < 1 s test time) on SwiftShader next to Lavapipe, compared by CTS category, with the ICD pinned by URL+sha256. Criteria to fix beforehand: backend assertion passes, 0 failed/warned/unexecuted CTS cases, skips only the expected 476.
- **Requires additional evidence:** (1) whether TypeGPU-generated WGSL from the docs examples compiles and runs on SwiftShader (not tested here — the matrix used the harness ops, not TypeGPU example shaders); (2) _(closed: crashes were a script bug)_ ; (3) x86_64 steady-state at larger workloads (re-run `perf-run.sh` with `phase-timing-v2.mjs` on native x64); (4) separating architecture from JIT-backend effects (needs an LLVM build on x64 and/or Subzero on arm64 from source, pinned at Dawn's `1e80438d`); (5) whether the Chromium-vendored revision differs from Dawn's pin in numerics.
- **Not recommended on current findings:** f16 testing on SwiftShader (unavailable); asserting NaN/inf/subnormal/signed-zero or out-of-domain results (`log(0)`, `pow(0,y)`, `mod(0, inf)`) against SwiftShader; relying on bit-equality between arm64 and x64 SwiftShader or between SwiftShader and Lavapipe; comparing performance across different hosts; leaving the `create()` result of dawn.node unreferenced (process crash, any backend).
- Out of scope / not answerable here: priority and cost-benefit, parity with real GPUs, long-term flake rate, CI Chromium/Dawn version match.

## G. Limitations and confidence

| conclusion | evidence | confidence | caveats / what would invalidate |
|---|---|---|---|
| SwiftShader executes the workloads through the unchanged path | assertions + loader trace + known-answer compute in every run | high | would be invalidated by a run missing `backend-assert.txt: RESULT: PASS` (none) |
| CTS categories equal Lavapipe's for A–D, L; rejected = 0 | 55 dumps, frozen evaluator, byte-identical eval across repeats | high for these input lists | small C/D samples; `rejected = 0` ≠ correctness |
| CTS pass on 686 comparable cases | 6 runs (arm64 ×2, x64 ×4) | high | one case = whole input list; f16 not executed |
| f16 unsupported | `shaderF16:false` ×many + upstream source flags | high | would change with another SwiftShader build |
| Subzero flushes subnormals, LLVM-16 does not | lane-class counts in A/B/D | medium-high (observed), mechanism unknown | two different archs *and* two backends: attribution to the JIT backend is an inference |
| Determinism (bit-identical GPU outputs across runs/CPUs) | 3 arm64 runs; 8 x64 dumps on 3 CPU models | high for these ops/inputs | one SwiftShader build per arch; GitHub CPU pool seen = AMD only |
| `mod` exact, Lavapipe `mod` approximate | lane analysis, old-policy rows | high (observed) | exact-match measured on harness inputs |
| Performance ratios | interleaved pairs, adapter-verified | medium for small kernels; none for large | tiny workloads, overhead-dominated steady times; crash regime excludes bigger sizes |
| Raw-script crashes were a script bug (GC of `create()` result) | 24/24 crashes → 0/24 after keeping the reference, both backends | high | none observed |
| Special-value behavior differs | dump facts | high as observation | mechanism not traced; CTS says unconstrained |

Remaining unpinned items and single-revision risk: see §B. Anything not listed in §C–E (TypeGPU shader-level tests, Windows/macOS software backends, hardware GPUs) is **unverified**.

## H. Reproduction guide

Prerequisites: Docker, Node 24.21.0, repo at `<poc>`. Never run `npm run conformance`, `scripts/run.mjs`, plain `npm test`, or the frozen `build-baseline.mjs` (see `final/lavapipe-baseline/BASELINE.md`).

```bash
cd <poc>; S=investigations/backend-diff/swiftshader
# 0. acquisition (.deb already stored, sha256 in $S/env/acquisition/debs.sha256); extraction: ar x <deb>; tar -xJf data.tar.xz ./usr/lib/chromium/libvk_swiftshader.so ./usr/lib/chromium/vk_swiftshader_icd.json
# 1. evaluator self-test + frozen tree check
node investigations/backend-diff/final/oracle-extension/selftest-evaluator.mjs         # 49/49
bash $S/tools/frozen-tree-check.sh
# 2. image (arm64 on this host) + smoke (backend assertion + step1 + group D dump)
docker build --build-arg SS_ARCH=arm64 -f docker-swiftshader/Dockerfile.oracle-ext -t webgpu-poc-swiftshader-oracle-ext:arm64 .
MODE=smoke EXT_OPS=sqrt,tanh OUT=$S/smoke/<new-dir> docker-swiftshader/run.sh webgpu-poc-swiftshader-oracle-ext:arm64
# 3. dump + evaluation (groups: A add,sub,mul,neg | B div,min,max | C inverseSqrt,exp,exp2,sin,cos | D sqrt,tanh | L mod,log,log2,pow)
MODE=dump EXT_OPS=<ops> OUT=$S/raw/group<G>/swiftshader-arm64-run<N> docker-swiftshader/run.sh webgpu-poc-swiftshader-oracle-ext:arm64
F=investigations/backend-diff/final/oracle-extension
node $S/tools/check-input-identity.mjs $F/group<G>/lavapipe-arm64-run1/allrows-bits-ext.json <dump>
bash $S/tools/evaluate-with-meta.sh <dump> <dir>/eval.json
node $F/compare-bits-ext.mjs <out.json> lavapipe=$F/group<G>/lavapipe-arm64-run1/allrows-bits-ext.json swiftshader=<dump>
node $S/tools/analyze-ss-vs-lav.mjs <out.json> <lavapipe dump> <swiftshader dump>
# 4. CTS
docker build --build-arg SS_ARCH=arm64 -f docker-swiftshader/Dockerfile.cts -t webgpu-poc-swiftshader-cts:arm64 .
OUT=$S/cts/<new-dir> docker-swiftshader/run-cts.sh webgpu-poc-swiftshader-cts:arm64
# 5. derived artifacts
node $S/tools/build-swiftshader.mjs; node $S/tools/build-comparison.mjs
# native x86_64: workflow `swiftshader-x64-check.yml` in the private staging repo (workflow_dispatch; inputs repeats, cts, perf); ingest with `bash $S/tools/ingest-native.sh <run id> <cpu label>`
# verify this package (from the swiftshader directory)
cd $S && shasum -a 256 -c manifest.sha256
```

Authoritative artifacts: `coverage-matrix.json` (runs, repeatability, CTS), `compare/lavapipe-vs-swiftshader.{md,json}`, `compare/special-values-arm64.md`, `compare/perf-summary-*.{txt,json}`, `compare/cts-timing-arm64.txt`, `eval/parity-linux-arm64/PARITY.md`, `native-x64/*` (raw CI artifacts), `raw/`, `cts/`, `env/`, `report/frozen-tree-check.txt`, `manifest.sha256`.

## Failed / invalid attempts kept (with explanations)
- `smoke/swiftshader-arm64-smoke1` — my probe bug (two `requestDevice` on one adapter); superseded by smoke2.
- `native-x64-failed-attempts/` — CI runs 39278011958 / 39278031923: my workflow bug (`sha256sum` on a directory under `bash -e`); fixed in commit `555316b`.
- `perf/runs-arm64.jsonl` — first perf attempt (N = 1 048 576, 63 of 123 processes crashed on both backends); `perf/crash-investigation/` — bisection of the crash regime.
- `raw/groupE/*` — capability blocker, `NOT_APPLICABLE.md`.
- CI status display: runs 39279009516/39279024870/39280268123/39280283304 showed `queued` in `gh`/API long after they had finished (artifacts existed); results used from the artifacts.
