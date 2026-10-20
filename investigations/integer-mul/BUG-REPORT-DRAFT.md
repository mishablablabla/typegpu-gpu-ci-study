# DRAFT — not submitted anywhere

> **Do not file as-is (2026-10-16):** the team lead stated that numerical behaviour is *best effort*; upstream already tracks adjacent problems ([#3099](https://github.com/software-mansion/TypeGPU/issues/3099), draft [#3110](https://github.com/software-mansion/TypeGPU/pull/3110): scalar compile-time results; #3099 says vectors are unaffected, which this draft contradicts for multiplication).
> See `../CPU_GPU_COMPATIBILITY_CHECKLIST.md` (INT-1, CF-1…) and `../upstream-check/UPSTREAM.md` before using this text. Kept unchanged below as a draft.


## Title

`std.mul` (and `*`) on `i32`/`u32` vectors returns wrong values on the CPU when the exact product exceeds 2^53 (e.g. `vec2i(INT_MAX) * vec2i(INT_MAX)` → `(0, 0)`, GPU gives `(1, 1)`)

## Summary

On the CPU, `std.mul` multiplies integer-vector components with plain JavaScript `a * b` (IEEE-754 double) and only afterwards wraps the result to 32 bits through the vector constructor.
Once the exact product needs more than 53 significant bits, the double has already lost the low bits, so the wrap-around returns a wrong value. On the GPU the same expression is a native 32-bit integer multiply (WGSL: overflow wraps modulo 2^32) and is correct.
The CPU and GPU results therefore differ, silently, for large operands. `add`, `sub` and `neg` are not affected, and neither are products that fit in 2^53 (e.g. both operands ≤ 94 906 265).

## Environment

| | |
|---|---|
| typegpu | 0.12.7 (the relevant code is byte-identical on `main` @ [`aae60ee`](https://github.com/software-mansion/TypeGPU/commit/aae60ee7fa7cf9e68fde6f1ae0a3110f41825057), 2026-10-15) |
| unplugin-typegpu | 0.12.5 (only needed for the GPU example below) |
| Runtime | Node 24.21.0 (V8), macOS 26.3 arm64 |
| GPU (for the GPU confirmation only) | Apple M3 Pro, Metal, via `webgpu` 0.6.2 (dawn.node) |

The CPU behaviour follows from ECMAScript `Number` semantics and is expected to be engine-independent; it was only run on V8/Node.

## Reproducer (CPU only, no GPU needed)

```ts
import { d, std } from 'typegpu';

const MAX = 2147483647; // INT_MAX
const cpu = std.mul(d.vec2i(MAX), d.vec2i(MAX));
console.log(String(cpu)); // actual:   vec2i(0, 0)
// expected (32-bit wrap-around): (2^31 - 1)^2 = 2^62 - 2^32 + 1  ->  low 32 bits = 1
console.log(Number(BigInt.asIntN(32, BigInt(MAX) * BigInt(MAX)))); // 1

const U = 4294967295; // UINT_MAX
console.log(String(std.mul(d.vec2u(U), d.vec2u(U)))); // actual: vec2u(0, 0), expected vec2u(1, 1)
```

Observed output (Node 24.21.0, typegpu 0.12.7):

| input | CPU `std.mul` | expected (BigInt, 32-bit) |
|---|---|---|
| `vec2i(2147483647) * vec2i(2147483647)` | `(0, 0)` | `(1, 1)` |
| `vec2u(4294967295) * vec2u(4294967295)` | `(0, 0)` | `(1, 1)` |
| `vec2i(94906267) * vec2i(94906267)` (first odd square above 2^53) | `261134296` | `261134297` |
| `vec2i(2147483647, 7) * 2147483647` (vector × scalar) | `(0, 2147483641)` | `(1, 2147483641)` |
| `vec2i(94906265) * vec2i(94906265)` (product < 2^53) | `-118490767` | `-118490767` (correct) |

Why: `(2^31 - 1)^2 = 4611686014132420609` is not representable as a double; the double product is `4611686014132420608` (= 2^62 − 2^32), and `4611686014132420608 | 0` is `0`.

### Optional GPU confirmation (needs a WebGPU device and `unplugin-typegpu` for `'use gpu'`)

```ts
import { tgpu, d, std } from 'typegpu';

const root = await tgpu.init();
const a = root.createMutable(d.vec2i, d.vec2i(2147483647));
const out = root.createMutable(d.vec2i);

root
  .createGuardedComputePipeline(() => {
    'use gpu';
    out.$ = std.mul(a.$, a.$); // WGSL: out = (a * a);
  })
  .dispatchThreads();

console.log(String(await out.read())); // GPU: vec2i(1, 1)
```

Observed on the Apple M3 Pro: GPU `(1, 1)`. The same result was obtained with a hand-written WGSL shader (`o = a * b` on `vec2<i32>`), and the generated WGSL contains the multiplication (`O = (A * B);`).
Full harness and raw results: `investigations/integer-mul/` (`reproducer.ts`, `integer-boundaries.test.ts`, `results.json`).

## Affected and unaffected

Verified on the CPU against a BigInt reference (all 400 pairs of 20 boundary values per type, with the other lanes holding different pairs):

- **Wrong when the exact product is not representable as a double:** `std.mul(vecNi, vecNi)`, `std.mul(vecNu, vecNu)` for N = 2, 3, 4; `std.mul(vec, scalar)` and `std.mul(scalar, vec)`; the operator `a * b` on integer vectors inside a `'use gpu'` function called from JS (identical to `std.mul`); and `d.i32(std.mul(a, b))` / `d.u32(std.mul(a, b))` on scalars (the cast receives an already rounded double).
- **Not affected:** `std.add`, `std.sub`, `std.neg` (all widths, including `INT_MIN`/`INT_MAX`/`UINT_MAX`), float vectors and matrices, and any integer product with |a·b| ≤ 2^53. Not every product above 2^53 is wrong: `INT_MAX * INT_MIN` and `INT_MIN * INT_MIN` are exactly representable and correct.
- **Input space (real CPU `std.mul`, 4000 deterministic samples each):** both operands ≤ 94 906 265 → 0 % wrong; `u32 × 1664525` → 0 %; full-range `i32` pairs → 93 %; full-range `u32` pairs → 97.5 %; `u32 state × 747796405` → 98.6 %; `u32 state × 2654435761` → 99.4 %. In every sample the CPU result equals `ToInt32`/`ToUint32` of the double product.

## Suspected root cause

(Permalinks are at `aae60ee`; the files are identical at `v0.12.7`.)

1. [`std/operators.ts#L189`](https://github.com/software-mansion/TypeGPU/blob/aae60ee7fa7cf9e68fde6f1ae0a3110f41825057/packages/typegpu/src/std/operators.ts#L175-L190) — `cpuMul` handles two vectors with `generalizeFn((a, b) => a * b, [lhs, rhs])`; the scalar-scale branches (lines 182 and 185) do the same. `mul` is wired to it at [L217](https://github.com/software-mansion/TypeGPU/blob/aae60ee7fa7cf9e68fde6f1ae0a3110f41825057/packages/typegpu/src/std/operators.ts#L217).
2. [`data/generalizeFn.ts#L73-L98`](https://github.com/software-mansion/TypeGPU/blob/aae60ee7fa7cf9e68fde6f1ae0a3110f41825057/packages/typegpu/src/data/generalizeFn.ts#L73-L98) — `applyArgs` calls the function on plain numbers per component and rebuilds the vector with its constructor.
3. [`data/vectorImpl.ts#L124-L125`](https://github.com/software-mansion/TypeGPU/blob/aae60ee7fa7cf9e68fde6f1ae0a3110f41825057/packages/typegpu/src/data/vectorImpl.ts#L124-L125) → element cast = the `i32`/`u32` schema → [`data/numeric.ts#L140`](https://github.com/software-mansion/TypeGPU/blob/aae60ee7fa7cf9e68fde6f1ae0a3110f41825057/packages/typegpu/src/data/numeric.ts#L126-L141) `return v | 0` (and [L100](https://github.com/software-mansion/TypeGPU/blob/aae60ee7fa7cf9e68fde6f1ae0a3110f41825057/packages/typegpu/src/data/numeric.ts#L75-L101) `(v & 0xffffffff) >>> 0` for `u32`).

The cast is a correct wrap-around, but it is applied to a value whose low bits were already rounded away by the double multiplication. (`cpuSub` is `cpuAdd(lhs, cpuMul(-1, rhs))`, which stays exact because multiplying by −1 is exact in a double.)

## Documented behaviour vs inference

- WGSL: concrete `i32`/`u32` expressions that overflow produce a result modulo 2^bitwidth (spec, *Integer Types*), which is the GPU result above.
- TypeGPU docs: functions "behave the same on the CPU and GPU" ([`apis/functions/index.mdx#L38`](https://github.com/software-mansion/TypeGPU/blob/aae60ee7fa7cf9e68fde6f1ae0a3110f41825057/apps/typegpu-docs/src/content/docs/apis/functions/index.mdx#L37-L38)); for `std`, "our goal is for all functions to have matching behavior on the CPU and GPU" ([L308](https://github.com/software-mansion/TypeGPU/blob/aae60ee7fa7cf9e68fde6f1ae0a3110f41825057/apps/typegpu-docs/src/content/docs/apis/functions/index.mdx#L308-L309)). The `i32()`/`u32()` casts document wrap-around (`i32(10000000000) // 1410065408`, `u32(-1) // 4294967295`).
- **Not documented:** an explicit overflow rule for `std.mul` itself. That the CPU `std.mul` should wrap exactly like WGSL is an inference from the stated goal above, not a written guarantee.

## What is demonstrated and what is not

**Demonstrated** (reproducible, `node investigations/integer-mul/run.mjs`, 73 tests, 3 identical runs): the CPU/GPU mismatch, its cause (the model "CPU = wrap(double product)" reproduces every CPU lane of all six vector types), the exact input condition, the affected entry points above, and that the proposed fix below makes the CPU equal the GPU on the same 2 400 rows.

**Not demonstrated / hypothesis:** impact on real applications. Code that emulates 32-bit integer hashes or PRNGs on the CPU with `*` on `u32` values is the obvious place where this would matter, and `@typegpu/noise` already avoids the problem by using separate `Math.imul` branches on the CPU side (`hash` in [`utils.ts#L66-L82`](https://github.com/software-mansion/TypeGPU/blob/aae60ee7fa7cf9e68fde6f1ae0a3110f41825057/packages/typegpu-noise/src/utils.ts#L66-L82), xoroshiro in [`generator.ts#L139`](https://github.com/software-mansion/TypeGPU/blob/aae60ee7fa7cf9e68fde6f1ae0a3110f41825057/packages/typegpu-noise/src/generator.ts#L139)) — which suggests the limitation is known, but I have no evidence of an affected user program, and I did not enumerate other CPU paths (e.g. compound `*=`).

## Related issues / PRs (searched on 2026-10-15; no equivalent report or fix found)

- [#3099](https://github.com/software-mansion/TypeGPU/issues/3099) (open) / [#3110](https://github.com/software-mansion/TypeGPU/pull/3110) (draft) — *scalar* results evaluated at compile time ignore WGSL precision/overflow rules. Different path (comptime scalars; the PR changes `dualImpl.ts`, `wgslGenerator.ts` and tests, not `cpuMul`). The issue states that vectors are not affected because their constructors round and wrap each element; for multiplication that does not hold, because the wrap is applied after the double multiplication — so the vector path needs its own change, and #3110's scalar-overflow decision (throw instead of wrap) is relevant to the open question below.
- [#2435](https://github.com/software-mansion/TypeGPU/pull/2435) (merged) — introduced the `Math.imul` CPU branches in `@typegpu/noise` (found with `git log -S'Math.imul'` on a local clone; the PR description is empty and no comment discusses double precision or CPU/GPU parity).
- [#2293](https://github.com/software-mansion/TypeGPU/issues/2293) (open) — integer `/` compiled to floating-point division; a different problem, mentioned only to avoid confusion.

## Proposed fix

Use `Math.imul` for integer vectors in `cpuMul` (patch against `v0.12.7` / `main` @ `aae60ee`: [`proposed-fix.patch`](proposed-fix.patch)):

```diff
@@ -178,14 +178,26 @@
   if (typeof lhs === 'number' && typeof rhs === 'number') {
     return lhs * rhs; // default multiplication
   }
+  // Integer (i32/u32) vectors must wrap modulo 2^32 like WGSL does. `a * b` is evaluated in f64 and loses
+  // the low bits once the exact product exceeds 2^53, so the element cast (`| 0` / `>>> 0`) cannot recover
+  // them; `Math.imul` multiplies exactly modulo 2^32 (the element cast then only reinterprets the sign).
   if (typeof lhs === 'number' && (isVecInstance(rhs) || isMatInstance(rhs))) {
+    if (isInteger32VecInstance(rhs) && Number.isInteger(lhs)) {
+      return generalizeFn((e) => Math.imul(lhs, e), [rhs]); // scale (exact 32-bit)
+    }
     return generalizeFn((e) => lhs * e, [rhs]); // scale
   }
   if ((isVecInstance(lhs) || isMatInstance(lhs)) && typeof rhs === 'number') {
+    if (isInteger32VecInstance(lhs) && Number.isInteger(rhs)) {
+      return generalizeFn((e) => Math.imul(e, rhs), [lhs]); // scale (exact 32-bit)
+    }
     return generalizeFn((e) => e * rhs, [lhs]); // scale
   }
   if (isVecInstance(lhs) && isVecInstance(rhs)) {
     assertEqualKinds(lhs, rhs);
+    if (isInteger32VecInstance(lhs)) {
+      return generalizeFn((a, b) => Math.imul(a, b), [lhs, rhs]); // component-wise (exact 32-bit)
+    }
     return generalizeFn((a, b) => a * b, [lhs, rhs]); // component-wise
   }
```

Why `Math.imul` is appropriate: it returns the low 32 bits of the exact product of the operands after `ToInt32`, i.e. exact multiplication modulo 2^32, which is precisely WGSL's wrap-around for both `i32` and `u32` (the bit pattern is identical). It is a single primitive, allocation-free, and already used for the same purpose in `@typegpu/noise`.
Signed/unsigned semantics are preserved by the **existing** element cast: `Math.imul` returns a signed int32; the `i32` cast (`| 0`) keeps it, the `u32` cast (`(v & 0xffffffff) >>> 0`) reinterprets it as unsigned — no new code is needed there. Operands that are not exactly representable (non-integer scalars) keep the previous path (guard `Number.isInteger`). `isInteger32VecInstance` is already imported in this file.
Float vectors, matrices, scalar×scalar, `add`/`sub`/`neg` are untouched; `sub` (= `add(lhs, mul(-1, rhs))`) remains correct.

**Verification of the patch** (`bash investigations/integer-mul/fix-verification/verify-fix.sh`; a copy of the `v0.12.7` sources is built inside the investigation directory, the TypeGPU clone is not modified):

| | tests | result |
|---|---|---|
| repo test-suite of `packages/typegpu`, unpatched | 2 771 | all pass |
| 13 proposed regression tests + 6 GPU-parity tests, unpatched | 19 | 16 fail (the 3 that pass pin behaviour that must not change) |
| repo test-suite + the 19 new tests, patched | 2 790 | **all pass; 0 previously-passing tests fail** |

The GPU-parity test compares the patched CPU `std.mul` with GPU results recorded on the Apple M3 Pro for the same 2 400 rows (6 types × 400): 100 % identical with the patch, wrong without it. The operator form `a * b` is fixed by the same change.

## Regression tests that should accompany the fix

Draft: [`proposed-regression-test.ts`](proposed-regression-test.ts) → `packages/typegpu/tests/std/numeric/mulInt32.test.ts` (BigInt-derived expectations):

- `vec2i(INT_MAX) * vec2i(INT_MAX)` is `(1, 1)`; `vec2u(UINT_MAX) * vec2u(UINT_MAX)` is `(1, 1)`.
- For `vec2i/3i/4i/2u/3u/4u`: every pair of boundary values (`INT_MAX`, `INT_MIN`, −1, 0, 1, 2, 65535, 65536, 46341, 94906265/7, 134217727, 67108865; `UINT_MAX`, 2^31, 3037000499, 2654435761, …), with different pairs in different lanes.
- Vector × integer scalar and scalar × vector; the operator form `a * b` inside a `'use gpu'` function called on the CPU.
- Pins: products below 2^53, float vectors, `sub` at the boundaries, and a non-integer scalar still behave as before.
- Optionally a CPU-vs-GPU parity case in the examples/GPU tests, if the project has a way to run real-device tests.

## Questions for maintainers

1. Is exact 32-bit wrap-around the intended CPU semantics for integer vectors in `std.mul` (as the "matching behavior" goal suggests), or should CPU overflow rather throw, as #3110 proposes for scalar comptime results?
2. Scalars: plain `number × number` is untyped on the CPU (the CPU cannot tell `i32` from `u32`), so `std.mul(a, b)` returns the unwrapped double. Should that stay as is, or should an explicit `d.i32(...)`/`d.u32(...)` cast of a double beyond 2^53 throw (similar to #3110)? This patch does not touch scalars.
3. Non-integer scalar × integer vector (not valid WGSL): keep the current truncating behaviour (as the patch does), or reject?
4. Should other CPU entry points be audited for the same pattern (compound `*=`, helpers built on `std.mul`)? I only tested the paths listed above.
5. Where should a CPU/GPU parity test live, if at all?

## Attachments (in this repository, `investigations/integer-mul/`)

`reproducer.ts`, `integer-boundaries.test.ts`, `results.json`, `FINDINGS.md`, `proposed-fix.patch`, `proposed-regression-test.ts`, `fix-verification/verify-fix.sh`.
