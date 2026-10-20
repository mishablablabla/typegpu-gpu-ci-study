# Stage 3 — remaining vector / float `std` functions

> **Classification note (2026-10-16):** the team lead stated that numerical behaviour is *best effort*. Labels such as "defect" / "probable defect" below describe an observed CPU/GPU
> difference with an understood cause, **not** a violated guarantee. The current classification (expected semantics / folded-value error / codegen error / probable defect / API limitation / unconfirmed),
> upstream status and per-entry detail are in `../CPU_GPU_COMPATIBILITY_CHECKLIST.md` and `../FINAL_REPORT.md` (v2). The text below is kept unchanged as the original evidence record.


Machine/versions: Apple M3 Pro (Metal), typegpu 0.12.7, dawn.node 0.6.2. Rerun: `npx vitest run --config investigations/vector-fns/vitest.config.mts`
(4 files, 319 tests, 0 failed; rerun by the lead: identical). Raw numbers: `results.json` (`runtimeMatrix`, `edgeCases`, `specials`, `constFold`).
Provenance: the investigation was carried out by a separate workstream; this file was written by the lead from the workstream's report and `results.json`.
Items marked **[lead]** were re-verified independently by the lead; the rest is workstream-reported (the test suite that produces it passes).

## Summary
**No confirmed or probable TypeGPU defect found in this group.** Every function that has a CPU implementation matches exact semantics on the CPU and on the GPU
(round-half-even, floor/ceil/abs/sign/step/clamp/saturate/select/fract, lane and argument order of dot/cross/reflect/faceForward).

## Method
119 function × type combinations over f32 / vec2f / vec3f / vec4f, 193 897 rows. Three results per row: CPU (the `'use gpu'` function called as JS), GPU (compiled, raw-byte I/O),
independent oracle (f64, BigInt-exact dot/cross). Criteria: **exact** tier for functions whose semantics are exact; **spec or derived** bounds from the WGSL accuracy table
(the workstream read gpuweb `index.bs`) for the rest; inf/NaN are observations only. Constant-folded path (op called directly with captured constants) and targeted edge cases
(zero vectors, overflow of squared lengths, subnormals, ±0, round ties, clamp with min>max, step/smoothstep edges, fract of negative/large values, atan2(0,0)).
A deliberately wrong oracle is detected (the tests can fail).

| tier | elements | mismatches |
|---|---|---|
| GPU, exact semantics | 117 201 | 0 |
| GPU, spec/derived bounds | 77 181 | 0 violations |
| CPU, exact semantics | 76 734 | 0 |

## Findings table
| # | Classification | Operation / path | Minimal input → actual | Expected / basis | Impact, confidence |
|---|---|---|---|---|---|
| V1 | API limitation | CPU runtime of `round`, `saturate`, `step`, `fma`, `degrees`, `radians`, `tan` on vectors; `trunc` (scalar+vector); `faceForward`, `refract` | CPU throws "not implemented"; not folded; GPU result correct | contract: CPU implementation is missing (the error message says so) | calling them from plain JS fails loudly; no wrong value. `saturate` on vectors is implemented at repo HEAD (#3183, read only). High |
| V2 | Expected difference (driver) | `atan2` with a zero argument | `atan2(-1, -0)`: GPU +π/2, JS −π/2; `atan2(1, −1e-40)`: GPU −π/2 (subnormal flushed); `atan2(0,0)`: GPU NaN, CPU 0 **[lead: GPU values reproduced in hand-written WGSL, `raw-wgsl-atan2.mjs`]** | WGSL gives no value for `atan2` at the zero point / sign of zero; the difference is in Dawn/Metal, not TypeGPU | edge-case only; medium |
| V3 | Expected difference | `length` / `normalize` with huge or tiny components | `length(vec3f(1e20))`: GPU inf, CPU 1.7e20; `normalize(vec3f(1e-30))`: GPU inf, CPU 0.577 | f32 intermediate overflow / flush-to-zero are allowed by WGSL (Finite Math Assumption); CPU computes in f64. The same expression as a compile-time constant gives the CPU value, with runtime args the GPU value | high |
| V4 | Expected difference | `sinh`, `mix` | `sinh(1e-8)`: GPU 0; `sinh(89)`: GPU inf; `mix(1.5, 1.5, 2^24)`: CPU 1.5, GPU 2.0 | within the bounds derived from the spec formulas (`x·(1−t)+y·t` evaluated in f32) | low |
| V5 | Expected difference | sign of zero, subnormals | `sign(-0)`, `round(-0.5)` differ in sign; subnormal inputs are flushed on the GPU | WGSL does not specify the sign of zero here; flush-to-zero is permitted | low |
| V6 | Observation | zero vector / invalid domain | `normalize(vec3f(0))`: CPU throws (loud at resolve when constant); GPU NaN. `std.asin(2)`: scalar CPU NaN, vector CPU throws. Constant `clamp(5,10,0)` is folded and accepted, `clamp(x,10,0)` with runtime `x` is **rejected by Dawn** | WGSL: `normalize(0)` indeterminate; `clamp` with low > high is a shader-creation error for constants and indeterminate otherwise | the last one is the interesting inconsistency (folded constant accepted, runtime form rejected); contract unclear, low |

No regression test for a defect exists in this group because none was found; the suites above double as the reusable test bed.

## Not verified
f16 variants; other GPUs/backends; integer-vector `dot`; `acosh`/`asinh`/`atanh`; scalar-bool `select` on vectors; agreement of inf/NaN results (observation only, no criterion).
