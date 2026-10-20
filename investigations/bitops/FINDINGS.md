# Stage 2 — bitwise operations and integer `std` functions

> **Classification note (2026-10-16):** the team lead stated that numerical behaviour is *best effort*. Labels such as "defect" / "probable defect" below describe an observed CPU/GPU
> difference with an understood cause, **not** a violated guarantee. The current classification (expected semantics / folded-value error / codegen error / probable defect / API limitation / unconfirmed),
> upstream status and per-entry detail are in `../CPU_GPU_COMPATIBILITY_CHECKLIST.md` and `../FINAL_REPORT.md` (v2). The text below is kept unchanged as the original evidence record.


Machine/versions: Apple M3 Pro (Metal), typegpu 0.12.7, dawn.node 0.6.2. Rerun: `npx vitest run --config investigations/bitops/vitest.config.mts`
→ 7 files, 451 tests: 436 pass + **15 expected-fail** (`it.fails` regression tests), 0 failed (rerun by the lead: identical). Raw numbers: `results.json`, `raw/*.json`.
Provenance: the investigation was carried out by a separate workstream (spec text read from gpuweb `index.bs`, independent BigInt oracle). This file was written by the lead,
who also **re-classified** several of the workstream's "probable defects" after checking the public TypeScript signatures (`node_modules/typegpu/std/numeric.d.ts`) and re-probing
(`investigations/lead-verify/bitops-verify.test.ts`). Items marked **[lead]** were verified independently.

## Summary
- **Correct values: no discrepancy.** Runtime GPU vs oracle: 224 op × type cells (i32/u32, scalar and vec2–4), 260 544 lane checks, **0 mismatches**. Constant-folded path: 114 cells,
  ~3 200 shaders, 0 wrong values whenever Dawn accepts the shader.
- **No new confirmed defect.** What remains are (a) the already-known scalar-integer CPU semantics seen through bit operations, (b) *missing diagnostics* for invalid argument
  types (loud only at the driver level), and (c) API limitations.
- Public API covered: `countOneBits reverseBits countLeadingZeros countTrailingZeros firstLeadingBit firstTrailingBit extractBits insertBits abs sign min max clamp select
  bitcast* bitShiftLeft/Right`, operators `~ & | ^ << >> >>>` and compound forms, `dot4*Packed`, `pack/unpack4x8*`; `Math.abs/sign/clz32` inside shaders.

## Findings (after re-classification)
| # | Class | Operation / path | Minimal input → actual | Expected / basis | Impact, confidence | Test |
|---|---|---|---|---|---|---|
| B1 | **Diagnostics gap (low)** — was "probable defect" | `std.firstLeadingBit(f32)`, `~f32`, `f32 & f32` (any bit-op builtin/operator with an f32 scalar). In TS an `f32` is just `number`, so these type-check | TypeGPU codegen passes; **Dawn rejects the shader** (`no matching call to 'firstLeadingBit(f32)'`, `no matching overload for 'operator ~ (f32)'`). The pipeline call returns normally, no JS exception, **the output buffer keeps its old value** (123 stayed 123) **[lead]** | WGSL requires integer operands; the error is correct but only a driver message announces it | user sees "nothing happened"; loud in the console only; high | `findings.test.ts` (it.fails) |
| B2 | **Not a user bug** — was "probable defect" | `std.firstLeadingBit(vec3f/bool)`, `std.abs(bool/vec3b)`, `bool ^ bool`, `vec & scalar`, `std.min/max/clamp(vec, scalar)` | passes codegen, Dawn rejects (CPU throws) | the public TS signatures forbid these (`cpuFirstLeadingBit<T extends AnyIntegerVecInstance>`, `cpuClamp<T>(value: T, low: T, high: T)`) **[lead: read the .d.ts]** | cannot be written in type-correct TS; no wrong value | `api-matrix.test.ts:79`, `findings.test.ts:70` |
| B3 | Expected difference (same root as the known scalar-int fact) | CPU scalar `u32` `& \| ^ ~ << >>` | `d.u32(0x80000000) \| d.u32(1)`: CPU −2147483647, GPU 2147483649; `~d.u32(0)`: CPU −1, GPU 4294967295 | scalar i32/u32 on the CPU are JS numbers with JS bitwise semantics (known, README finding 6; whether this is *intended* is unverified) | wrong-looking CPU values for u32 ≥ 2^31 in plain-JS runs; medium | `findings.test.ts:32` (`it.fails`) |
| B4 | API limitation | CPU `~vec3i`, `v >> vec3u`, `>>>`, `v &= w` on vectors return a number; extends the known `& \| ^ <<` fact | operators on vector objects; not typable in TS | `std.bitShiftLeft/Right` on vectors is correct | low | `findings.test.ts:48` (`it.fails`) |
| B5 | API limitation (loud) | CPU runtime of the 8 bit builtins (`countOneBits … insertBits`) and `dot4U8Packed/dot4I8Packed` | throws `MissingCpuImplError` | contract: no CPU implementation; GPU result verified | CPU-side testing of these functions is impossible; high | `api-matrix.test.ts` |
| E1 | Expected (spec) | const-eval is stricter than the CPU | `const x = i32(1); x << 31`, `u32(0x80000001) << 1`, constant shift ≥ 32 even with a runtime lhs, const extract/insert offset+count > 32 → shader-creation error | WGSL const-expression rules | high | `const-fold.test.ts`, `extract-insert-overflow.test.ts` |
| E2 | Observation | TypeGPU folds `std.bitShiftLeft(const vec, 33)` and `std.clamp(5, 10, 0)` | accepted and folded, while the equivalent WGSL constant/runtime forms are errors | the CPU evaluation hides the spec's const-expression error | low; contract unclear | `const-fold.test.ts` |
| E3–E6 | Expected / known | f32 shift amounts and `Math.clz32(f32)` saturate on GPU, wrap on CPU; abstract-int literal expressions (`d.u32(~0)`, `d.u32(1 << 32)`, `d.i32(1 << 31)`) differ; the scalar INT_MIN literal rejection also hits `abs`, `bitcast`, `~` (known); scalar f32/bool are implicitly converted to i32 for integer builtins (warning only), `sign(u32)` becomes `sign(f32(x))` and returns f32 | | | low | `extras.test.ts` |

Extra observation (workstream, consistent with Dawn/Metal and the spec formula): `extractBits`/`insertBits` with offset+count > 32 on *runtime* values match the spec formula.

## Frequency / impact notes
B1 is the only item a user can realistically hit without a type error: a float used where an integer is required. The WebGPU error model reports it asynchronously (error scope /
`uncapturederror`), so TypeGPU's calls do not throw. Whether TypeGPU should validate operand types itself is a design question, not a numerical defect.

## Not verified
f16 and abstract-float variants; atomics and subgroup integer ops; NaN/inf bit patterns through `bitcast`; whether B3 is intended; GPUs other than Metal; behaviour on repo HEAD
(source read only, measurements on 0.12.7).
