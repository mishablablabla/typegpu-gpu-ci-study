# FINDINGS — `std.mul` on integer vectors: CPU ≠ GPU

> **Classification note (2026-10-16):** the team lead stated that numerical behaviour is *best effort*. Labels such as "defect" / "probable defect" below describe an observed CPU/GPU
> difference with an understood cause, **not** a violated guarantee. The current classification (expected semantics / folded-value error / codegen error / probable defect / API limitation / unconfirmed),
> upstream status and per-entry detail are in `../CPU_GPU_COMPATIBILITY_CHECKLIST.md` and `../FINAL_REPORT.md` (v2). The text below is kept unchanged as the original evidence record.


Investigated 2026-10-15 · Apple M3 Pro (Metal) via dawn.node · typegpu 0.12.7 · unplugin-typegpu 0.12.5 · webgpu 0.6.2 · vitest 4.1.11 · Node 24.21.
Nothing in the TypeGPU repository was modified (read-only tracing; `git status` empty). Nothing was published or sent.
Re-run everything: `node investigations/integer-mul/run.mjs` → `results.json` (3 consecutive runs gave the same content hash over verdict, summary, categories, evidence and per-test outcomes; only `generatedAt` differs).

## 1. Verdict

**Confirmed. It is a real TypeGPU defect in the CPU implementation — not a harness, oracle, or specification issue.**
The GPU is correct (matches 32-bit wrap-around for every lane of every tested type); the CPU `std.mul` on `vecNi`/`vecNu` returns wrong results whenever the exact product is not representable in an f64.
It is a **broader integer-multiplication defect (one root cause, several entry points)**, not a single edge case, and it is **not** shared by `add`, `sub`, `neg`, or vector `div`/`mod`.

## 2. Smallest reproducer (`reproducer.ts`, 1 test, no dependency on the generated suite)

| | value |
|---|---|
| operation | `std.mul(d.vec2i(2147483647, 2147483647), d.vec2i(2147483647, 2147483647))` |
| independent expectation (BigInt) | `[1, 1]` — (2³¹−1)² = 2⁶² − 2³² + 1 → low 32 bits = 1 |
| **CPU** (TypeGPU's `std.mul`) | **`[0, 0]`** |
| GPU, TypeGPU-generated WGSL `O = (A * B);` on `vec2i` | `[1, 1]` |
| GPU, hand-written WGSL `o = a * b` (no TypeGPU codegen) | `[1, 1]` |

`npx vitest run --config investigations/integer-mul/vitest.config.mts reproducer.ts` (writes `reproducer-output.json` with versions, WGSL, and the CPU trace).
Not a false positive: both GPU paths agree with the BigInt value; the generated WGSL contains the multiplication; the result is read back from a GPU storage buffer; canaries (a shader writing a constant / a modified formula) are read back as such (`selftest/integrity.test.ts`).

## 3. Cause (source evidence, read-only)

CPU path: `packages/typegpu/src/std/operators.ts` — `mul = dualImpl({ normalImpl: cpuMul, … })` (line 217); `cpuMul` (from line 157) handles two vectors with
`generalizeFn((a, b) => a * b, [lhs, rhs])` → `packages/typegpu/src/data/generalizeFn.ts` applies the function on plain JS `Number`s (IEEE-754 double) and rebuilds the vector through its constructor →
`data/vectorImpl.ts`: `Vec2` constructor calls `this.castElement()(x)` = the element schema (`i32`/`u32`) → `data/numeric.ts` `i32Cast.normalImpl`: **`return v | 0`**; `u32Cast`: `(v & 0xffffffff) >>> 0`.
So the wrap-around is applied to an **already rounded double**: (2³¹−1)² = 4611686014132420609 is not representable (62 bits needed, a double keeps 53) → the double is 4611686014132420608 = 2⁶² − 2³² → `| 0` gives 0 (see `cpuTrace` in `reproducer-output.json`).
The model "CPU result = ToInt32/ToUint32 of the f64 product" reproduces **every** CPU lane (correct or not) in all 6 vector types (`cpuEqualsModelForEveryLane: true`), including the exact boundary: **0 wrong lanes below 2⁵³, 0 wrong lanes where the f64 product happened to be exact.**

## 4. Semantics (documented guarantee vs assumption)

- `vec2i` components are signed 32-bit (`elementSchema: i32`). **Documented by the WGSL spec:** "Expressions on concrete integer types that overflow produce a result that is modulo 2^bitwidth" (spec source, Integer Types) → the expected value above.
- **TypeGPU docs:** functions "behave the same on the CPU and GPU" (`apis/functions/index.mdx`); for `std`: "Our goal is for all functions to have matching behavior on the CPU and GPU" (same page, *Standard library*) — a stated goal, not a hard guarantee.
  The docs do not state an overflow rule for `std.mul`. The `i32()` cast is documented to wrap (`i32(10000000000) // 1410065408`), which is why a wrap is the intended semantics; **that the CPU `std.mul` must wrap identically is my inference from the stated goal, not a documented guarantee.**
- No conversion, buffer layout, or constructor issue explains the discrepancy (tested through raw bytes; the only inexact step is the f64 multiply).

## 5. Which operations / types are affected (tested)

| entry point | CPU vs expectation |
|---|---|
| `std.mul(vecNi, vecNi)`, `std.mul(vecNu, vecNu)`, N = 2, 3, 4 | **wrong** when the product is not f64-representable (68/142, 102/213, 136/284 lanes above 2⁵³ for i; 212/318, 318/477, 424/636 for u) |
| operator `a * b` inside a `'use gpu'` function called on the CPU (vec2i) | **wrong**, identical to `std.mul` (68 of 800 lanes) |
| `std.mul(vec, scalar)`, `std.mul(scalar, vec)` | **wrong** (e.g. `[MAX, 7] * MAX` → CPU `[0, 2147483641]`, expected `[1, 2147483641]`) |
| `d.i32(std.mul(a, b))`, `d.u32(std.mul(a, b))` scalars | **wrong** (same cast of a rounded double) |
| `std.add`, `std.sub`, `std.neg` (all vector widths, incl. INT_MIN/INT_MAX/UMAX) | **correct** (CPU = GPU = BigInt) — exact in f64 before the wrap |
| `std.div`, `std.mod` on integer **vectors** | GPU = WGSL integer rules for every lane (divisor 0 → dividend / 0, INT_MIN/−1); CPU correct wherever it does not throw; CPU **throws** `FiniteMathAssumptionError` on a zero divisor — a different, by-design-looking difference |
| `std.intdiv` (scalars only; vectors are rejected by the signature → *unsupported*) | CPU follows its documented formula `trunc(trunc(a)/trunc(b))`; differs from WGSL integer division only for `5/0` (CPU `Infinity`, GPU `5`), `0/0` (`NaN` vs `0`), `INT_MIN/−1` (`2147483648` vs `INT_MIN`) |

## 6. How much of the input space

The CPU is wrong exactly when |a·b| needs more than 53 significant bits (not "every product above 2⁵³": `INT_MAX·INT_MIN` and `INT_MIN·INT_MIN` are exact doubles and correct).
Measured with the real CPU `std.mul` on 4000 deterministic samples each (the f64 model predicted exactly the same wrong samples every time):

| operands | CPU wrong |
|---|---|
| i32, |a|,|b| ≤ 94906265 (≈√2⁵³); u32, a,b ≤ 94906265 | **0 %** |
| u32 state × 1664525 (Numerical-Recipes LCG multiplier) | **0 %** |
| i32 full-range pairs | 93 % |
| u32 full-range pairs | 97.5 % |
| u32 state × 747796405 (PCG multiplier) | 98.6 % |
| u32 state × 2654435761 (Knuth multiplicative hash) | 99.4 % |

Named cases (CPU / expected): `INT_MAX·INT_MAX` 0 / 1; `UMAX·UMAX` 0 / 1; `94906267·94906267` (first odd square above 2⁵³) 261134296 / 261134297; `3037000499²` u32 2661407744 / 2661407785; `94906265²` (just below 2⁵³) correct.
So **small/moderate integers are unaffected; hash-, PRNG- and large-constant arithmetic is almost always affected**, silently (no error, no warning).

## 7. Impact and severity (not overstated)

- The **GPU is unaffected**; shaders running on a device are correct.
- Affects **CPU execution of `'use gpu'` code** (unit-testing shaders, shared logic, CPU fallbacks) that multiplies large integer vectors/values: results silently differ from the GPU.
- Severity: **medium for CPU/GPU parity and shader unit tests; low for GPU-only users.** I did not find user code in the repo that is currently broken by it. Circumstantial evidence the maintainers already know JS `*` is unsafe here: `@typegpu/noise` `hash` and `XOROSHIRO64STARSTAR` use separate CPU branches with `Math.imul` (`std.isBeingTranspiled()`), while the GPU branch uses `*`.
  Whether maintainers regard `std.mul` itself as defective is **not established**.

## 8. What a safe fix must preserve

1. WGSL wrap-around for every input: for `i32` `Math.imul(a, b)`; for `u32` `Math.imul(a, b) >>> 0` (a fixed multiplication must not go through f64 at all — fixing the cast cannot help, the low bits are already lost).
2. Float vector/matrix multiplication unchanged (f32 rounding, mat×vec paths).
3. Scalar numbers stay untyped JS numbers (the CPU cannot know i32 vs u32 for a bare `number`), so scalar `std.mul(number, number)` keeps returning the unwrapped product unless the API changes; only typed vectors (and casts of exact products) can be made exact.
4. Mixed vector×scalar, scalar×vector and the operator form must follow the same path; `sub` (= `add(lhs, mul(−1, rhs))`) must stay correct.
5. The regression tests here flip from "expected failure" to FAILED the moment the CPU is fixed (`it.fails` → delete `.fails`); a simulated `Math.imul` fix passes the same comparison on all 6 types.

## 9. Test and report structure (separate categories)

`results.json → categories`: `confirmedDefects` (#1), `expectedSpecificationDifferences` (E1 intdiv edge cases, E2 vector div/mod zero divisor, E3 scalar integers are untyped JS numbers), `unsupported` (intdiv on vectors), `unverifiedHypotheses` (H1–H3).
The 8 regression tests are titled `[CONFIRMED DEFECT #1] …` and are `it.fails` (expected failure, *not* converted into a pass of the underlying assertion); negative controls: a deliberately wrong CPU value and a deliberately wrong GPU function (`mul + 1`) are both detected, and the oracle is checked against hand-computed values.
In the main suite the 117 affected rows were previously labelled "known divergence"; they are now a separate **CONFIRMED-DEFECT** category (`reports/report.json → confirmedDefects`). The pre-change report is preserved in `baseline-report.json` / `baseline-cases/`.

## 10. Correction of an earlier claim (main PoC)

The main README said integer `std.div`/`std.mod` are compiled to f32 operations. The emitted WGSL shows this is true only for **scalars** (`f32(a) / f32(b)`); for **vectors** it is integer `a / b` and `a % b`.
The main suite's integer-vector `div`/`mod` policy was too lenient (derived "via f32"); it now uses the exact WGSL integer rules (all GPU lanes pass), which moved 8 220 case rows from *unverified* to *pass* (main suite: pass 116 805 → 125 025, unverified 35 425 → 27 205). Scalar `div`/`mod` keep the derived policy.

## 11. Remaining uncertainty / missing evidence

- GPU side verified on one backend (Metal); WGSL guarantees the wrap, but Linux/other drivers were not run (out of scope).
- Not enumerated: other CPU code paths that may multiply through f64 (compound `*=`, `std` functions built on `mul`, `typegpu-*` packages); only the entry points in §5 were tested.
- Not checked: whether this is already reported upstream (no network/issue-tracker search, nothing published).
- Impact on real user code is demonstrated only for synthetic hash-style multiplications.
- Scalar `std.div`/`std.mod` on integers (f32 operations) were not investigated beyond the emitted WGSL.

## 12. Files

`FINDINGS.md` · `reproducer.ts` (+ `reproducer-output.json`) · `integer-boundaries.test.ts` · `results.json` · `run.mjs` · `vitest.config.mts` · `raw/` (evidence.json, vitest.json) · `baseline-report.json`, `baseline-cases/` (pre-change reports).

## 13. Follow-up (2026-10-15): upstream check and verification of the proposed fix

- **Upstream:** no equivalent public issue or fix found (GitHub search, tag `v0.12.7` and `origin/main` @ `aae60ee`, whose relevant files are identical). Closest: issue #3099 / draft PR #3110 (scalar comptime results; vectors declared unaffected — not true for multiplication), merged #2435 (`Math.imul` CPU branches in `@typegpu/noise`), open #2293 (integer `/` as float division; separate). Search limits and details: `BUG-REPORT-DRAFT.md`.
- **Fix verification:** `proposed-fix.patch` (applies cleanly to both refs) was applied to a **copy** of the `v0.12.7` sources built inside `fix-verification/` (`verify-fix.sh`; the clone is not modified). Repo suite unpatched 2 771/2 771 pass; the 19 new tests (13 regression + 6 GPU-parity on the 2 400 recorded GPU rows) fail 16/19 unpatched; patched suite 2 790/2 790 pass, 0 regressions. `fix-verification/results/summary.json`.
- **Additive changes to earlier artifacts:** `integer-boundaries.test.ts` now also dumps `raw/gpu-matrix.json` (the GPU results of the multiplication matrix, used by the parity test); nothing else in the investigation or in `baseline-report.json` was altered. §11's "not checked upstream" is superseded by the first bullet.
- **Drafts for maintainers (nothing was submitted):** `BUG-REPORT-DRAFT.md`, `MAINTAINER-SUMMARY.md`, `proposed-regression-test.ts`.
