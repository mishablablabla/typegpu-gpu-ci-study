> Paths in this document refer to the original working tree. See [docs/INDEX.md](../INDEX.md) for the mapping to this repository.

# Lavapipe vs SwiftShader for running GPU tests in CI — comparison report (second round)

Date: 2026-10-19. Extends `FINAL_REPORT.md` (first round: acquisition, oracle dumps A–D/L, extended CTS, performance probes). Frozen Phase 1 tree untouched (`frozen-tree-check.txt`). TypeGPU checkout read-only (no change, nothing pushed). Facts vs interpretations are labelled.

## 1. Short answer

Both backends run TypeGPU's real GPU code through the unchanged dawn.node path, are reproducible, and agree on everything CTS-defined (same lane categories, 0 CTS failures, same TypeGPU docs-example results for all integer / self-checking outputs). They differ in **capability** (SwiftShader has no `shader-f16`), in **numerics outside the CTS-constrained set** (each has a few functions where it is the less accurate one), and in **setup/pinning route**.

Evidence-based recommendation (my interpretation; limits in §8):
- **Primary CI backend: Lavapipe** — `apt` install, `shader-f16` available (SwiftShader: none; 476 of 1 162 CTS cases skipped, group E and 15+ TypeGPU tests not runnable), widest test coverage, already characterised in Phase 1; can be pinned as rigidly as SwiftShader (§5).
- **Secondary / cross-check backend: SwiftShader** — an independent software implementation with *bit-identical output across runs and across CPU models* (no NaN-sign wobble), exact `mod`, stricter asin/acos; useful to separate "backend quirk" from "TypeGPU issue", not as a replacement.
- **Neither reproduces Metal-specific behaviour** that TypeGPU users can hit (e.g. the silent wrong integer quotient on Metal, `scalar-int` suite): both are exact there. A software backend in CI complements, not replaces, tests on real GPUs.

## 2. What was run (all raw artifacts kept; native = GitHub `ubuntu-24.04` x86_64, EPYC 7763 / 9V45 / 9V74)

| family | what | configs | location |
|---|---|---|---|
| WebGPU CTS (1 162 cases, 23 original spec files + grid) | pass / warn / skip / fail accounting | Lavapipe arm64 + x64 (Phase 1); SwiftShader arm64 ×2, x64 ×4 | `cts/`, `FINAL_REPORT.md` §D |
| Oracle dumps A, B, C, D, L (195 210 lanes) | frozen evaluator, per-lane comparison | SwiftShader arm64 ×3, x64 ×8; Lavapipe frozen + 10 new arm64 repeats | `raw/`, `lavapipe-repeats/` |
| Full Phase-1 conformance suite (426 tests, TypeGPU std ported tests + diff suite) | `scripts/run.mjs` in container | SwiftShader arm64 ×2, x64 ×2 (2 CPUs); Lavapipe arm64 ×2 (Phase 1) + x64 ×2 (CI) | `conformance/`, `native-x64/run-3928705*/…/conformance` |
| Six investigation suites (1 433 tests: bitops, vector-fns, mul-paths, scalar-int, integer-mul, comptime) | previously Metal-only | Metal ×1, Lavapipe arm64/x64, SwiftShader arm64/x64 | `investigations-suites/`, `native-x64/` |
| **Real TypeGPU docs examples (13 tests on 13 examples)** | vendored unmodified copies + thin Node shim, headless, results recorded | Metal ×1, Lavapipe + SwiftShader arm64 ×2 and x64 ×2 (2 CPUs) | `typegpu-examples/`, `typegpu-example-runs/` |
| Pinned Lavapipe | digest + Ubuntu snapshot, version asserts | arm64 local, amd64 CI ×2 | `pinned-lavapipe/`, `docker-swiftshader/Dockerfile.lavapipe-pinned` |

Examples used (from `apps/typegpu-docs/src/examples`, HEAD `e893ad11`, copied not modified; hashes in `typegpu-examples/vendor/SHA256SUMS`): increment, tgsl-parsing-test, dispatch, matrix-multiplication, matrix-next (3 strategies), prng-cpu-gpu, probability (13 distributions × 1 000 samples), prefix-scan (incl. 16.7 M-element cases), concurrent-chart, bitonic-sort (3 orders), mnist-inference (subgroup + default path), log-test (shader `console.log`), jump-flood-voronoi (rendered pixels). Not run: game-of-life (an unexplained mismatch between tiled/bitpacked strategies on Metal itself — a harness lead, not a backend finding), render-only / DOM / three.js / React examples (out of scope for compute-result comparison).

## 3. Results matrix

| family | Lavapipe arm64 | SwiftShader arm64 | Lavapipe x64 | SwiftShader x64 |
|---|---|---|---|---|
| CTS 1 162 cases | 1 162 pass | 686 pass / **476 skip (all `shader-f16`)** / 0 fail | 1 162 pass | 686 / 476 / 0 (4 runs, 3 CPUs) |
| Dump lane categories A–D, L | = | **identical to Lavapipe**, `rejected = 0` | = | identical |
| Full suite (426 tests) pass / fail / skip | 394 / 15 / 17 | 371 / 22 / 33 | 394 / 15 / 17 | **359 / 34 / 33** (both CPUs identical) |
| Investigation suites (1 433), failures vs Metal-calibrated expectations | 14 | 21 | 14 | 19 |
| TypeGPU docs examples (13) | 13/13 pass | 13/13 | 13/13 | 13/13 |
| Same results run 1 vs run 2 | yes | yes | yes | yes |

Metal (local) passes all 1 433 investigation tests and all 13 examples — those expectations were calibrated on Metal, so a failure elsewhere means "differs from Metal's behaviour", not "defect".

### 3.1 Full suite, what the extra SwiftShader failures are (`compare/full-conformance-*.json`)
- 15 pass→skip: f16 tests skip (no `shader-f16`).
- **11 pass→fail are f16 in mixed tests** (`mul vec2/3/4`, `div vecNh`, `mod vecNh/…`): the test mixes f16 with f32 without guarding on `hasF16`, TypeGPU emits f16, the dispatch silently yields zeros (`expected [+0,+0] to deeply equal [15,24]`). Capability effect, not numerics — also a **silent-failure hazard**: with `shader-f16` absent the result is zero without an error.
- **2 real behavioural differences:** `log(0)` → −88.03 and `log2(0)` → −127 on SwiftShader (tests assert −inf; CTS leaves these inputs unconstrained).
- 5 fail→pass: `mod` f32 diff tests (4) and `pow` exponent-one — SwiftShader's `mod` is exact where Lavapipe's is approximate. 1 fail→skip (f16).
- **x64 only, +12 failures** (`min/max/neg` f32/vec): the Subzero build flushes subnormal operands (`min(0, −1e-40)` → −0, `neg(1e-40)` → −0). The harness's strict "return one operand exactly" policy flags it; the CTS accepts flushing (CTS passes). Same subnormal-flush pattern as Metal.

### 3.2 Investigation suites (Metal-calibrated expectations)
- Lavapipe-only failures: `asin`/`acos` f32/vecN (8 tests; e.g. `asin(−0.5)` = −0.52339 vs exact −0.52360, error 2.1e-4 vs the WGSL bound 6.8e-5; 138 lanes) — **Lavapipe's asin/acos exceed the accuracy bound; SwiftShader's do not**; `mul-paths` N8 (f32 overflow in a sum of products gives inf/NaN).
- SwiftShader-only failures: `fract` (4) / `mix`·`mix_s` (13) exact-semantics (e.g. `fract(−1e-30)` = 0.99999994 vs 1.0; `mix(1, 0.49999997, 1)` = 0.5 vs 0.49999997 — a different formula, allowed by the spec's inherited accuracy), int→f32 conversion not always round-to-nearest (96 rows, still one of the two neighbouring f32), plus one bitops API-matrix case that is an f16 argument.
- Shared (differ from Metal on both): length/normalize/atan2 constant-expression observations and overflow/underflow intermediates; **the scalar-int "silent wrong integer quotient" is not reproduced on either software backend** (count 0), i.e. a TypeGPU integer-division issue visible on Metal stays hidden on both.
- `integer-mul` (73) and `comptime` (69): pass everywhere.

### 3.3 TypeGPU docs examples (`compare/examples-*.json`)
- All integer / boolean / self-checking outputs are **identical on all backends and architectures**: increment, tgsl-parsing-test, dispatch, matrix-multiplication (= JS reference), matrix-next (gpu-optimized / gpu-simple = cpu strategy), prng-cpu-gpu table, bitonic-sort (sorted permutation for 3 orders, same hash), concurrent-chart, prefix-scan (all cases "Tests succeeded."), log-test (shader `console.log` captured identically), jump-flood-voronoi (identical pixels).
- Float outputs differ between any two backends: `probability` samples (13 distributions; max ≈ 3 100–5 200 ULP in sin/cos/log-based generators; no NaN mismatch) — **statistical equivalence, not bit-equality**; `mnist-inference` logits differ by ≤ 0.02 with the default path (Lavapipe takes the f16 path because it has `shader-f16`, SwiftShader does not), ≤ 6e-6 with `shader-f16` hidden on both; **argmax identical everywhere**.
- Runtime on CPU backends: prefix-scan with 16.7 M elements passes everywhere: arm64 Lavapipe 3.7–3.8 s, SwiftShader 5.5–5.6 s; x64 Lavapipe 4.5–9 s, SwiftShader 9–18 s (depends on the CPU model); Metal 3.5 s (n = 2, indicative).

## 4. Determinism and repeatability (facts)
- SwiftShader: GPU dumps byte-identical across all runs per architecture (arm64 ×3; x64 ×8 on 3 CPU models); examples ×2 identical (only timing fields differ).
- Lavapipe: arm64 repeats identical (new ×2 per group; A/B differ from the Phase 1 files only by the later-added `unsupported` field); on x86_64 **NaN signs vary between runs even on the same CPU** (Phase 1; seen again: 1 lane in group C, pinned vs unpinned run on one runner) — SwiftShader showed none on the GPU side.
- Cross-architecture: SwiftShader arm64 (LLVM 16) vs x64 (Subzero) differ (flush, transcendental last bits); Lavapipe arm64 vs x64 differ only in NaN sign (Phase 1). Attribution of SwiftShader's arch differences to the JIT backend is an inference (§8).

## 5. Setup, pinning and cost

| | Lavapipe | SwiftShader |
|---|---|---|
| obtain | `apt-get install mesa-vulkan-drivers libvulkan1 vulkan-tools` | extract 2 files from Debian `chromium-common` .deb (31–36 MB), `VK_DRIVER_FILES`; no package, upstream has no releases |
| runtime provenance | Mesa 25.2.8 + LLVM 20.1.2 (Ubuntu) | "SwiftShader vendored by Chromium M155" (LLVM 16 on arm64, Subzero on x64); revision not exposed |
| pin | **tested**: base image by digest + `snapshot.ubuntu.com` + version asserts → identical package versions and identical dumps on arm64 and amd64 (`Dockerfile.lavapipe-pinned`) | URL on snapshot.debian.org + sha256 (verified in CI) |
| pin risks | depends on snapshot.ubuntu.com availability (outages reported by a third party; retention unspecified); without a snapshot, old versions disappear from the archive within days–months | depends on snapshot.debian.org; revision tied to the Chromium build you choose |
| isolation needed | none (default ICD) — but the harness cannot tell Lavapipe from SwiftShader unless Mesa is absent in the SwiftShader image | image without Mesa + assertions (done) |
| CI time (native, 2 vCPU) | 9 images built in 157–167 s (cold) | included |
| test wall (x64, n = 1 each, not interleaved) | investigation suites 71 s (EPYC 9V45) / 128 s (EPYC 7763) total | 53 s / 79 s total |
| compile cost | cheap pipeline creation (≈1–2 ms), lazy at first submit | 3–8× slower pipeline creation, faster first submit; many-small-shader suites ran ≈1.1–2.2× faster on x64, ≈1.2–2.2× slower on arm64 (n = 1 per config, different CPUs, not interleaved) |
| steady dispatch (interleaved, first round + arm64 re-run) | baseline | ≈1× at 30 k invocations, 1.3–2.4× slower at 262 k–1 M on arm64; ≈4× at 30 k on x64 |
| memory (raw probe, max RSS) | ≈170–225 MB | ≈120–185 MB |

## 6. Which backend finds what (practical value for TypeGPU CI)
- Both catch TypeGPU std behaviour that the mocked unit tests cannot see: wrong values, validation errors, feature gaps (f16), invalid WGSL.
- Lavapipe-only catch: `asin`/`acos` outside the WGSL bound, f32-overflow-to-inf in long dot sums (these are Lavapipe quirks, not TypeGPU issues — relevant when deciding what to assert).
- SwiftShader-only catch: f16-unguarded tests (silently zero), `log(0)`/`log2(0)` expectations, exact-select `min/max/neg` with subnormals (Subzero), `fract`/`mix` formula expectations.
- A TypeGPU test suite that wants to run on a software backend should: guard f16 on `hasF16` (zeros are silent), avoid asserting out-of-domain/NaN/inf/subnormal results, compare floats with tolerances (not bit-equality) across backends, and avoid assertions calibrated on one backend's exact rounding.

## 7. Recommendations
- **Controlled CI proof of concept (supported by evidence):** a job running on Lavapipe (pinned by digest + snapshot) that executes the 13 example tests + the CTS subset + selected std tests; and an optional SwiftShader job as a second opinion (pinned .deb + sha256) running the same set; compare by category / tolerance, not bits.
- **Immediate experimentation:** extend `typegpu-examples/` with more examples (`game-of-life` after the Metal discrepancy is explained), port `typegpu-sdf`/`packing`/`bitcast`/atomics tests (workstream-2 list in the session notes: packing, bitcast, boolean family, layout round-trips, atomics are highest value, mostly integer-exact and backend-insensitive).
- **Requires additional evidence:** TypeGPU texture/sampling/atomics-heavy examples on both backends; `shader-f16` coverage on SwiftShader (needs a different build — currently none); LLVM-backend on x64 / Subzero on arm64 to separate arch from JIT backend; longer-run flake rate in real CI history.
- **Not recommended:** SwiftShader as the only backend (no f16); asserting bit-equality across backends/architectures; treating a software backend as proof of correct behaviour on Metal/D3D/hardware Vulkan.

## 8. Limitations and confidence
- Single TypeGPU revision (`e893ad11` for the vendored examples; PoC runs typegpu 0.12.7 from npm — 31 commits behind HEAD; everything run still worked on 0.12.7).
- 13 examples of ≈97 (compute-capable subset); render-only, DOM, three.js, React examples not run; game-of-life not explained.
- Examples ×2 per config, suites ×1 per config (arm64 Lavapipe/SwiftShader suites ×1 valid + failed attempts kept); timings not interleaved except the dedicated perf probes.
- SwiftShader is one Chromium-vendored revision per architecture; Lavapipe one Mesa/LLVM version. Cross-arch SwiftShader differences conflate architecture with JIT backend.
- x86_64 steady-state perf at large N not re-measured after the crash fix (first-round x64 ratios at N = 30 000 stand).
- Confidence: high for pass/fail tables and byte-identity claims (artifacts, repeated runs); medium for "who is less accurate where" (observed on harness/suite inputs only); low–medium for the recommendation (a judgement from this evidence set, not a measured preference).

## 9. Failed/invalid attempts kept
`investigations-suites/swiftshader-arm64-run1` (tool bug: assert inputs missing), `…/lavapipe-arm64-run1` (valid, first script version), `…-run2` (shell-expansion bug, `INVALID.md`); `perf/` first-round crash files (GC bug, corrected); CI status display `queued` long after completion (artifacts used). Raw CI artifacts: `native-x64/run-39287055008` (EPYC 7763), `run-39287075791` (EPYC 9V45).

## 10. Reproduction
```bash
cd <poc>; S=investigations/backend-diff/swiftshader
# images: oracle-ext (both backends) as in FINAL_REPORT §H, then derived images
docker build --build-arg BASE=webgpu-poc-oracle-ext -f docker-swiftshader/Dockerfile.ex  -t webgpu-poc-ex-lavapipe:arm64 .     # frozen Lavapipe image as BASE
docker build --build-arg BASE=webgpu-poc-swiftshader-oracle-ext:arm64 -f docker-swiftshader/Dockerfile.ex -t webgpu-poc-ex-swiftshader:arm64 .
BACKEND=lavapipe   OUT=$S/typegpu-example-runs/lavapipe-arm64-run<N>   docker-swiftshader/run-ex.sh webgpu-poc-ex-lavapipe:arm64
BACKEND=swiftshader OUT=$S/typegpu-example-runs/swiftshader-arm64-run<N> docker-swiftshader/run-ex.sh webgpu-poc-ex-swiftshader:arm64
node $S/tools/compare-examples.mjs <runA> <runB> <labelA> <labelB> <out.json>
# investigation suites: Dockerfile.inv + run-inv.sh + tools/compare-suites.mjs ; full suite: Dockerfile.full + run-full.sh + tools/compare-full.mjs
# Metal (local, isolated copy because suites write into their directories): see investigations-suites/metal-run1/host-command.txt ; examples: cd $S/typegpu-examples && EX_OUT=<dir> npx vitest run -c vitest.config.mts
# native x86_64: workflow backend-compare-x64.yml (manual) in the private staging repo; artifacts under $S/native-x64/
# pinned Lavapipe: docker build -f docker-swiftshader/Dockerfile.lavapipe-pinned -t webgpu-poc-lavapipe-pinned-oracle-ext:arm64 .
```
