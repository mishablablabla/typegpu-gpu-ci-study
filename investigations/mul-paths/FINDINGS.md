# STAGE 4 - alternative multiplication paths (typegpu 0.12.7, Apple M3 Pro / Metal via dawn.node)

> **Classification note (2026-10-16):** the team lead stated that numerical behaviour is *best effort*. Labels such as "defect" / "probable defect" below describe an observed CPU/GPU
> difference with an understood cause, **not** a violated guarantee. The current classification (expected semantics / folded-value error / codegen error / probable defect / API limitation / unconfirmed),
> upstream status and per-entry detail are in `../CPU_GPU_COMPATIBILITY_CHECKLIST.md` and `../FINAL_REPORT.md` (v2). The text below is kept unchanged as the original evidence record.


Rerun everything (PoC root): `npx vitest run --config investigations/mul-paths/vitest.config.mts`
Result of the last run: 4 files, **271 passed | 89 expected-fail (it.fails) = 360 tests, 0 failed** (deterministic, run 2x). Raw numbers: `results.json`.

## Summary
* Float paths (all matrix/vector/scalar products, `std.mul`, `*`, `.mul()`, `*=`, constant-folded, `translate4`/`scale4`/`rotate*4`, matrix constructors, `mix`, `dot`, `+ - += -=`): **no CPU-vs-GPU defect found**. Column-major order, mat3x3 padding, mat*vec / vec*mat lane order, orientation all agree with the independent f64 oracle.
* Defect #1 (int multiply via f64) is shared by **every** integer multiplication path that goes through `cpuMul` (all of `std.mul`, `*`, `.mul()`, `*=`, scalar-on-either-side, and the constant-folded forms). `*=` is defective **only on the CPU** (the GPU emits raw `x *= y`, never folded). `std.dot` shares the f64-sum idea (see F4). `std.add`/`std.sub`/`+=`/`-=`/`std.neg` are NOT affected although `std.sub` calls `cpuMul(-1, rhs)` (|product| <= 2^32).
* **New:** F1 (CPU evaluates the left-hand side of every compound assignment twice), F2 (iN/uN vector * float scalar), F3 (compound assignment with mixed-type scalar emits invalid WGSL for vectors).

## Method
1. Source map (read, not run): `std/operators.ts`, `data/vectorOps.ts`, `data/generalizeFn.ts`, `data/matrix.ts`, `std/matrix.ts`, `std/numeric.ts`, `tgsl/wgslGenerator.ts` (binary/assignment branch), `tgsl/infixDispatch.ts`, `data/assignInfixOperators.ts`, `unplugin-typegpu/src/core/{common,factory}.ts`, `tgsl/conversion.ts`, `core/function/dualImpl.ts`.
2. GPU runs use RAW byte buffers written/read by `util.ts` (own WGSL layout code: vec3 12 B, mat3x3f 3 x 16 B columns), so TypeGPU's (de)serialisation of matrices cannot mask an orientation/padding bug. CPU side = the same `'use gpu'` function called as plain JS.
3. Oracles are independent: f64 for floats (WGSL definition read from the spec: *matrix-column-vector product: component i = dot(transpose(m)[i], v)*), BigInt for integers.
4. **Criterion for sums of products** (`float-paths.test.ts`): each output element is a sum of n products of f32 inputs (n = 1 for scalar/component-wise, n = rows for matrix products). Accept iff `|got - exact| <= gamma_n * sum|x_k y_k|`, `gamma_n = n*2^-24/(1-n*2^-24)`; valid for any summation order, with or without FMA (Higham ch.3). Small-integer inputs make everything exactly representable: exact equality demanded. Data sets: `exact` (small distinct ints incl. 0/negatives), `random` (f32 in [-4,4]), `cancel` (1e8 / 1.5 / -1e8 mix). Signed zero compared equal (reported separately). **Caveat:** the WGSL accuracy table could not be read (WebFetch truncated the page before section 15.7); the bound rests on the generic numerical argument, not on a quoted WGSL entry. The cancel set never made the GPU worse than the CPU (worst ratio 0.25 of the bound), so the bound itself is not tightly exercised.
5. Constant folding: operation called DIRECTLY in the traced body with captured vector/matrix instances (pitfall 1); folding verified by absence of `*` in `tgpu.resolve` output; scalar re-typed inside the body with a captured schema (pitfall 2).
6. Negative controls: the criterion rejects the transposed product (vec*mat answer for mat*vec) and a 1e-3 relative error.

## Path map (does it call the shared CPU `cpuMul`?)
| path | CPU runtime | generated WGSL / folding | shares defective `cpuMul`? |
|---|---|---|---|
| `std.mul(a,b)`, `a*b` | `cpuMul`: scalar/vec/mat scale + vec*vec via `generalizeFn(a*b)`; mat*mat, mat*vec, vec*mat via `VectorOps.mulMxM/mulMxV/mulVxM` (f64 sums, f32-rounded once) | `(a * b)`; folded through the same `cpuMul` when all args are comptime | **yes** (int vec/scalar); float: fine |
| `a.mul(b)` / `.add` / `.sub` (infix methods) | same `mul` via `jsInfixDispatchFor` | `InfixDispatch` -> same `mul` codegen/folding | **yes** |
| `a *= b` | unplugin rewrites to `a = __tsover_mul(a, b)` -> same `mul` | **independent**: generic assignment branch emits `a *= b` (no `mul` codegen, no folding, lhs type forced) | CPU yes, GPU no |
| `+= -= /= %=` | rewrite to `__tsover_add/sub/div/mod` | same generic branch | `sub` calls `cpuMul(-1,x)` but harmless |
| `std.sub` | `cpuAdd(l, cpuMul(-1, r))` | `-` | shares code, **not affected** (evidence: 36 extreme pairs per type, 0 mismatches) |
| `std.dot` | `VectorOps.dot` (f64 sum, not wrapped) | `dot(a,b)` | independent, same root idea (F4) |
| `std.fma` | scalars only (f64), vectors: `MissingCpuImplError` | `fma(...)`, ints implicitly cast to f32 | independent |
| `std.mix` | `generalizeFn(e1*(1-e3)+e2*e3)` f64 | `mix(...)` | independent |
| `translate4/scale4/rotate*4` | `mul(ctor(arg), m)` -> `mulMxM` | `(ctor * m)` | uses `cpuMul`, floats only |
| `translation4/scaling4/rotation*4` | literal matrices (f64 `Math.cos/sin`) | `mat4x4f(... cos(a) ...)` | independent |

## Findings
| # | operation / path | classification | minimal repro (CPU vs GPU) | test |
|---|---|---|---|---|
| F1 | `L op= R` (`*= += -= /=`), any type, when L contains a call with side effects (CPU only) | **CONFIRMED DEFECT** (new; low frequency) | `arr[bump()] *= 10` with a bump counter: plain JS and GPU: counter 1, `arr[0]` changed; CPU `'use gpu'`: counter **2**, `arr[0] = arr[1]*10` | `new-findings.test.ts` N1 |
| F2 | iN/uN vector (or scalar) * **f32** scalar via `std.mul`, `*`, `.mul()`, scalar-first, literal `v * 1.5` | **PROBABLE DEFECT** (vectors) / expected difference (scalars: CPU numbers carry no type) | `vec2i(10,3) * f32(1.9)`: CPU `[18,5]`, GPU `[10,3]` (shader `a * i32(b)`); `* -0.5`: CPU `[-5,-1]`, GPU `[0,0]`; `vec2u*2.5`: `[25,7]` vs `[20,6]`; literal `v * 1.5` emitted as `v * 1i` | N2 |
| F3 | `v op= s` with `s` of another scalar type (`vec2f *= i32`, `vec2f *= u32`, `vec2f += i32`, `vec2i *= u32`, `vec2u *= i32`, `vec2i *= f32`) | **PROBABLE DEFECT** (loud: Dawn validation error at pipeline creation; binary `v * s` works and CPU computes) | GPU: `no matching overload for 'operator *= (vec2<f32>, i32)'`; scalar `i32 *= f32` IS converted (`x *= i32(b)`): CPU 3, GPU 2 | N3 |
| F4 | defect #1 propagation | **CONFIRMED DEFECT #1 (not new)** | table below | `int-propagation.test.ts` |
| - | other observations | see below | | N4-N9 |

F2 note: TypeGPU emits an `[implicit-conversion]` warning (asserted in the test) and documents that `'use gpu'` code is meant to behave the same on CPU and GPU (docs `data-schemas.mdx`, division casts), so the divergence is not "intended", but the CPU path could only match it by modelling the conversion; I did not find an explicit statement for `vec_i * float`. Folded `std.mul(vec2i, f32(1.9))` is baked with the *converted* scalar (GPU semantics, `[10,3]`), i.e. folding differs from CPU runtime.

### Defect #1 regression table (lane 0 = INT_MAX*INT_MAX, lane 1 = 94906267^2 (>2^53); lanes 2,3 below 2^53 are correct everywhere)
| path | shares defective CPU code | CPU | GPU | evidence |
|---|---|---|---|---|
| `std.mul(v,v)`, `v*v`, `v.mul(v)` (vec2/3/4 i,u) | yes | wrong lanes 0,1 | correct | 60 runtime rows (2 types x 3 sizes x 10 paths), CPU wrong in all 60 |
| `std.mul(v,s)`, `v*s`, `v.mul(s)`, `std.mul(s,v)`, `s*v` | yes | wrong | correct | same |
| `v *= v`, `v *= s` | yes (CPU only) | wrong | **correct** (raw `x *= y`) | same; shader keeps the `*=` |
| folded `std.mul(X,Y)`, `X*Y`, `X.mul(Y)`, `std.mul(X,S(s))`, `X*S(s)`, `std.mul(S(s),X)` | yes: wrong value is baked into WGSL | - | **wrong (baked)** `[0,261134296]` vs `[1,261134297]` | 12 rows, operator absent from WGSL |
| `let x = vec2i(X); x *= Y` with constants | no folding | wrong | correct | operator stays in WGSL |
| `std.dot(vecNi/u, ...)` | same root idea | out-of-range inexact number (4620693213648296000 vs exact ...5898); `d.i32(dot)` wrong low bits (261134336 vs 261134298) | wraps correctly | scalar results are not wrapped (known class) but the value is not even exact above 2^53 |
| `std.add/sub`, `+=`, `-=`, `std.neg` | `sub` calls `cpuMul(-1,x)` | correct | correct | 36 extreme pairs per type, 0 mismatches |

## What was checked and found fine
* 504 runtime evaluations (2 seeds x 3 data sets per path; 8 forms x n=2,3,4 + scalar form, over `std.mul`, `*`, `.mul()`, `*=` where valid): CPU and GPU within the gamma_n bound; for exact data identical to the oracle. Includes mat*mat, mat*vec, vec*mat, mat*s, s*mat (n=2,3,4), vec*vec, vec*s, s*vec.
* 132 constant-folded checks (same forms, `std.mul`, `*`, `.mul()`): folded in WGSL, within bound, WGSL literal round-trips exactly (baked GPU value == CPU value). Only observation: negative scalar * 0 element: CPU `-0`, baked literal `+0` (4 cases, sign of zero only).
* 84 `+ - += -= .add .sub` checks on mat/vec/scalar: exact on both.
* Compound assignment on struct fields, array elements (static/dynamic index), vector components, self-aliasing (`a *= a`, `arr[1] *= arr[1]`, `x = x*y*x`): correct on both (`*= += -=`).
* `translation4/scaling4/rotationX/Y/Z4` and `translate4/scale4/rotateX/Y/Z4` (asymmetric matrix): CPU within f32 rounding of f64 oracle; GPU exact for non-trig, <= 2^-11 for trig (observed max 8.9e-8); orientation matches the standard right-handed column-vector convention. Order `ctor * m` is TypeGPU's own contract (CPU and GPU agree; JSDoc does not define it).
* `std.mix` (vec, vec, scalar/vec t) and `std.dot` (f32): exact/within bound. `std.fma` on vectors: CPU throws "not implemented" (loud API limitation), GPU fine.
* Mixed-type scalars: `vec2f * i32/u32`: converted to f32 on GPU, equal to CPU for small values. `i32 * f32`: equal.

## Observations (not defects)
* N4 `fma` on i32: GPU `fma(f32(a),f32(b),...)` -> `fma(16777217,1,0)`: CPU 16777217, GPU 16777216 (implicit-conversion warning issued); `u32 * i32` scalars: GPU `i32(a)*b` (4294967295*2 = -2 on GPU, 8589934590 on CPU). Expected: CPU numbers carry no schema.
* N5 `v.xy *= s`: CPU throws ("only a getter"), GPU works (`swizzle_assignment` is present in `gpu.wgslLanguageFeatures`). CPU limitation, loud.
* N6 CPU is more permissive: `a *= b` on a parameter and `let x = a; x.x *= 2` run on CPU (the second mutates the caller's vector via aliasing) but TypeGPU rejects both at resolution (loud).
* N7 invalid combinations (`mat3*vec4`, `vec3i*mat3`, `mix(vec2i,vec2i,0.5)`, `mat3 *= vec3`): CPU throws (except `mat3 *= vec3`, where the CPU silently re-types the variable); GPU: TypeGPU emits the invalid WGSL and Dawn rejects it at pipeline creation (no TypeGPU-level diagnostic).
* N8 f32 intermediate overflow: row (3e38, 3e38, -3e38).(1,1,1): CPU 3e38 (f64 sum), GPU inf/NaN. Expected (WGSL f32 intermediates).
* N9 plain JS `a * b` on vectors outside `'use gpu'` is NaN; `a.mul(b)` works.

## Not checked / blocked
* WGSL spec accuracy table for matrix products (page truncated in WebFetch): criterion is the generic numerical bound.
* f16 vectors (`vec*h`) and f16 mixed-type scalars: not exercised here (covered by `lib/ops.ts` f16 group for component-wise ops only); no f16 matrices exist in TypeGPU.
* `*=` on buffer lvalues (`buf.$ *= x`) from CPU: not runnable on the CPU (buffers are GPU-only); only locals, struct fields, array elements checked.
* Whether F2 is intended: no explicit upstream statement found; upstream issues not consulted (no network posting; not searched).
* Only one device (Apple M3 Pro / Metal); no Vulkan/D3D12 behaviour of `*=` / conversions.

## Files
`float-paths.test.ts`, `matrix-ctors.test.ts`, `int-propagation.test.ts`, `new-findings.test.ts`, helpers `util.ts` (raw runner), `oracle.ts`, `record.ts`, `vitest.config.mts`, `results.json`.
