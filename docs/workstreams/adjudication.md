> Paths in this document refer to the original working tree. See [docs/INDEX.md](../INDEX.md) for the mapping to this repository.

# WS-ADJ report

Scoreboard: SCOREBOARD.md / scoreboard.json (16 root-cause groups; strict = spec rule, then real CTS interval; lean = IEEE/f64 + Metal tie-breaker, non-authoritative).
Strict: Lavapipe outlier 0, SwiftShader outlier 0, both fine 10 (weighted 14), both off 0, indeterminate 5 (w 4), f16 capability gap 1 (w 3).
Lean: SwiftShader off 6 (w 9), Lavapipe off 3 (w 3), mixed 6 (w 6).

Findings
1. CTS cannot name an outlier: rejected = 0 on all backends over 195 210 lanes; C4 is a strict tie; tie-breaker favours Lavapipe (sin/cos relevance 3, f16 gap relevance 3).
2. SwiftShader sin/cos error 1.9e-4 (Lavapipe 5e-8, Metal 1e-7): inside the CTS interval (<=39 % of half-width) but visible in the `probability` example (unit-circle check). TypeGPU uses sin in 34 examples, cos in 32.
3. Phase-2 statements to soften: (a) "Lavapipe asin/acos exceed the bound" holds only for the harness's abs-only bound; the real CTS interval accepts all sampled lanes; (b) the 12 SwiftShader-x64 min/max/neg reds are harness-policy artefacts (CTS accepts flushed values); (c) where the spec is silent SwiftShader differs from IEEE/Metal on log(0) = -88 and exp(NaN) = +inf (Lavapipe matches on all 80 lanes); mod special inputs: SwiftShader = IEEE on 2 690 lanes, Lavapipe on none; pow special inputs: neither close to IEEE.

Hypotheses (H1 Subzero vs arch needs source builds; H2/H3 need full-lane re-dump through judge(); H4 sin polynomial; H5 relevance scores are judgement from usage counts; H6 JS Math reference not correctly rounded).
Unresolved: WS-EX appendix pending; `probability` has only |v|=1 invariant; f16 on SwiftShader has no verdict; Metal = one M3 Pro.
Process note: one scratch file was briefly written into third_party/cts by the oracle loader (cwd change); moved immediately, no frozen file modified.

## Appendix (WS-EX examples folded in; transcribed by the lead)
53 divergent examples classified: X1 (2: jump-flood-distance, suika-sdf) F32_MAX into r16float, spec-indeterminate (quantizeToF16 out of range), non-portable example; X2 (2) f16 capability; X3 (bitonic-sort, Lavapipe lone outlier) environment dependence (adapter limits); X4 (2) BPETER fract(cos(a)*136.8168) amplifies CTS-allowed cos error (cos interval unbounded outside [-pi,pi]); X5 (4) chaotic amplification (hypothesis); X6 (12, SwiftShader-lone small diffs) matches sin/cos ~2e-4 signature, hypothesis only (11/16 vs 14/34 call a transcendental); X7 (3) example nondeterministic between repeats; X8 (27) unattributed.
Buckets: backend numerics X1 X4 X5 X6 X8 (+ sign-of-zero, allowed by WGSL); example/env nondeterminism X3 X7; capability X2; actual spec correctness difference: none established.
Lean: example evidence leans against SwiftShader on practical numerics, but it is a lean, not an outlier verdict. Settling X6/X8 needs per-example runs with SwiftShader sin/cos replaced by an accurate implementation.
Main totals unchanged (16 groups; strict 0/0 outliers, 10 both fine, 5 indeterminate, 1 capability gap).
