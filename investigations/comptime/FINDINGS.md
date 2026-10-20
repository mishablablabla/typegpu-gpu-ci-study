# Step 1 — compile-time (comptime) folding vs runtime evaluation

> **Classification note (2026-10-16):** the team lead stated that numerical behaviour is *best effort*. Labels such as "defect" / "probable defect" below describe an observed CPU/GPU
> difference with an understood cause, **not** a violated guarantee. The current classification (expected semantics / folded-value error / codegen error / probable defect / API limitation / unconfirmed),
> upstream status and per-entry detail are in `../CPU_GPU_COMPATIBILITY_CHECKLIST.md` and `../FINAL_REPORT.md` (v2). The text below is kept unchanged as the original evidence record.


Question: when all arguments are constants, TypeGPU evaluates the call on the CPU while generating WGSL (`dualImpl` comptime branch).
Does that CPU value differ from what the GPU computes for the same expression with runtime (buffer) arguments, or from the exact result?
Machine/versions as in ../../README.md (Apple M3 Pro / Metal, typegpu 0.12.7, Dawn 0.6.2). One run, 1 796 case rows (boundary pairs, sampled).

Run: `npx vitest run --config investigations/comptime/vitest.config.mts` (writes `results.json`);
`node investigations/comptime/raw-wgsl-const-eval.mjs` (hand-written WGSL, no TypeGPU).

## Method (and a mistake that was caught)
For each (op, type) and boundary pair three results: **const** (operation called *directly* in the traced body with captured constants,
`const-bodies.ts`), **runtime** (same op, buffer arguments, one dispatch) and a BigInt **oracle**.
A first version called the op through a helper `'use gpu'` function; there the arguments are parameters, nothing is folded, and
"no leak" meant nothing. That version was discarded. Captured *scalars* lose their schema (a `d.u32` capture is just a JS number),
so scalars are re-typed inside the body.

## Verified
| # | Result | Evidence |
|---|---|---|
| 1 | The vector multiply defect reaches the generated WGSL: for `vec2i`/`vec2u` `std.mul` and `a * b`, **every** case where the CPU is wrong (4/31 i, 9/31 u sampled) is baked in as a wrong constant; runtime GPU is right in all of them (silent). | results.json, `rtW 0`, `silentLeak = cpuW` |
| 2 | Negative controls: vector `add`/`sub`/`min`/`max`/`/`/`%`, no case differs between const and runtime. | results.json |
| 3 | Scalar `i32`/`u32` constants: when the CPU result is out of range (no wrap-around on the CPU) TypeGPU writes an out-of-range literal (e.g. `…u`/`…i` of 2^33) and **Dawn rejects the shader at pipeline creation** — loud, not silent. | `rejected` column |
| 4 | Hand-written WGSL: Dawn **accepts** constant-expression overflow and wraps (`i32(MAX)*i32(MAX)` = 1, `vec2u(UMAX)*vec2u(UMAX)` = (1,1), `i32(MAX)+i32(1)` = MIN). So WGSL itself does what the GPU does at runtime; TypeGPU's scalar constants (3) and vector `mul` (1) differ from it. | raw-wgsl-const-eval.mjs |
| 5 | **INT_MIN literal.** `d.i32(-2147483648)` inside a shader makes TypeGPU emit `return -2147483648i;`, which Dawn rejects (`value cannot be represented as 'i32'`); `vec2i(-2147483648, 5)` and `i32(-2147483648)` are accepted. Any constant-folded scalar that equals INT_MIN (`std.min(MIN, MIN)`, `a & b`, …) fails the same way. | int-min-literal.test.ts, raw-wgsl-const-eval.mjs |
| 6 | On the CPU, `a & b`, `a \| b`, `a ^ b`, `a << s` on **vectors** return the number `0` (JS operator on objects), no error; on the GPU they compile and work. `std.bitShiftLeft/Right` on vectors is correct on the CPU. | one-off probe, `a=vec2u(12,10) b=vec2u(10,6)`: `a&b`, `a\|b`, `a^b`, `a<<s` → `number 0`; `std.bitShiftLeft(a, vec2u(1,2))` → `vec2u(24,40)` (probe file not kept) |

## Not a finding (test artifacts / known semantics)
- Vector `a << b` / `a >> b` "rejected" rows: my lane layout puts a huge shift amount into lane 1; WGSL forbids a constant shift ≥ 32, so the shader is rightly rejected.
- Scalar `a / b` differs from the integer oracle in the same rows for const and runtime: scalar integer division is compiled to f32 (known, README finding 2).

## Assessment
- (1) is the same defect as before, now with proof that it also reaches WGSL through the generic mechanism — no new root cause.
- (5) is a **new, small, loud** defect candidate (invalid WGSL for one specific value, workaround: `i32(-2147483647) - 1` or a non-constant). Not checked upstream (no `gh` in this environment).
- (6) is weak: TypeScript does not type `&` on vector objects, and vector shifts have a supported `std` function. Observation only.
- Not covered: float ops under folding (policy needs a CPU-vs-f32 tolerance model), matrices, ops other than the 17 listed.
