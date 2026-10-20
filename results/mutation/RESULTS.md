# WS-MUT-RUN RESULTS — C1 detection power of Lavapipe vs SwiftShader (Metal as reference) on 50 seeded TypeGPU bugs

Date 2026-10-19/20. Machine-readable: `results.json` (+ `RESULTS.extra.json`). Per-test attribution: `ATTRIBUTION.md`. Facts / hypotheses / open items: `REPORT.md`. Harness: `harness/` (frozen after the BASE runs; sha in every `runs/*/run-info.txt`).
Labels: **DET** detected (value channel or pass->fail), **text** = only the generated-WGSL text differs (not counted), **miss**, **nr-f16** = "not run (f16)" (SwiftShader has no `shader-f16`; a test that caught the mutant elsewhere is skipped / f16-failing there), `*` = detection not stable across reruns. Green != correct, red != defect: a "detection" only means the suite output changed vs the unmutated run on the same backend.

## 1. Answer in numbers (50 mutants = catalogue M01..M50; tier 1 = 37, tier 2 = 13)

| pool | Lavapipe (arm64 docker) | SwiftShader (arm64 docker) | Metal (host, reference) |
|---|---|---|---|
| pre-existing pool only (13 example tests + 6 investigation suites + ported/diff suite = 1 875 tests) | DET 26 / text 5 / miss 19 | DET 25 / nr-f16 1 / text 5 / miss 19 | DET 26 / text 5 / miss 19 |
| + 14 own "mutation-run" tests (written because 10 mutants were unreachable by the pool) | **DET 36** / text 5 / miss 9 | **DET 34** / nr-f16 2 / text 5 / miss 9 | **DET 36** / text 5 / miss 9 |
| tier 1 only (37) | 28 | 27 (+M01 nr-f16) | 28 |
| tier 2 only (13) | 8 | 7 (+M21 nr-f16) | 8 |
| crashes / hangs (any pool, any run) | 0 | 0 | 0 |
| + WS-EX runner, all 97 docs examples (second pass; Metal only, 16 mutants chosen = those not DET above + canaries) | - | - | +3 (M20, M44, M32) = 39; M13 detection flaky -> not counted |
| same 3 mutants, 10-example subset on emulators | M20, M44, M32 all DET | M20, M44, M32 all DET | (full run above) |

* **Lavapipe vs SwiftShader**: the DET sets are identical except M01 and M21, both f16-only (Lavapipe DET, SwiftShader "not run (f16)"). No mutant is caught by SwiftShader and missed by Lavapipe. After excluding f16 the C1 difference is 0 mutants (rule in PLAN: a difference counts only if >=2 mutations and not explained by f16/feature gaps -> it does not count; raw difference = 2, both f16).
* **Exclusive catches** (pool1+own): none for Lavapipe, none for SwiftShader. Metal-only: **M35** (workgroup-barrier race; emulators run it text-only). Emulators-only (both Lavapipe and SwiftShader, not Metal): **M32** (guard `>` vs `>=`) on the pre-existing + own pool; Metal catches M32 only in the 97-example pass.
* 11 of 50 are caught by no GPU test anywhere: miss M02 M04 M05 M08 M11 M15 M16, text-only M06 M12 M13 M25 (all backends agree; reasons in section 6).
* Detection depth (tests that change per detected mutant): median ratio SwiftShader/Lavapipe = 1.0, min 0.43 (f16 tests absent), max 1.3 (M29: 10/13/14 tests L/S/M). Lavapipe/Metal median 1.0, min 0.71.

## 2. Setup actually used (verified, see REPORT.md)

* Mutated code is what runs: `typegpu`, `typegpu/{data,std,common,~internal,package.json}`, `@typegpu/{noise,sort,sdf,color,geometry}`, `tinyest` are aliased (vite) to `packages/*/src` of a per-run copy of the pristine snapshot `_shared/typegpu-HEAD` (HEAD e893ad11, version 0.12.7 + 31 commits) with the mutant patch applied (`patch -p1`); compiled by `unplugin-typegpu` (source files with the repo's own options `forceTgpuAlias:'tgpu', earlyPruning:false`; test files with PoC defaults). The npm build is not used. Checks: (a) canaries M24 (std.mix) and M26 (countLeadingZeros) DET on all 3 backends with changed WGSL text; (b) for all 324 mutant runs `repo.sha256` differs from BASE exactly in the patch's files; (c) 336/336 runs passed the backend identity assertion (Lavapipe: llvmpipe in vulkaninfo + mesa adapter, no SwiftShader; SwiftShader: `ss-tools/assert-backend.mjs` incl. no mesa/ICD; every test process additionally records its adapter: vendor mesa/llvmpipe f16=true, google/swiftshader f16=false, apple/metal-3).
* Fingerprints (generic, test-independent, `harness/fp-setup.ts`): value channel = sha256 over every GPU->CPU readback (`GPUBuffer.mapAsync(READ)`+`getMappedRange`) plus `__record` data of the example tests; timestamp-query resolve buffers excluded; `Math.random` re-seeded per test. Text channel = sha256 of every WGSL module passed to `createShaderModule`. 368-384 of the 1 875 tests perform no readback (their value channel is empty: they can only be detected by pass->fail).
* BASE (HEAD source, unmutated) run **twice per backend** with the final harness: 0 of 1 875 tests differ between the two runs in status, value fingerprint or WGSL text, on all three backends (so no test had to be excluded as non-deterministic in pool1/own). BASE: Lavapipe pass/fail/skip 1827/31/17, SwiftShader 1797/45/33, Metal 1856/2/17 (Phase-2 numbers reproduce: full suite 394/15/17 and 371/22/33; the 2 Metal failures are tests whose Phase-2 expectation (0.12.7) changed at HEAD: mul-paths N5, vector-fns CPU-impl list). BASE-failing tests stay in the pool (they can still change value fingerprint).
* Reruns: M07, M32, M35, M42 (the cases that first looked backend-specific) were run twice on every backend and pass; detections must hold in all repeats. Everything else: 1 run per (mutant, backend, pass).
* Pass 2 `own`: 14 tests in `pool-src/own/` (M03 unroll, M07 FLT_MAX literal, M17 reserved name, M19/M20/M21 layout round trips, M31 range loop, M36 atomicSub, M37 rg8unorm upload, M40 srgb, M41 sdf smooth union, M42 bitonic padding, M45 rotationY4). They are labelled as mine, written after seeing the catalogue (i.e. targeted at it), and listed separately everywhere (`pool1` vs `pool1+own`).
* Pass 3 `ex97` (WS-EX runner, 97 docs examples, 2 BASE repeats + 4 more, 1 repeat per mutant): Metal host only, 16 mutants (the 14 not caught on Metal + canaries M24, M38); on the emulators only a targeted 10-example subset for M20/M13/M44/M32 (BASE x2 and mutants in one container each, `runs-ex/ex97sub__*__r2`). Full 97-example runs of all mutants on the emulators were NOT done (26 / 46 min per run per backend, see REPORT).

## 3. Matrix (pool1 + own; ex97 column = second pass)

| mutant | tier | class | title | lavapipe | swiftshader | metal | #detecting tests L/S/M | pool1-only verdict L/S/M | ex97 second pass (97 docs examples) |
|---|---|---|---|---|---|---|---|---|---|
| M01 | 1 | gpu-value | f32->f16 bit conversion rounds half-up and double-rounds subnorm | DET | nr-f16 | DET | 6/0/6 | DET/nr-f16/DET | - |
| M02 | 1 | host-logic | Perlin dynamic cache never clears its dirty flag | miss | miss | miss | 0/0/0 | miss/miss/miss | Metal miss |
| M03 | 2 | wgsl-text | tgpu.unroll over a range ending at 0 is dropped | DET | DET | DET | 1/1/1 | miss/miss/miss | - |
| M04 | 2 | host-logic | withIndexBuffer ignores the element-count size argument | miss | miss | miss | 0/0/0 | miss/miss/miss | Metal miss |
| M05 | 1 | wgsl-text | isCloseTo for vectors emits "(lhs - lhs) + precision" (lhs evalu | miss | miss | miss | 0/0/0 | miss/miss/miss | Metal miss |
| M06 | 1 | host-logic | CPU std.saturate throws for float vectors | text | text | text | 0/0/0 | text/text/text | Metal miss |
| M07 | 2 | wgsl-text | Integer-valued literals >= 2^63 typed as abstractInt (FLT_MAX in | DET | DET | DET | 1/1/1 | DET/DET/DET | - |
| M08 | 1 | bytes-layout | Compiled writer leaves mat3x3f column padding unwritten | miss | miss | miss | 0/0/0 | miss/miss/miss | Metal miss |
| M09 | 1 | validation | Buffer allocations/transfers no longer padded to a multiple of 4 | DET | DET | DET | 14/6/14 | DET/DET/DET | - |
| M10 | 1 | validation | Non-finite comptime values are no longer rejected (Finite Math A | DET | DET | DET | 31/31/31 | DET/DET/DET | - |
| M11 | 1 | validation | Auto vertex output does not receive fragment-determined varying  | miss | miss | miss | 0/0/0 | miss/miss/miss | Metal miss |
| M12 | 2 | validation | withLocations treats location 0 as "no location" | text | text | text | 0/0/0 | text/text/text | Metal miss t59 |
| M13 | 1 | wgsl-text | Global identifier resolved inside a nested call can capture a ca | text | text | text | 0/0/0 | text/text/text | Metal miss* t3 ; L miss / S miss (10-ex subset) |
| M14 | 1 | gpu-value | Implicit conversion i32/u32 <-> abstractFloat picks i32/u32 (tru | DET | DET | DET | 1/1/1 | DET/DET/DET | - |
| M15 | 2 | host-logic | hasIndexBuffer is a constant false field | miss | miss | miss | 0/0/0 | miss/miss/miss | Metal miss |
| M16 | 2 | host-logic | Piping a configuration duplicates its bindings | miss | miss | miss | 0/0/0 | miss/miss/miss | Metal miss |
| M17 | 2 | wgsl-text | Generated identifiers may shadow WGSL template enumerants (read, | DET | DET | DET | 1/1/1 | miss/miss/miss | - |
| M18 | 1 | validation | Unary minus on u32 no longer rejected by TypeGPU | DET | DET | DET | 2/2/2 | DET/DET/DET | - |
| M19 | 1 | bytes-layout | Compiled writer uses unpadded element stride for arrays of vec3 | DET | DET | DET | 1/1/1 | miss/miss/miss | - |
| M20 | 1 | validation | Struct size loses trailing padding | miss | miss | miss | 0/0/0 | miss/miss/miss | Metal DET(18) ; L DET(6) / S DET(6) (10-ex subset) |
| M21 | 2 | bytes-layout | vec3<f16> alignment 4 instead of 8 | DET | nr-f16 | DET | 1/0/1 | miss/miss/miss | - |
| M22 | 1 | bytes-layout | mat3x3f columns written packed (36 bytes) by the compiled writer | DET | DET | DET | 7/7/7 | DET/DET/DET | - |
| M23 | 1 | bytes-layout | Compiled writer transposes matrices given as mat objects | DET | DET | DET | 17/17/17 | DET/DET/DET | - |
| M24 | 1 | gpu-value | std.mix emits mix(b, a, t) | DET | DET | DET | 26/26/26 | DET/DET/DET | Metal DET(36) t38 |
| M25 | 1 | gpu-value | std.faceForward emits faceForward(e1, e3, e2) | text | text | text | 0/0/0 | text/text/text | Metal miss |
| M26 | 1 | gpu-value | std.countLeadingZeros emits countTrailingZeros | DET | DET | DET | 19/19/19 | DET/DET/DET | - |
| M27 | 1 | gpu-value | std.extractBits emits (offset, count) swapped | DET | DET | DET | 16/16/16 | DET/DET/DET | - |
| M28 | 1 | gpu-value | CPU/comptime smoothstep has no clamp | DET | DET | DET | 9/9/9 | DET/DET/DET | - |
| M29 | 1 | gpu-value | CPU/comptime mod uses floored modulo | DET | DET | DET | 10/13/14 | DET/DET/DET | - |
| M30 | 1 | gpu-value | i32() cast saturates instead of wrapping | DET | DET | DET | 57/56/57 | DET/DET/DET | - |
| M31 | 2 | gpu-value | for-of over std.range runs one extra iteration | DET | DET | DET | 1/1/1 | miss/miss/miss | - |
| M32 | 1 | gpu-value | Guarded compute pipeline guard uses ">" instead of ">=" | DET | DET | text | 2/2/0 | DET/DET/text | Metal DET(5)* t29 ; L DET(2) / S DET(2) (10-ex subset) |
| M33 | 1 | gpu-value | dispatchThreads computes workgroup count with floor instead of c | DET | DET | DET | 965/953/965 | DET/DET/DET | - |
| M34 | 1 | gpu-value | Workgroup barrier removed from the prefix-scan up-sweep | DET | DET | DET | 2/2/2 | DET/DET/DET | - |
| M35 | 1 | gpu-value | Workgroup barrier removed between down-sweep and the final read | text | text | DET | 0/0/2 | text/text/DET | - |
| M36 | 2 | gpu-value | std.atomicSub emits atomicAdd | DET | DET | DET | 1/1/1 | miss/miss/miss | - |
| M37 | 1 | host-logic | rg* texture formats get the wrong bytes-per-texel (default 4) | DET | DET | DET | 1/1/1 | miss/miss/miss | - |
| M38 | 1 | gpu-value | u32To01F32 drops the lowest mantissa bit | DET | DET | DET | 2/2/2 | DET/DET/DET | Metal DET(18) t26 |
| M39 | 1 | gpu-value | GPU-side hash multiplier differs from the CPU one by one bit | DET | DET | DET | 4/4/4 | DET/DET/DET | - |
| M40 | 1 | gpu-value | srgbToLinear uses gamma 2.2 instead of 2.4 | DET | DET | DET | 1/1/1 | miss/miss/miss | - |
| M41 | 1 | gpu-value | opSmoothUnion blend term loses a factor h | DET | DET | DET | 1/1/1 | miss/miss/miss | - |
| M42 | 2 | gpu-value | Bitonic sort default paddingValue 0x7fffffff instead of 0xffffff | DET | DET | DET | 1/1/1 | miss/miss/miss | - |
| M43 | 1 | gpu-value | std.select emits select(t, f, cond) | DET | DET | DET | 25/25/25 | DET/DET/DET | - |
| M44 | 2 | host-logic | CPU .rgb swizzle returns (r, b, g) | miss | miss | miss | 0/0/0 | miss/miss/miss | Metal DET(1) ; L DET(1) / S DET(1) (10-ex subset) |
| M45 | 2 | gpu-value | rotationY4 WGSL sign error | DET | DET | DET | 3/3/3 | DET/DET/DET | - |
| M46 | 1 | gpu-value | std.insertBits emits the base value and the inserted bits swappe | DET | DET | DET | 16/16/16 | DET/DET/DET | - |
| M47 | 1 | gpu-value | std.firstLeadingBit emits firstTrailingBit | DET | DET | DET | 14/14/14 | DET/DET/DET | - |
| M48 | 1 | gpu-value | std.countTrailingZeros emits firstTrailingBit | DET | DET | DET | 14/14/14 | DET/DET/DET | - |
| M49 | 1 | gpu-value | std.dot4U8Packed emits dot4I8Packed | DET | DET | DET | 2/2/2 | DET/DET/DET | - |
| M50 | 1 | gpu-value | std.trunc emits floor | DET | DET | DET | 9/9/9 | DET/DET/DET | - |

Per-pool counts of mutants caught (Lavapipe / SwiftShader / Metal): ported+diff suite 10/9/9, own 12/11/12, 13 example tests 5/5/6, inv-bitops 10/10/10, inv-scalar-int 9/8/9, inv-vector-fns 6/6/6, inv-integer-mul 4/4/4, inv-mul-paths 3/3/3, inv-comptime 2/2/2 (a mutant can be caught by several pools). Mutants caught by exactly one pool (Lavapipe): ported+diff {M01 M09 M22 M23 M32}, own {M03 M17 M19 M21 M31 M36 M37 M40 M41 M42}, 13-example tests {M07 M34 M38 M39}, inv-bitops {M27 M46 M49}, inv-vector-fns {M28 M50}, inv-scalar-int {M14}. The pre-existing pool catches 26; the 14 own tests add 10 (`own` is the only catcher of M03 M17 M19 M31 M36 M37 M40 M41 M42 on both emulators, plus M21 on Lavapipe/Metal).

Per bug class (pool1+own, DET/total; Lavapipe / SwiftShader / Metal): gpu-value 25/24/25 of 27; bytes-layout 4/3/4 of 5; validation 3/3/3 of 6; wgsl-text 3/3/3 of 5; host-logic 1/1/1 of 7. By catalogue reach class: gpu-suite 23/23/23 of 25, docs-only 9/9/9 of 13, none 3/2/3 of 4, host-only 1/0/1 of 8.

## 4. Where the backends disagree, and why

| mutant | Lavapipe / SwiftShader / Metal | cause | evidence level |
|---|---|---|---|
| M01 (f32->f16 conversion) | DET / nr-f16 / DET | caught only by `diff/f16.diff` tests (6) that need `shader-f16`; they are skipped on SwiftShader | verified: SwiftShader BASE skips 33 tests (Lavapipe/Metal 17); the 6 detecting tests (`diff/f16` add/sub/mul vec2h/vec4h) are skipped or f16-failing there |
| M21 (vec3<f16> alignment) | DET / nr-f16 / DET | own test needs `shader-f16` (skipIf) | verified (skip in BASE) |
| M32 (guard `>`) | DET / DET / text (pool1+own); Metal DET in ex97 | out-of-bounds write policy: Lavapipe and SwiftShader **clamp** the index of an OOB storage write to the last element (thread 64 overwrote element 63 with 1128 instead of 1126), Metal **drops** it. step2/step3 tests then fail on the emulators only. | verified by probe `probes/oob-write.*.json` on all 3 backends |
| M35 (barrier removed) | text / text / DET | race manifests on real hardware (prefix-scan self-check + concurrent-chart fail), not on the software rasterisers; both emulators produce unchanged readbacks over 2 reps x 2 passes | outcome verified; the lock-step-execution explanation is a hypothesis |
| M29 (depth only) | 10/13/14 detecting tests L/S/M | not investigated (float edge cases differ per backend) | observation |

No disagreement is caused by NaN/denormal handling, limits or validation strictness in this data set. The only dimension where Lavapipe outperforms SwiftShader is f16; the only dimension where an emulator outperforms Metal is a memory-robustness policy (M32), and the only one where Metal outperforms both is hardware races (M35).

## 5. Text channel
Text-only mutants (identical readbacks, different WGSL): M06, M12, M13, M25 on all three backends; M35 on Lavapipe/SwiftShader; M32 on Metal (pool1+own). A mocked test comparing WGSL would see these; no GPU test does. M25 (`faceForward` argument order) is the only gpu-value mutant whose changed WGSL no suite exercises with arguments that make the result differ. 21 (Lavapipe, SwiftShader) / 20 (Metal) of 50 mutants change at least one generated WGSL text in pool1+own.

## 6. Mutants nobody caught (reasons are catalogue notes + observation)
M02 (Perlin dirty flag: output-equivalent by design), M04 (index-buffer size arg: no render test), M05 (isCloseTo text only), M08 (mat3 padding bytes: unobservable from shaders), M11/M12 (auto-vertex locations: no render pipeline with explicit fragment locations in any suite or the 97-example subset run), M13 (name capture: text only; its single Metal ex97 detection did not repeat), M15, M16 (host introspection), M06 (CPU saturate throws, suite tolerates it: only stats change), M25. M20 and M44 are missed by pool1+own on all backends but caught by the 97-example pass (struct tail padding -> GPU validation errors in 18 examples on Metal, 6 detections on the 10-example subset on each emulator; `simple/square` for the CPU `.rgb` swizzle) - so the example pass adds value for exactly the "docs-only" class.

## 7. Caveats
Single TypeGPU revision (HEAD e893ad11); one run per (mutant, backend, pass) except 4 mutants x2; BASE determinism measured with 2 repeats (3 backends) - a rarer non-determinism would not show; pool1+own are small and mostly integer/exact: C1 here measures "does this pool + backend notice", not general bug-finding power; own tests were written knowing the catalogue (selection bias, reported separately); ex97 is Metal-only for 16 mutants (full emulator example runs not done); detection != defect-finding value for users. WS-MOCK join (caught-only-on-GPU) is left to the lead: join `results.json` on mutant id.
