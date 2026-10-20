# Integer vector `std.mul`: CPU ≠ GPU — one-minute summary (draft, nothing submitted)

> **Do not file as-is (2026-10-16):** the team lead stated that numerical behaviour is *best effort*; upstream already tracks adjacent problems ([#3099](https://github.com/software-mansion/TypeGPU/issues/3099), draft [#3110](https://github.com/software-mansion/TypeGPU/pull/3110): scalar compile-time results; #3099 says vectors are unaffected, which this draft contradicts for multiplication).
> See `../CPU_GPU_COMPATIBILITY_CHECKLIST.md` (INT-1, CF-1…) and `../upstream-check/UPSTREAM.md` before using this text. Kept unchanged below as a draft.


**Already known?** I found no issue or PR about this (GitHub search 2026-10-15; see limits below). Closest: **#3099 / draft #3110** — *scalar* compile-time results ignoring WGSL overflow; #3099 says vectors are unaffected because the constructors wrap, which does not hold for multiplication (the wrap happens after a lossy double multiply). `@typegpu/noise` already uses `Math.imul` on its CPU branches (#2435).

**Reproduction (CPU only, 3 lines):**
```ts
import { d, std } from 'typegpu';
std.mul(d.vec2i(2147483647), d.vec2i(2147483647)); // CPU: vec2i(0, 0)   GPU / WGSL / BigInt: vec2i(1, 1)
```
Also `vec2u(UINT_MAX)²`, vector × scalar, and the operator `a * b` on the CPU. `add`/`sub`/`neg` and products ≤ 2^53 are fine.

**Cause:** `cpuMul` (`std/operators.ts` L189) multiplies in f64 and the vector constructor wraps afterwards (`v | 0`, `numeric.ts` L140); above 2^53 the low bits are already gone.

**Strongest evidence:** the GPU (TypeGPU-generated *and* hand-written WGSL) equals the BigInt result on 2 400 boundary rows; the f64 model explains every CPU lane; the proposed `Math.imul` patch (12 added lines in one function) makes the CPU identical to the recorded GPU results, and the repo's own suite passes (2 771 → 2 790 tests with 19 new, 0 regressions, 16 of the new ones fail without the patch).

**Scale:** operands ≤ ~9.5·10⁷ are never affected; full-range `u32`/`i32` products are wrong in 93–99 % of samples (PCG / Knuth hash multipliers included). **Not shown:** any real user program affected — impact is hypothetical.

**Limits:** one JS engine (V8), GPU checked on Metal only; GitHub search is keyword-based (some result lists were truncated), so "not found" ≠ "does not exist"; other CPU paths (`*=` etc.) not audited.

**Open decisions:** wrap vs throw on CPU overflow (cf. #3110), scalar `number × number` stays untyped, non-integer scalar × int vector.

**Suggested next step:** you confirm it is worth an issue; then I post the prepared report with the patch + regression test, or open the PR directly. Files: `BUG-REPORT-DRAFT.md`, `proposed-fix.patch`, `proposed-regression-test.ts`, `fix-verification/verify-fix.sh`.
