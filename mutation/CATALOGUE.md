# WS-MUT-CAT: catalogue of seeded TypeGPU bugs (mutants)

Purpose: measure the *detection power* of software-GPU backends (Lavapipe vs SwiftShader) in CI: which TypeGPU regressions does a GPU run catch that TypeGPU's mocked unit tests do not. Input for WS-MUT-RUN (GPU suites) and WS-MOCK (mocked unit tests).

- Base: `phase3/_shared/typegpu-HEAD/` (TypeGPU 0.12.7, HEAD e893ad11). Apply with `cd <copy of snapshot> && patch -p1 < patches/Mxx.patch`.
- Machine-readable data: `catalogue.json` (fields documented below). Every patch touches only `packages/*/src/**`.
- **50 mutants**: 18 historic (re-introduced real fixes) + 32 synthetic; tier 1 = 37 (run these first), tier 2 = 13 (lower information value / likely-equivalent / near-unreachable).
- Reach estimate (grep/reading only, nothing run): 37/50 mutants have at least one *named* suite or docs example that executes the changed path; 27/50 are reachable by a non-docs suite (13 example tests, 6 investigation suites, ported/, full suite); 13/50 have no named reach (host-only / equivalent / not exercised) and are the deliberate "limits" cases.
- Behaviour verification: 16 mutants were additionally checked by executing the affected pure-CPU code (unmutated vs mutated, `evidence/probe-diffs.json`); the rest are verified only by static reading (they change generated WGSL text or need a shader run).

## Table

| ID | T | kind | title | symptom | origin | expected reachable by | mock | sev | equiv | verified |
|---|---|---|---|---|---|---|---|---|---|---|
| M01 | 1 | hist | f32->f16 bit conversion rounds half-up and double-rounds subnormals | gpu-value | 36bc2e98 | - | likely | low | none | exec |
| M02 | 1 | hist | Perlin dynamic cache never clears its dirty flag | host-logic | a9437917 | docs:rendering/perlin-noise | unlikely | low | high | static |
| M03 | 2 | hist | tgpu.unroll over a range ending at 0 is dropped | wgsl-text | 7958b03c | - | likely | high | none | static |
| M04 | 2 | hist | withIndexBuffer ignores the element-count size argument | host-logic | fc85681e | - | likely | medium | none | static |
| M05 | 1 | hist | isCloseTo for vectors emits "(lhs - lhs) + precision" (lhs evaluated twice) | wgsl-text | 2854faaa | - | likely | low | high | static |
| M06 | 1 | hist | CPU std.saturate throws for float vectors | host-logic | 22205fff | inv:vector-fns | likely | low | high | exec |
| M07 | 2 | hist | Integer-valued literals >= 2^63 typed as abstractInt (FLT_MAX in oklab) | wgsl-text | 653d78e1 | docs:simple/oklab | unknown | low | high | static |
| M08 | 1 | hist | Compiled writer leaves mat3x3f column padding unwritten | bytes-layout | 8e86934b | - | likely | low | high | exec |
| M09 | 1 | hist | Buffer allocations/transfers no longer padded to a multiple of 4 bytes | validation | 346299f4 | ported:mix, ported:distance, ported:exp2 ... | likely | high | none | static |
| M10 | 1 | hist | Non-finite comptime values are no longer rejected (Finite Math Assumption) | validation | e578a20b | inv:comptime, inv:scalar-int, inv:vector-fns | likely | medium | low | exec |
| M11 | 1 | hist | Auto vertex output does not receive fragment-determined varying locations | validation | a667a3ac | docs:*shell-less vertex+fragment pairs with explicit d.location (not identified) | likely | medium | medium | static |
| M12 | 2 | hist | withLocations treats location 0 as "no location" | validation | 8af3495f | docs:*shell-less pairs whose fragment pins location 0 (not identified) | likely | medium | medium | exec |
| M13 | 1 | hist | Global identifier resolved inside a nested call can capture a caller-local name | wgsl-text | b261e744 | docs:*examples with nested helper calls and local/global name collisions (not identified) | likely | high | medium | static |
| M14 | 1 | hist | Implicit conversion i32/u32 <-> abstractFloat picks i32/u32 (truncates the float) | gpu-value | c96d9d48 | inv:mul-paths, inv:scalar-int, docs:*examples mixing integer variables with fractional literals | likely | high | low | exec |
| M15 | 2 | hist | hasIndexBuffer is a constant false field | host-logic | 7cb1d127 | - | likely | low | high | static |
| M16 | 2 | hist | Piping a configuration duplicates its bindings | host-logic | d75039ea | - | likely | low | high | static |
| M17 | 2 | hist | Generated identifiers may shadow WGSL template enumerants (read, write, uniform, rgba8unorm...) | wgsl-text | efe89a0e | docs:image-processing/monocular-light-injection | likely | medium | medium | static |
| M18 | 1 | hist | Unary minus on u32 no longer rejected by TypeGPU | validation | 57f36020 | inv:scalar-int | likely | medium | low | static |
| M19 | 1 | synt | Compiled writer uses unpadded element stride for arrays of vec3 | bytes-layout | synthetic | docs:algorithms/jump-flood-distance, docs:algorithms/probability, docs:simple/liquid-glass ... | likely | high | none | exec |
| M20 | 1 | synt | Struct size loses trailing padding | validation | synthetic | ex13:log-test, docs:*most examples with uniform/storage structs mixing vec/mat and scalars | likely | high | low | exec |
| M21 | 2 | synt | vec3<f16> alignment 4 instead of 8 | bytes-layout | synthetic | - | likely | medium | high | exec |
| M22 | 1 | synt | mat3x3f columns written packed (36 bytes) by the compiled writer | bytes-layout | synthetic | ported:auto/mul, ported:auto/add, ported:auto/sub ... | likely | high | none | exec |
| M23 | 1 | synt | Compiled writer transposes matrices given as mat objects | bytes-layout | synthetic | ported:auto/mul, ported:auto/add, ported:auto/sub ... | likely | high | low | exec |
| M24 | 1 | synt | std.mix emits mix(b, a, t) | gpu-value | synthetic | ported:mix, inv:vector-fns, inv:integer-mul ... | likely | high | none | static |
| M25 | 1 | synt | std.faceForward emits faceForward(e1, e3, e2) | gpu-value | synthetic | inv:vector-fns | unlikely | medium | low | static |
| M26 | 1 | synt | std.countLeadingZeros emits countTrailingZeros | gpu-value | synthetic | inv:bitops, inv:scalar-int | unlikely | high | none | static |
| M27 | 1 | synt | std.extractBits emits (offset, count) swapped | gpu-value | synthetic | inv:bitops | unlikely | high | low | static |
| M28 | 1 | synt | CPU/comptime smoothstep has no clamp | gpu-value | synthetic | inv:vector-fns | likely | medium | none | exec |
| M29 | 1 | synt | CPU/comptime mod uses floored modulo | gpu-value | synthetic | inv:scalar-int | likely | medium | low | exec |
| M30 | 1 | synt | i32() cast saturates instead of wrapping | gpu-value | synthetic | inv:scalar-int, inv:comptime | likely | medium | low | exec |
| M31 | 2 | synt | for-of over std.range runs one extra iteration | gpu-value | synthetic | docs:simple/liquid-glass, docs:simulation/stable-fluid, docs:rendering/clouds ... | likely | high | none | static |
| M32 | 1 | synt | Guarded compute pipeline guard uses ">" instead of ">=" | gpu-value | synthetic | ex13:dispatch, ex13:log-test, docs:*~66 dispatchThreads users | likely | high | none | static |
| M33 | 1 | synt | dispatchThreads computes workgroup count with floor instead of ceil | gpu-value | synthetic | ex13:dispatch, ex13:log-test, docs:*~66 dispatchThreads users | likely | high | none | static |
| M34 | 1 | synt | Workgroup barrier removed from the prefix-scan up-sweep | gpu-value | synthetic | ex13:prefix-scan, ex13:concurrent-chart, docs:tests/prefix-scan | unlikely | high | low | static |
| M35 | 1 | synt | Workgroup barrier removed between down-sweep and the final read | gpu-value | synthetic | ex13:prefix-scan, ex13:concurrent-chart, docs:tests/prefix-scan | unlikely | high | low | static |
| M36 | 2 | synt | std.atomicSub emits atomicAdd | gpu-value | synthetic | docs:simulation/fluid-with-atomics | likely | high | none | static |
| M37 | 1 | synt | rg* texture formats get the wrong bytes-per-texel (default 4) | host-logic | synthetic | docs:tests/texture-write, docs:tests/texture-write-3d, docs:tests/texture-compose | likely | medium | none | exec |
| M38 | 1 | synt | u32To01F32 drops the lowest mantissa bit | gpu-value | synthetic | ex13:probability, ex13:prng-cpu-gpu, ex13:bitonic-sort ... | likely | low | none | static |
| M39 | 1 | synt | GPU-side hash multiplier differs from the CPU one by one bit | gpu-value | synthetic | ex13:prng-cpu-gpu, ex13:probability, docs:tests/uniformity | likely | medium | none | static |
| M40 | 1 | synt | srgbToLinear uses gamma 2.2 instead of 2.4 | gpu-value | synthetic | docs:rendering/box-raytracing, docs:simple/oklab | unlikely | low | none | static |
| M41 | 1 | synt | opSmoothUnion blend term loses a factor h | gpu-value | synthetic | docs:tests/sdf-docs-examples, docs:simple/ripple-cube | likely | medium | none | static |
| M42 | 2 | synt | Bitonic sort default paddingValue 0x7fffffff instead of 0xffffffff | gpu-value | synthetic | - | unlikely | medium | high | static |
| M43 | 1 | synt | std.select emits select(t, f, cond) | gpu-value | synthetic | inv:bitops, inv:vector-fns, inv:scalar-int ... | likely | high | none | static |
| M44 | 2 | synt | CPU .rgb swizzle returns (r, b, g) | host-logic | synthetic | docs:*examples using .rgb on comptime/CPU vectors (few) | unknown | medium | low | exec |
| M45 | 2 | synt | rotationY4 WGSL sign error | gpu-value | synthetic | docs:rendering/3d-fish | likely | medium | none | static |
| M46 | 1 | synt | std.insertBits emits the base value and the inserted bits swapped | gpu-value | synthetic | inv:bitops, inv:scalar-int, ported:semantics | unlikely | high | low | static |
| M47 | 1 | synt | std.firstLeadingBit emits firstTrailingBit | gpu-value | synthetic | inv:bitops, inv:scalar-int | unlikely | high | low | static |
| M48 | 1 | synt | std.countTrailingZeros emits firstTrailingBit | gpu-value | synthetic | inv:bitops, inv:scalar-int | unlikely | high | medium | static |
| M49 | 1 | synt | std.dot4U8Packed emits dot4I8Packed | gpu-value | synthetic | inv:bitops, inv:scalar-int | unlikely | high | low | static |
| M50 | 1 | synt | std.trunc emits floor | gpu-value | synthetic | inv:vector-fns, ported:semantics | unlikely | medium | low | static |

## Fields of catalogue.json

`id`, `title`, `kind` (historic|synthetic), `source_commit` (full hash, historic only) + `source_subject`, `files[]`, `description`, `symptom_class` (gpu-value | bytes-layout | wgsl-text | host-logic | validation), `expected_reachable_by[]` (suite vocabulary below), `mock_catchable_guess` (likely|unlikely|unknown), `severity_guess`, `notes`, plus extras: `tier`, `behavior_change_confidence`, `equivalence_risk` (chance the mutant is output-equivalent on the tested inputs), `reach_class` (gpu-suite|docs-only|host-only|none), `backend_note`, `adapted_from_fix` (how the historic fix was reversed), `behavior_verification`, `patch`.

Suite vocabulary: `ex13:<test>` = TypeGPU docs-example tests in swiftshader/typegpu-examples; `inv:<name>` = bitops, comptime, integer-mul, mul-paths, scalar-int, vector-fns; `ported:<file>` = ported/*.gpu.test.ts (std functions via harness.ts, runtime buffers); `full:<name>` = lib/diff suites of the full run; `docs:<dir>` = one docs example (apps/typegpu-docs/src/examples/<dir>); `docs:*...` = a class of docs examples that could not be pinned to a directory.

## Method

1. **Historic (18)**: `git --no-optional-locks log` over packages/typegpu/src, typegpu-noise/sort/sdf/color (all `fix:` commits, plus keyword greps for layout/offset/align/matrix/f16/atomic/bitcast/overflow/clamp/loop/struct/texture/pack), read the diff of ~45 candidates, kept those whose fix is still present in the snapshot and whose reversal is small and local; each fix was reversed by hand against the HEAD code (moved code adapted; partial reversals documented in `adapted_from_fix`). Commit hash + subject are recorded.
2. **Synthetic (32)**: classic shader-library bug classes placed in code that exists at HEAD: struct/array layout, matrix writer column/row mix-ups, argument-order swaps in std codegen, copy-paste builtin mapping bugs (countLeadingZeros->ctz, atomicSub->atomicAdd, trunc->floor, ...), comptime/CPU numeric semantics (smoothstep clamp, floored mod, saturating i32), dispatch/guard off-by-one and ceil/floor, workgroup barriers in the scan, texture texel size, PRNG/noise/colour/SDF constants, default values, swizzle mapping.
3. **Verification**: every patch (a) is a `diff -u` with a/ b/ prefixes against the snapshot, (b) `patch -p1 --dry-run` + apply + revert on a fresh `cp -R` of the snapshot (tools/verify.sh), (c) touches only `packages/*/src/**`, (d) passes a TypeScript syntax check (node `stripTypeScriptTypes`), (e) leaves the tree byte-identical after revert. Type-checking (tsc) was NOT run (no installs allowed): a few patches leave an unused import/helper behind (M05, M13, M17).
4. **Reachability** was estimated by grep/reading: tests/examples that call the changed function with *runtime* arguments (harness.ts feeds buffers, so the GPU path is taken) vs *comptime* arguments (folded by the CPU `normalImpl` into a literal), docs-example tests in swiftshader/typegpu-examples, the investigation suites' spec tables (specs.ts, ops.ts, const-bodies.ts), and which docs examples use the changed API. Mock-catchability was estimated by grepping TypeGPU's own tests (packages/typegpu/tests, packages/typegpu-sdf/tests, apps/typegpu-docs/tests/individual-example-tests) for the changed construct (WGSL snapshots, test files of the std function, the fix's regression test).

## Honesty: what is verified and what is a guess

- **Verified (mechanical)**: all patches apply cleanly, touch only src files, are syntactically valid, are reversible. Source commits (hash, subject) exist in the local TypeGPU git history.
- **Verified (executed, CPU only)**: 16 mutants change observable behaviour of pure-CPU code (see `evidence/probe-diffs.json`: before/after values for e.g. f16 tie rounding, mat3x3f byte layout, struct sizes, mod/i32/smoothstep semantics, implicit-conversion unification).
- **Static only**: all WGSL-text mutants (codegen argument swaps, loop bounds, barriers, guards, rotation matrix text) and all runtime-GPU effects. The claim "changes GPU values" there rests on reading the generated-code path; a shader run (WS-MUT-RUN) is the real test.
- **Guesses**: `expected_reachable_by` (grep-based; a suite may still not hit the exact value that exposes the bug), `mock_catchable_guess` (grep-based; WS-MOCK will measure it), `severity_guess`, `equivalence_risk`.
- **Known weak mutants** (kept on purpose or tier 2): M05, M06, M08, M15, M16 (GPU-blind by construction, host/text only); M02, M42 (output-equivalent on the tested inputs); M07 (probably typing-only, output-equivalent); M03, M04, M21 (no suite or example reaches them); M11, M12, M13, M17, M44 (needs specific name/location configurations; docs reach not pinned down); M12 is an *adapted* regression (HEAD reserves `locations` values, so the old falsy check misbehaves differently than in the original pre-fix code).
- **Backend-differentiating by design**: M09 and M01 (and M21) matter only where `shader-f16` exists (Lavapipe, Metal) - SwiftShader skips those tests; M34/M35 are races that deterministic emulators expose differently from lock-step hardware.
- Mutants are applied to `packages/*/src`; whether a GPU suite imports TypeGPU from src or from a built `dist` is the runner's concern (the suites in webgpu-poc import the npm build 0.12.7).
