# Stage 1 — scalar `i32` / `u32` arithmetic

> **Classification note (2026-10-16):** the team lead stated that numerical behaviour is *best effort*. Labels such as "defect" / "probable defect" below describe an observed CPU/GPU
> difference with an understood cause, **not** a violated guarantee. The current classification (expected semantics / folded-value error / codegen error / probable defect / API limitation / unconfirmed),
> upstream status and per-entry detail are in `../CPU_GPU_COMPATIBILITY_CHECKLIST.md` and `../FINAL_REPORT.md` (v2). The text below is kept unchanged as the original evidence record.


Machine/versions: Apple M3 Pro (Metal), typegpu 0.12.7, dawn.node 0.6.2. Rerun: `npx vitest run --config investigations/scalar-int/vitest.config.mts`
→ 6 files, 164 tests: 160 pass + **4 expected-fail** (`it.fails` regression tests S1–S4), 0 failed (rerun by the lead: identical). Pure WGSL: `node investigations/scalar-int/raw-wgsl-scalar.mjs` (→ `raw-wgsl.json`). Raw numbers: `results.json`.
Provenance: the investigation was carried out by a separate workstream; this file was written by the lead from its report. **[lead]** = re-verified independently by the lead
(`investigations/lead-verify/scalar-verify.test.ts`); other numbers are workstream-reported (the test suite that produces them passes).

## Method
40+ operations × i32/u32, each evaluated four ways: CPU call, constant folding (op called directly with captured/typed constants), generated WGSL (`tgpu.resolve`), GPU runtime;
grid of boundary values plus 20 000 seeded random rows per op/type against a BigInt oracle; compound assignments, `++/--`, shifts, conversions, `**`, bit builtins, bitcast.
Contract was taken from TypeGPU docs/source/tests first (documented: integer `/` goes through f32; scalar CPU values are JS numbers).

## What is correct
Everything TypeGPU emits as a plain WGSL operator or builtin is exact on the GPU: 0 mismatches for `+ - *`, neg, abs, sign, min, max, clamp, bitwise ops, shifts, `%`, `%=`, `std.intdiv`,
including wrap-around, `x/0`, `MIN/-1`. Out-of-range scalar results of constant folding are baked as out-of-range literals and rejected by Dawn (loud).

## Findings
| # | Class | Operation / path | Minimal input → actual | Expected / basis | Frequency (workstream-measured) | Impact, confidence | Test |
|---|---|---|---|---|---|---|---|
| S1 | **Probable defect** (GPU side) | scalar `std.mod(i32/u32)` — compiled to `i32(f32(a) % f32(b))` | `std.mod(47,47)`: GPU **47** (CPU, `%`, exact: 0); `std.mod(2147483647, 3)`: GPU **−64** (exact 1) **[lead]** | integer remainder; the integer `%` operator gives the exact value on the same GPU **[lead]**; no upstream doc/test found for scalar-int `std.mod` | wrong on 18–20 % of random rows, 2.35 % of exact multiples in [1,2048]² (distribution-dependent) | a plain-looking integer function returns a wrong value; contract unclear (documented f32 route for `/`, nothing for `mod`); medium | `scalar-runtime.test.ts:181` (`it.fails`) |
| S2 | Probable defect (low) | compound `x /= b` vs `x = x / b` on scalars | `x /= b` with 47,47: GPU **1** (integer division); `x = x / b`: GPU **0** (f32 route) **[lead]** | the docs say integer division goes through f32 uniformly; two spellings of the same operation disagree | n/a | surprising inconsistency; medium | `scalar-runtime.test.ts:224` (`it.fails`) |
| S3 | Expected difference with practical impact (same root as the known scalar-int fact) | CPU scalar `u32` `& \| ^ ~ <<` | `(0x80000000 & 0x80000000) > 0` is false on the CPU (negative int32); an xorshift hash gives a negative `d.f32(h)/2^32` for 988 of 2 000 seeds | scalar u32 on the CPU is a JS number with JS int32 bitwise semantics; whether intended is **unverified** | 988/2000 seeds for the xorshift example | plain-JS runs of u32 hash/PRNG code give values the GPU never produces; medium | `scalar-runtime.test.ts:262` (`it.fails`) |
| S4 | **Probable defect** (silent) | constant-folded float→integer conversion | `d.u32(d.f32(-1))`: folded WGSL `return 4294967295u;`, GPU runtime **0**, Dawn const-eval of `u32(-1f)` 0 **[lead: folded 4294967295 vs runtime 0]**; `d.i32(d.f32(3e9))` folds to −1294967296 vs runtime 2147483520 | WGSL float→int conversion saturates; the CPU does a JS wrap | rare (needs out-of-range float constants) | silent wrong constant in the shader; medium (spec text of the conversion rule was not read by the workstream; evidence is Dawn behaviour) | `scalar-const.test.ts:142` (`it.fails`) |
| E1 | Expected (documented), quantified | scalar `d.i32(a / b)` / `std.div` via f32 | `47/47` → 0 on the GPU | documented f32 division; the CPU is right, the GPU deviates | 375 of 15 937 exact multiples in [1,2048]²; 3–4 % of random rows; max error ≈ 64 near 2^31; non-multiples exact below ≈ 2^23; GPU within 2.2 ULP of the real quotient; `std.intdiv` exact on all 4.19 M pairs | users of integer `/` get off-by-one on exact multiples | `scalar-runtime.test.ts` |
| E2 | Expected (upstream-tested) | integer `**` / `std.pow` via f32 | `3**5`: GPU 242, CPU 243 | pow is inexact on GPUs (README finding 7) | 55 % of exact powers wrong | low | `scalar-pow.test.ts` |
| E3–E6 | Expected | no wrap-around on the CPU (CPU ≡ GPU mod 2^32); stored `a*b` wrong above 2^53 (same root cause as defect #1); zero divisor and `MIN/-1` differ by design; CPU f32→int casts are type-blind | | | | | `scalar-contract.test.ts` |
| E7 | API limitation | scalar bit builtins | no CPU implementation, GPU correct | | | | `scalar-bits.test.ts` |

Side fact (workstream, reproduced in hand-written WGSL): the inexact f32 divide and saturation to 2147483520 / 4294967040 (not INT_MAX/UINT_MAX) are GPU behaviour, not TypeGPU's doing.

## Constant folding summary
Out-of-range scalar results → loud shader rejection. The only **silent** leaks are the f32 family (`std.mod`, `/`, `std.div`) and S4.

## Not verified
Spec text of the integer builtins (§8.8/§8.10 read only through a truncated/summarised fetch); other GPUs; buffer compound assignment; atomics; f16; `**` with a negative base; upstream issues / maintainer intent (no `gh`).
