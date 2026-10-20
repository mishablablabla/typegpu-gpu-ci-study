# Stage 1 — audit: extending the real-CTS oracle to the other float functions

Read-only audit; no GPU run, no change to policies/thresholds/baselines. Data: [audit-float-ops.json](audit-float-ops.json) (script [audit-float-ops.cjs](audit-float-ops.cjs)).
Terms: **accepted** = inside a bounded interval from the real CTS implementation (≠ proven correct); **rejected** = outside a bounded interval (≠ automatically a backend bug); **indeterminate** = interval unbounded or an operand non-finite (any output accepted / interval cannot be built); **unverified** = the oracle could not be applied (missing data, unmapped case) — not the same as indeterminate.

## 1. How the oracle works today (mod, log, log2, pow)
- **Data**: `investigations/backend-diff/allrows-*.json` (lossy JSON) and `final/allrows-bits/*` (bit-exact, f32 hex). Both come from `engine-allrows.ts` (copy of `lib/engine.ts` that keeps every row) driven by `dump-allrows*.test.ts`, whose `WANT = ['mod','log','log2','pow']` is what restricts the dumps to four ops. A row = one harness input with 1–4 lanes (vector rows are judged lane by lane); each row stores `inputs`, `cpu`, `gpu`, `want` (harness oracle), recorded lane verdicts.
- **CTS side**: `third_party/cts-oracle.cjs` loads the real `src/webgpu/util/floating_point.ts` (pinned `e325d0bcc2cb`) and calls `FP.f32.<op>Interval(inputs…)`; verdict = `interval.contains(gpu)`, NaN accepted only by the unbounded interval (`floating_point.ts:150-162`).
- **Mapping**: the CTS function receives the exact f32 inputs of the lane (decoded from bits), the result is the lane's GPU value; no CTS case list is involved (the CTS's own inputs are used only for the PoC grid spec and equivalence checks).
- **Classification** (`final/mod-policy/oracle-equivalence-bits.mjs`): bounded & inside → accepted; bounded & outside → rejected; unbounded or ±inf operand → indeterminate; NaN operand → indeterminate by rule (CTS cannot build an interval from NaN; it throws). Old policy recomputed from the unchanged `lib/policy.ts` and compared per lane.

## 2. What exists in the dumps and in the CTS
- Dumps: only the 4 ops above. The other 14 float ops (+3 f16 ops) have **no all-rows data**: `reports/**/cases/diff-float.json` / `diff-f16.json` keep ≤30 rows per status and group (retained rows only). A new dump is required (cheap: a dump of 16 644 rows takes < 1 s on Metal).
- Real CTS has an interval function **and** a spec file for every harness float op: `additionInterval`, `subtractionInterval`, `multiplicationInterval`, `divisionInterval`, `minInterval`, `maxInterval`, `negationInterval`, `sqrtInterval`, `inverseSqrtInterval`, `sinInterval`, `cosInterval`, `expInterval`, `exp2Interval`, `tanhInterval` (+ f16 variants via `FP.f16`). Spec files: `binary/f32_{addition,subtraction,multiplication,division}`, `unary/f32_arithmetic` (negation), `call/builtin/{min,max,sqrt,inversesqrt,sin,cos,exp,exp2,tanh}` (note: the file is `inversesqrt` in lower case; corrected during group C) (+ f16 files). None of these were part of the CTS runs done so far (only remainder/log/log2/pow/normalize).

## 3. Same methodology without losing the CTS meaning?
Yes for all, with these caveats found in the CTS source:
| Op | Harness policy (basis) | Real CTS rule | Difference that will cause category transitions |
|---|---|---|---|
| add, sub, mul | correctly rounded (spec) | `correctlyRoundedInterval` + flush alternatives | harness treats flush/overflow edge lanes as `investigate`; CTS gives bounded or unbounded |
| div | 2.5 ULP on \|y\|∈[2^-126,2^126] (spec) | `divisionInterval` (`DivisionIntervalOp`, same 2.5 ULP rule and domain; unbounded outside it) | likely near-identical; flush alternatives may widen |
| min, max, neg | exact-select (spec) | `minInterval`/`maxInterval`/`negationInterval` (`:3765`, `:3792`, `:4003`); both-subnormal operands → either may be returned | ±0 and subnormal lanes (observations in harness) get a definite interval |
| sqrt | **derived, conservative 9 ULP (invented bound)** | `sqrtInterval = division(1, inverseSqrt(x))` (`:4322`), domain >0 | harness bound is not CTS: expect many transitions; sqrt(0) unbounded in CTS |
| inverseSqrt | 2 ULP (spec) | 2 ULP, domain `greaterThanZeroInterval` (`:3636`) | zero/negative/subnormal lanes: unbounded |
| sin, cos | abs 2^-11 on [−π,π], nothing elsewhere (spec) | same abs error, domain `negPiToPiInterval` (`:4252`, `:3099`) | outside [−π,π] both say "no bound" |
| exp, exp2 | 3+2\|x\| ULP (spec) | same (`:3476`, `:3491`) | overflow lanes handled by CTS non-finite rule |
| tanh | abs 1e-5 only, "exceeding is inconclusive" (spec) | span of `sinh/cosh` division interval **and** abs 1e-5 (`:4423`) | CTS interval is wider than the harness' |
| f16 add/sub/mul | correctly rounded (spec) | `FP.f16.*Interval` | needs f16 decoding of dumps and `shader-f16` |
Not lost: CTS intervals are computed per scalar lane from exact inputs, which is exactly how vector rows are judged. Known limits: NaN inputs cannot be judged (indeterminate by rule); the CTS accepts anything on unbounded intervals; harness sqrt/tanh policies differ from the CTS, so those two will change category for reasons that must be recorded, not tuned away.

## 4. Audit table (rows/lanes from `reports/lavapipe-full-conformance`; scalar-combo columns = real CTS interval over the harness' scalar input lists)
| Function | Rows (all types) | Lanes | Harness verdicts pass/fail/investigate | Oracle data source today | Format compatibility | Scalar combos: non-finite input · unbounded · point · interval | Expected complexity |
|---|---|---|---|---|---|---|---|
| add f32 | 10 000 | 25 000 | 7259 / 0 / 2741 | none (needs dump) | needs bit-exact dump | 2500: 291 · 280 · 948 · 1173 | low |
| sub f32 | 10 000 | 25 000 | 7259 / 0 / 2741 | none | same | 291 · 280 · 940 · 1181 | low |
| mul f32 | 10 000 | 25 000 | 6494 / 0 / 3506 | none | same | 291 · 318 · 811 · 1272 | low |
| div f32 | 10 000 | 25 000 | 5132 / 0 / 4868 | none | same | 291 · 523 · 0 · 1878 | low–medium (large `investigate` share) |
| min f32 | 10 000 | 25 000 | 7260 / 0 / 2740 | none | same | 291 · 192 · 2091 · 118 | low |
| max f32 | 10 000 | 25 000 | 7260 / 0 / 2740 | none | same | 291 · 192 · 2131 · 78 | low |
| neg f32 | 200 | 500 | 170 / 0 / 30 | none | same | 3 · 2 · 45 · 2 | low |
| sqrt f32 | 216 | 540 | 133 / 0 / 83 | none | same | 3 · 11 · 0 · 42 | medium (policy differs) |
| inverseSqrt f32 | 208 | 520 | 125 / 0 / 83 | none | same | 3 · 11 · 0 · 40 | low |
| sin f32 | 168 | 420 | 107 / 0 / 61 | none | same | 2 · 4 · 0 · 37 | low |
| cos f32 | 168 | 420 | 107 / 0 / 61 | none | same | 2 · 4 · 0 · 37 | low |
| exp f32 | 168 | 420 | 134 / 0 / 34 | none | same | 1 · 3 · 0 · 38 | low |
| exp2 f32 | 168 | 420 | 154 / 0 / 14 | none | same | 1 · 1 · 0 · 40 | low |
| tanh f32 | 144 | 360 | 134 / 0 / 10 | none | same | 1 · 0 · 0 · 35 | medium (policy differs) |
| add / sub / mul f16 | 507 each | 1 183 each | 479/0/28, 479/0/28, 365/0/142 | none | f16 decoding + FP.f16 | 291 · 512/501/523 · 85/86/229 · … | medium |
| *(already done)* mod f32 | 13 924 | 34 810 | 8526 / 280 / 5118 | allrows(+bits) | done | 345 · 697 · 1949 · 718 | done |
| *(already done)* log, log2, pow f32 | 208, 208, 2 304 | 520, 520, 5 760 | see final report | allrows(+bits) | done | — | done |
Rows are row counts of the harness groups (retained-row detail is capped, totals are complete); "investigate" = harness unverified (non-finite, overflow, subnormal/flush ambiguity). The scalar-combo columns are an *a priori* ceiling on how many results can become accepted/rejected vs stay indeterminate; actual numbers need the dump. Vector rows reuse the same scalar list values in different lanes, so shares will be similar but not identical.

## 5. Proposed plan (nothing below has been run)
All new files under `evaluator/`; baselines/dumps/reports untouched; new result dirs only.
0. **Tooling (no GPU)**: `dump-allrows-bits-ext.test.ts` = copy of the bit-exact dump with `WANT` = the 14 new ops (f32) + add/sub/mul f16 (f16 hex); a generic evaluator `evaluate-ext.mjs` (real CTS oracle, op→`FP.<kind>.<fn>` map, lane verdict = accepted/rejected/indeterminate/unverified, old harness verdict recomputed from `lib/policy.ts` and checked against the recorded one, 0 mismatches required).
1. **Group A — f32 arithmetic** (add, sub, mul, neg): dump on Metal + ARM64 (+ native x86_64 via the existing manual workflow), evaluate, report rows/lanes before and after, counts per category and per transition (e.g. `investigate→indeterminate`, `investigate→accepted`, `pass→indeterminate`, `fail→…`) with representative lanes.
2. **Group B — div and min/max**.
3. **Group C — inverseSqrt, exp, exp2, sin, cos** (policies agree with CTS; transitions should only come from flush/domain edge lanes).
4. **Group D — sqrt and tanh** (policies differ from CTS; the report must state that the old bound was a harness choice, and keep the old verdicts side by side).
5. **Group E — f16 add/sub/mul** (needs `shader-f16`; f16 bit decoding).
6. For each group: run the real CTS spec files for the same ops on the same backends as a cross-check (minutes; the runner already exists), plus a mutation sample judged by the real intervals as before, and a note on every lane the oracle could not map (`unverified`).
7. Optional (relevant to the CPU/GPU question, decide with you): judge the **CPU** column (TypeGPU's JS implementation) with the same real intervals, i.e. "does the CPU result lie inside the CTS interval?".
Cost: dumps take seconds locally; one native x86_64 workflow run (~4 min, free tier); CTS runs for these files ~ few minutes per backend. No heavy runs.

## 6. Risks / what could invalidate the extension
- Lossy dumps must not be used (NaN/inf/−0); the extension uses the bit-exact format only.
- Do not tune harness policies to move rows; sqrt/tanh transitions are expected and will be reported as policy-vs-CTS differences.
- Harness input lists are not the CTS's: CTS passing ≠ harness lanes accepted; both are reported separately.
- The JS port `cts-model.mjs` covers only remainder/log/log2/pow/normalize; the extension uses the real oracle only.
