# Phase 3 — Final decision: software-GPU backend for TypeGPU CI

Date: 2026-10-20. Compiled from the eight workstream reports (each in `phase3/<ws>/REPORT.md` + `RESULTS.md`).
Criteria and decision rule were fixed in `PLAN.md` before any data. Nothing in the frozen Phase-1 baseline, the Phase-2 tree or the TypeGPU checkout was modified (checks at the end).

## 1. Verdict

| | |
|---|---|
| **PRIMARY** | **Lavapipe** (Mesa `mesa-vulkan-drivers` via apt, version-pinned) |
| **SECONDARY** | **Not needed for detection.** SwiftShader is an optional cross-check only (see §5). |
| Confidence | **Medium-high** for "Lavapipe, not SwiftShader, as the single backend"; **medium** for "secondary not needed" |
| Scope | Regression detection for TypeGPU on x86_64 GitHub runners. It is NOT a statement about real-GPU/Metal parity: no software backend can give that (see §6). |

Why, in three sentences: on everything that detects bugs the two backends are **tied** (same 34 of 36 mutants once f16 is excluded, 0 flakes each, same 87/97 examples). Lavapipe then wins on the tie-breakers that matter for a CI maintainer — it can run `shader-f16`, it is 4–6× faster at compute and avoids the example timeouts SwiftShader hits, it is simpler to install (one apt package), and it is closer to Metal in the real examples. SwiftShader's only clear advantages are bit-stability across CPUs and lower version drift, and both can be handled for Lavapipe with a NaN-canonicalising comparison and a version pin.

## 2. Scorecard (pre-registered criteria)

| id | criterion | Lavapipe | SwiftShader | result |
|---|---|---|---|---|
| C1 | **Detection power** — 50 seeded TypeGPU bugs (18 historic, 32 synthetic), same-backend differential, test pool = 13 example tests + 6 investigation suites + ported suite (+14 own tests) | 36 detected (value channel), 5 text-only, 9 missed | 34 detected, 2 "not run (f16)", 5 text-only, 9 missed | **TIE** (raw 36 vs 34; the 2 difference are f16 mutants M01/M21 → rule: does not count). No mutant caught by SwiftShader and missed by Lavapipe. |
| C2 | **Flakes** — scope: suite v1 = 1878 tests, 62 CI jobs per backend on native ubuntu-24.04 x86_64, 6 CPU models, 3 times of day (299 matrix jobs over all suites; 0 job-level infra failures = apt/download/npm/runner/identity; test-process crashes are NOT part of that count, see §10) | 0 flakes, 0 value variance. Bit-level dump: 186/195 210 lanes vary, **all NaN sign only** | 0 flakes, 0 value variance. Bit-level: 1 lane flips sign in 3/60 jobs | **TIE** (hard gate passed by both; 95 % upper bound ≈ 4.7 %/job) |
| C3 | **Example coverage** — all 97 docs examples headless | 87 ran-clean, 10 need unavailable API (camera/WebGL/network); 85/97 with checkable readback | identical classes | **TIE** (0 false reds vs Metal, 0 exclusive failures); passes the 80 % gate |
| C4 | **Truth proximity** — 16 root-cause divergence groups | CTS: 0 rejected lanes of 195 210; strict outliers 0/0 | same | **Strict TIE**; lean (non-authoritative): SwiftShader off in 6 groups (weighted 9), Lavapipe off in 3 (w 3). In real examples Lavapipe is closer to Metal (43 vs 30 identical-or-tiny of 87); SwiftShader is lone outlier in 16 examples, Lavapipe in 1 (and that one is environment-dependent, not numerics). **Leans Lavapipe.** |
| C5 | **f16 cost** | has `shader-f16` | not offered by any of 16 builds; 33 skipped tests in BASE vs 17; 476 CTS cases skipped; 2 of 50 mutants (M01, M21) undetectable | **Lavapipe**. Practical cost is small today: only 3 of 97 examples touch f16, all optional, 0 fail without it. |
| C6 | **Update drift** | 11 Mesa versions 23.2→26.2 tested: 0 lane changes 23.2→26.0.8 (except 1 example, `normalize` ≤2 ULP); 26.1 flushes subnormals: 3.0 % lanes change, 8 full-suite tests flip fail→pass; CTS 0 flips, categories 0 changes. Mesa 22.x unusable (adapter null) | 13 builds M108→M158: bit-identical to M155 except example `probability` (FMA fusion on/off at M142); categories/CTS/suite 0 changes; M100 differs 0.2 % lanes. Source builds differ 2.4 % from vendored | **SwiftShader slightly lower drift**, but neither moves pass/fail on routine updates. ubuntu-24.04 apt only offers Mesa 24.0.5 / 25.2.8, so drift is small in practice. |
| C7 | **Cost** | install: apt 13.6 s (17.5 MB; runner image already has Mesa libs); v1 job 204 s median; full 97 examples 17 min/job; ripple-cube 196 s (91 % of a 240 s timeout!) | install: pinned .deb 12.8 s but custom extraction + sha pin to maintain; v1 job 152 s (faster on suites); examples 13 min + heavy 8 examples 34 min; ripple-cube 474 s, attractors 380 s (timeouts); steady-state dispatch **3.7–6.2× slower**, compile 3.5–4.5× | **Lavapipe** (simpler and no timeouts) — SwiftShader is faster only on the small integer-heavy suites |

On x86_64 (the CI architecture) SwiftShader (Subzero JIT) also has more known red tests in the full suite than Lavapipe: 359 pass / 34 fail / 33 skip vs 394 / 15 / 17. Most of the extra reds are f16-in-mixed-tests returning zeros and subnormal flush, i.e. more baseline to maintain.

## 3. What GPU backends add over the mocked unit tests (the reason for GPU CI at all)

Join per mutant: `phase3/join/join-mutation-vs-mock.md`.

| | count (of 50) |
|---|---|
| caught by mocked unit tests | 37 (21 by assertion, **16 by WGSL snapshot only**, which cannot tell a bug from an intended change) |
| caught by GPU (Lavapipe or SwiftShader, value channel) | 36 (26 using only the pre-existing GPU pool, 10 more needed the 14 own tests) |
| caught by both | 26 |
| **GPU-only** (mocks miss) | **10**: M26 countLeadingZeros→countTrailingZeros, M27 extractBits args swapped, M33 dispatchThreads floor vs ceil, M34 prefix-scan barrier removed, M42 bitonic default padding (own test), M46 insertBits, M47 firstLeadingBit, M48 countTrailingZeros, M49 dot4U8Packed, M50 trunc→floor |
| mock-only (GPU misses) | 11 (host-side logic, CPU-only paths, layout writer tests: M04 M05 M06 M08 M11 M12 M13 M15 M16 M20 M44) |
| missed by both | 3 (M02, M25 faceForward [text-only on GPU], M35 barrier race — only Metal sees M35) |
| union | 47 of 50 |

Reading: GPU CI is **complementary, not a replacement**: each side catches things the other misses. Of the 10 GPU-only catches, **7 are `std` builtins that have no CPU implementation and no mocked test** (M26 countLeadingZeros, M27 extractBits, M46 insertBits, M47 firstLeadingBit, M48 countTrailingZeros, M49 dot4U8Packed, M50 trunc); the other 3 are `dispatchThreads` rounding (M33) and `@typegpu/sort` (M34 barrier, M42 padding; `@typegpu/sort` has no unit tests). An eighth builtin without CPU implementation, `faceForward` (M25), is *not* GPU-only: on GPU it shows as text-only difference, so it sits in the "missed by both" row. That means (a) GPU CI has real, demonstrated value for exactly those paths, and (b) a cheaper partial fix also exists — add tests for those builtins (even simple WGSL-text or GPU known-answer tests). The decision to adopt GPU CI is the team's cost/benefit call; this data says which defect class it buys.

Metal-only/other: M35 (barrier race) was seen only on Metal; M32 (`>` vs `>=` guard) was seen on both emulators but not on Metal because the emulators clamp an out-of-bounds storage write to the last element while Metal drops it — an example of emulator behaviour that is more forgiving/different than real hardware.

## 4. Why Lavapipe over SwiftShader — the decisive points
1. **Detection tie** → the choice falls to secondary criteria (rule in PLAN.md).
2. **f16**: only Lavapipe can exercise f16 code paths (2 mutants invisible on SwiftShader; 476 CTS cases and 16 more tests skipped).
3. **Practicality**: apt one-liner vs maintained extraction of a Chromium-vendored library; 4–6× faster compute; no example timeouts at 240 s (SwiftShader needs ≥450 s limits for 3–4 examples and 8 jobs showed 4/8 timeouts on ripple-cube).
4. **Closer to Metal in real examples** and fewer unexplained numerics (SwiftShader's sin/cos error ≈1.9e-4 is accepted by the CTS but visible in `probability`; also `log(0)`, `exp(NaN)` special values and NaN written to r16float differ from Metal/Lavapipe).
5. **Weaknesses of Lavapipe that were measured and are manageable**: NaN sign/payload random between runs (186 lanes of 195 210, never a finite value, never a category) → compare by category or canonicalise NaN; Mesa 26.1 subnormal flush → pin Mesa version.

## 5. When SwiftShader is still worth something
Only as an **optional nightly cross-check** — not needed by the rule (0 exclusive catches). Its real merits: bit-identical output across CPU models, near-zero drift M108→M158, an independent implementation useful when a failure needs "is it TypeGPU or the driver?". If used: pin Chromium-vendored `libvk_swiftshader.so` by sha256 (Debian snapshot URL), expect `shader-f16` absent, and give heavy examples ≥450 s.

## 6. Practical recipe (suggestion, not applied anywhere)
- Backend: `apt-get install --no-install-recommends mesa-vulkan-drivers libvulkan1` on ubuntu-24.04 (Mesa 25.2.8, same in all 299 jobs); assert backend identity each job (llvmpipe, `forceFallbackAdapter` is null on Lavapipe). Pin by `=version` only while the mirror carries it; plan for 26.1+ behaviour when the runner image moves to ubuntu-26.04 (Mesa 26.0.8 = 0 drift vs 25.2.8 in our data).
- Keep the dawn.node object referenced (`globalThis.__gpu`): GC of `create()` result crashes the process (cause of the earlier hangs; also suspected for 2 worker crashes in SwiftShader full-suite runs).
- Tiers: PR = fast subset (v1 suites ≈3.5 min per job); nightly = all 97 examples (≈17 min on Lavapipe x64) with `EX_TIMEOUT_MS` ≥ 300000.
- Assert via CTS-interval/category or exact integers; avoid golden floats and NaN bits.
- Still run real-GPU/Metal checks for what emulators cannot see (races like M35, OOB-write semantics like M32, vendor float behaviour).

## 7. Limitations — what this does NOT establish
- **Mutation catalogue is ours** (18 historic + 32 synthetic); detection rates describe this bug set, not all future bugs. Reach/equivalence of several mutants is judged by reading (see catalogue notes); 13 were deliberately unreachable.
- **14 "own" GPU tests were written by the mutation workstream after reading the catalogue** → biased towards the catalogue. Pre-existing pool alone: 26 detected on each emulator, still tied.
- BASE determinism for the mutation pool is 2 repeats per backend; mutation (main campaign), drift and examples ran on arm64 Docker. **Update 2026-10-20: the mutation detection was replicated on native x86_64 (§11): verdicts identical.** Drift (Mesa/SwiftShader versions) and examples cross-backend numerics remain arm64-only; x86_64 evidence there = CI soak (suite v1, dump, v2 examples classes, perf).
- Full 97-example runs of the mutants were done on Metal only (16 mutants; +3 detections), not on Lavapipe/SwiftShader.
- Flake rate is from ~3.5 h on one day, 2 runner images, one Mesa version; long-run (weeks) flake rate unknown.
- 10/97 examples cannot run (camera/WebGL/network); 7 ran with degraded inputs; canvases 256×256, 30 frames.
- Example divergences (53) are mostly unattributed numerics or example nondeterminism; no correctness difference vs spec was established for any backend. "SwiftShader is the outlier" is a lean, not a verdict (CTS rejects 0 lanes anywhere).
- Mock-test "caught by snapshot only" (16) is weak evidence; 4 "assertion" catches rest on a single failing test.
- Version drift covers 11 Mesa and 13 SwiftShader builds, one run each; Mesa 22.x and some intermediate versions unmeasured; vendored-vs-source SwiftShader difference (2.4 %) mechanism unexplained; glibc/libm not varied.
- Phase-2 statements softened by this phase (see `adjudication/REPORT.md`): Lavapipe asin/acos are accepted by the real CTS interval (the "exceeds bound" claim holds only for the harness's abs-only bound); the 12 x64 min/max/neg SwiftShader reds are harness-policy artefacts.

## 8. Integrity checks (2026-10-20)
- Frozen Phase-1 manifest from `final/`: 825 OK / 0 failed; evaluator-versions 33 OK; Phase-2 manifest 4634 OK / 0 failed; no files in `final/` or `swiftshader/` newer than the Phase-3 plan.
- PoC baseline manifest: only the 2 known staging-repo files differ (`_x64-ci-repo/.github/workflows/lavapipe-x64-check.yml`, `README.md`), as at Phase 2.
- TypeGPU checkout: HEAD `e893ad11`, 0 status lines. Nothing pushed to any TypeGPU remote.
- Staging repo `the private staging repository`: clean, `main` = `origin/main`, HEAD `1a58c5a`; only manual workflows; ≈1 375 billable CI minutes used (estimate).

## 9. Housekeeping the user may want
- Docker: ~100+ `webgpu-poc-p3-driftss-*` images plus the drift-lavapipe and p3 images occupy disk (`docker images`); removal command is in `drift-swiftshader/REPORT.md`. Not removed.
- `phase3/soak/raw` is 1.8 GB; leftover scratch dirs `phase3/mutation/work/M*` can be deleted.
- Suggested follow-ups (not requested): run mutation tier-1 on native x86_64 (both backends); extend GPU-only candidate tests (the 8 CPU-less builtins) as plain tests; long-run scheduled soak for flake rate.

## 10. Review addendum (2026-10-20) — five reviewer points checked against the data
Done from existing artifacts; no new runs except where stated.

1. **"13 unreachable mutants vs detection metrics" — checked, does not distort the equality.** Both backends are scored on the same 50 mutants; the comparison is *paired*: verdicts are identical on 48 of 50 mutants and differ only on M01 and M21 (both f16: Lavapipe DETECTED, SwiftShader not-run). The 9 misses are the same 9 mutants on both backends. Restricted to mutants with a named reach (41 by `expected_reachable_by` in catalogue.json) both detect 32/41. The unreachable ones therefore cannot create or hide a difference; they only lower both absolute rates (36/50 and 34/50 are *this catalogue's* rates, not a general detection rate). Minor inconsistency to be aware of: CATALOGUE.md tags 13 mutants "no named reach", the JSON field is empty for 9 — the counts come from different tagging passes; neither changes the paired result. **Decision: no further check.**
2. **"Eight std builtins" — real wording error, fixed in §3 above.** Eight builtins lack CPU implementation (incl. `faceForward`), but only 7 of them appear among the 10 GPU-only catches; `faceForward` (M25) is a miss-by-both (text-only on GPU). The 10 GPU-only = 7 builtins + M33 + M34 + M42. **Decision: fixed, no check.**
3. **"299 jobs, 0 infra errors" vs "two worker crashes" — different samples; boundaries now explicit.** (a) 299 = CI matrix jobs on native x86_64 (soak); "infra failures" there means job-level failures. In those jobs no vitest worker crash occurred: 62 SwiftShader and 62 Lavapipe full-suite runs with identical outcomes. (b) The two worker crashes (step2.test.ts, M128 and M150 run 1) are from WS-DRIFT-SS: 2 of 27 full-suite runs on **arm64 Docker**, not reproduced in 6 repeats each; cause unattributed (GC hypothesis, unproven). Lavapipe arm64 full-suite runs (11 Mesa configs + baselines) had none — but 2/27 vs 0/11–14 is not statistically separable (Fisher exact p = 0.54–1.0), so it is not evidence about either backend. (c) Also correct C2 for suite v2: SwiftShader has **1 attributable timeout flake** (simple/ripple-cube: 4 ran-clean / 4 reported "crashed" = runner time limit ~455–476 s, 8 jobs); Lavapipe's slowest example is at 91 % of the same 240 s limit. "0 flakes" in the scorecard refers to suite v1 only. **Decision: documentation fixed; no new run (a repeat could not settle a 2/27 event at reasonable cost).**
4. **"87 ran-clean vs 85 checkable" — not used as correctness evidence.** `ran-clean` = no throw/validation error/timeout, `checkable` = a non-zero readback exists (85/97 on each backend); the C3 gate uses coverage only. Correctness is not claimed from clean runs: 7 of the examples ran with degraded inputs (fake 2D canvas/audio), canvases are 256×256 for 30 frames, and the cross-backend numeric comparison (53 divergent examples) is reported separately with no oracle verdict. **Effective "real-input, checkable" coverage is therefore ≈78–85 of 97, not 87.** Wording in §2 C3 should be read as "runs and produces data", not "is correct". **Decision: clarified, no further check.**
5. **"36 vs 34 detected on arm64 while the recommendation targets x86_64" — genuine gap in the experiment-to-conclusion chain.** Most tiebreaker evidence (soak, perf, timings, examples classes, flake rate) is native x86_64, but detection (C1) and drift were arm64 Docker. Risk assessment: detection is mostly integer/layout/value-path driven, so a verdict flip is unlikely; but SwiftShader's x86_64 JIT (Subzero) differs from arm64 (LLVM) in special-value handling (flush of subnormals, different red tests), so replication is not guaranteed. **Decision: worth a bounded additional check** — done, see §11 (result: gap closed for detection).

## 11. Native x86_64 replication of the mutation campaign (WS-X64-MUT, 2026-10-20)
Pre-registered H0: per-mutant verdicts on x86_64 equal arm64's, and Lavapipe-vs-SwiftShader detected sets differ by <2 mutants excluding f16. **H0 confirmed.**
- 100/100 (mutant × backend) verdict classes identical to arm64: Lavapipe 36 DET / 5 text-only / 9 missed; SwiftShader 34 DET / 2 not-run (f16) / 5 text-only / 9 missed. Detected-set difference between backends = 0 excluding M01/M21. Canaries M24/M26 detected on both. Re-run of 5 contentious mutants (M07 M32 M33 M35 M42) on other runners: identical.
- Same-runner differential (BASE twice, then mutants, per job); 8 jobs on 5 CPU models (EPYC 9V45/9V74/7763, Xeon 8370C/8573C); identity asserted 8/8 jobs and 138/138 runs; TypeGPU tree sha-verified against e893ad11; 0 crashes, 0 infra failures; ≈159 billable minutes.
- Only observed architecture effect: SwiftShader M33 — same tests detect it, but 14 tests change detection channel because the Subzero JIT makes 12 min/max/neg tests red already in BASE on x86_64 (and 2 vector-fns tests green); no verdict change. x86_64 data is not a copy of arm64 (SwiftShader BASE has 14 pass↔fail flips, value fingerprints differ in 19 % of tests vs 6 % for Lavapipe), but the differential cancels it.
- Residual limits: for mutants DETECTED on arm64 only the arm64-detecting pools were run (new detections could only come from the 14/16 non-detected mutants, which got full pools: none); one main run per mutant/backend; Mesa 26.1+ on x86_64 untested (ubuntu-24.04 apt carries 25.2.8); no mutant in the catalogue targets NaN/subnormal handling.
**Effect on the verdict: none. The Lavapipe-primary recommendation stands; the arm64↔x86_64 gap for detection (C1) is closed. Confidence for C1 parity is now medium-high; the overall confidence stays as stated in §1.**
