import { readJson } from '../../lib/read-json.mjs';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ADJ = path.resolve(HERE, '../../../results/adjudication');
const J = (n) => JSON.parse(fs.readFileSync(path.join(ADJ, n), 'utf8'));
const LANE = J('lane-adjudication.json'), INV = J('tests-inventory.json'), EXP = J('experiments.json'), SUX = J('suite-examples-oracle.json'), USE = J('typegpu-usage.json'), INVAR = J('ex-invariants.json');

const RCMAP = {
  G01: ['A|add|subnormal-involved', 'A|sub|subnormal-involved', 'A|mul|subnormal-involved', 'A|mul|inf-operand', 'B|div|subnormal-involved', 'B|div|nan-vs-number-result', 'B|div|inf-vs-finite-result', 'C|inverseSqrt|inf-vs-finite-result', 'C|inverseSqrt|nan-vs-number-result', 'D|sqrt|subnormal-involved', 'D|sqrt|nan-vs-number-result'],
  G02: ['A|neg|subnormal-involved', 'B|min|subnormal-involved', 'B|min|inf-operand', 'B|max|subnormal-involved', 'B|max|inf-operand'],
  G03: ['B|min|zero-sign-only', 'B|max|zero-sign-only', 'C|sin|zero-sign-only', 'D|tanh|zero-sign-only', 'L|mod|zero-sign-only'],
  G04: ['C|sin|normal-domain', 'C|sin|subnormal-involved', 'C|cos|normal-domain'],
  G05: ['C|exp|normal-domain', 'C|exp2|normal-domain', 'D|tanh|normal-domain', 'L|log|normal-domain', 'L|log2|normal-domain', 'L|pow|normal-domain'],
  G06: ['C|exp|nan-operand', 'C|exp2|nan-operand', 'L|log|inf-vs-finite-result', 'L|log|nan-vs-number-result', 'L|log|nan-operand', 'L|log2|inf-vs-finite-result', 'L|log2|nan-vs-number-result', 'L|log2|nan-operand'],
  G07: ['L|pow|domain-edge', 'L|pow|inf-vs-finite-result', 'L|pow|nan-vs-number-result'],
  G08: ['L|mod|normal-domain'],
  G09: ['L|mod|inf-operand', 'L|mod|inf-vs-finite-result', 'L|mod|subnormal-involved'],
};
const mapped = new Set(Object.values(RCMAP).flat()); const unmapped = Object.keys(LANE.rootCauses).filter((k) => !mapped.has(k)); if (unmapped.length) throw new Error('unmapped lane root causes: ' + unmapped.join(','));
const addInto = (o, p, n = 1) => { o[p] = (o[p] ?? 0) + n; };
function laneStats(g) { const S = { lanes: { ssA: 0, ssX: 0 }, cat: { ssA: {}, ssX: {} }, metal: { ssA: {}, ssX: {} }, closer: { ssA: {}, ssX: {} }, ieee: { ssA: { n: 0, lav: 0, ss: 0, metal: 0 }, ssX: { n: 0, lav: 0, ss: 0, metal: 0 } } };
  for (const k of RCMAP[g] ?? []) { const t = LANE.rootCauses[k]; for (const o of ['ssA', 'ssX']) { S.lanes[o] += t.perSS[o]; for (const [c, n] of Object.entries(t.catPairs[o])) addInto(S.cat[o], c, n); for (const [c, n] of Object.entries(t.metalAgree[o])) addInto(S.metal[o], c, n); for (const [c, n] of Object.entries(t.vsWant[o])) addInto(S.closer[o], c, n); for (const m of ['n', 'lav', 'ss', 'metal']) S.ieee[o][m] += t.ieeeMatch[o][m]; } } return S; }

const AB = { passed: 'P', failed: 'F', skipped: 'S', undefined: '-' };
function testGroup(suite, key) { const k = key.toLowerCase();
  if (suite === 'suites') {
    if (k.includes('bitops/api-matrix')) return 'G10'; if (k.includes('const-fold') && /length\/normalize/.test(k)) return 'G01'; if (k.includes('const-fold') && k.includes('atan2')) return 'S2'; if (k.includes('edge-cases') && /length\(vec3f\) \/ normalize/.test(k)) return 'G01';
    if (k.includes('edge-cases') && k.includes('dot / distance / fma')) return 'G16'; if (k.includes('mul-paths') && k.includes('n8')) return 'G16';
    if (k.includes('fract')) return 'G12'; if (k.includes(' mix') || k.includes(' mix_s') || k.includes(':: mix') || k.includes('mix with t')) return 'G13'; if (/ asin | acos /.test(k) || /asin (f32|vec)|acos (f32|vec)/.test(k)) return 'G11';
    if (k.includes('scalar-const')) return 'G08'; if (k.includes('scalar-conv')) return 'G14'; if (k.includes('scalar-runtime')) return 'S1'; return 'UNMAPPED'; }
  if (/(f16|vec[234]h|vecnh|half precision)/.test(k) && !k.includes('pow')) return 'G10'; if (k.includes('ported/auto/mul') || k.includes('ported/auto/div') || k.includes('ported/auto/mod.gpu') && /h/.test(k)) return 'G10';
  if (k.includes('float.diff') && /(min|max|neg) /.test(k)) return 'G02'; if (k.includes('float.diff') && /\bmod /.test(k)) return 'G08'; if (k.includes('float.diff') && /\blog2? /.test(k)) return 'S4';
  if (k.includes('ported/log.gpu') || (k.includes('trig-misc') && k.includes('log2'))) return 'G06'; if (k.includes('pow.gpu')) return 'G05'; if (k.includes('normalize.gpu')) return 'S3'; if (k.includes('mix.gpu')) return 'G10'; return 'UNMAPPED'; }
const TESTS = { suites: {}, full: {} };
const diffCols = { suites: ['metal', 'lav-arm64-r1', 'ss-arm64-r3', 'lav-x64-9V45', 'ss-x64-9V45'], full: ['metal', 'lav-arm64-r1', 'ss-arm64-r1', 'lav-x64-ci1', 'ss-x64-ci1'] };
for (const suite of ['suites', 'full']) for (const [k, v] of Object.entries(INV[suite].tests)) { const st = diffCols[suite].map((c) => AB[v[c]?.s]).join(''); if (st === 'PPPPP' || st === 'SSSSS') continue; const g = testGroup(suite, k); (TESTS[suite][g] ??= []).push({ test: k, pattern: st, msg: (v[diffCols[suite][2]]?.msg || v[diffCols[suite][4]]?.msg || v[diffCols[suite][1]]?.msg || '').slice(0, 160) }); }
if (TESTS.suites.UNMAPPED || TESTS.full.UNMAPPED) throw new Error('unmapped tests: ' + JSON.stringify([TESTS.suites.UNMAPPED, TESTS.full.UNMAPPED], null, 1).slice(0, 2000));
const tcount = (g) => ({ suites: (TESTS.suites[g] ?? []).length, full: (TESTS.full[g] ?? []).length }); const patt = (g) => { const o = {}; for (const s of ['suites', 'full']) for (const t of TESTS[s][g] ?? []) addInto(o, `${s}:${t.pattern}`); return o; };

const fnUse = (fns) => Object.fromEntries(fns.map((f) => [f, { examples: USE.exCount[f] ?? 0, libs: USE.libCount[f] ?? 0 }]));
const REL = {
  G01: [1, ['add', 'sub', 'mul', 'div', 'sqrt', 'inverseSqrt', 'length', 'normalize'], 'functions are everywhere, but the behaviour (subnormal operands, only SwiftShader-x64) is not something examples/libs rely on'],
  G02: [1, ['min', 'max', 'neg', 'clamp'], 'min/max/clamp are everywhere; only subnormal operands differ (x64 only); no example depends on it. Hits the PoC harness policy, not product code'],
  G03: [1, ['sin', 'tanh', 'mod', 'min', 'max', 'sign'], 'sign of zero is explicitly unspecified by WGSL; rarely observable (1/x, atan2)'],
  G04: [3, ['sin', 'cos'], 'sin/cos used by 34/32 docs examples and 4 libs (noise, sdf, radiance-cascades); visible in the real `probability` example output'],
  G05: [2, ['pow', 'exp', 'tanh', 'log', 'exp2'], 'widely used, but differences are a few ULP; matters only for exact-equality asserts (TypeGPU std tests do use some)'],
  G06: [1, ['log', 'exp', 'exp2'], 'log(0)/NaN inputs are domain edges; only TypeGPU unit tests (ported log/log2 edge cases) assert them; no example does'],
  G07: [1, ['pow'], 'pow(0,y)/negative base are domain edges; 26 examples use pow but with positive operands in practice (not verified per call site)'],
  G08: [1, ['mod'], 'std.mod used by 2 examples, 0 libs; differs in normal domain only for large quotients; also feeds the scalar-int silent-leak story'],
  G09: [0, ['mod'], 'mod by infinity/subnormal divisor: no known use'],
  G10: [3, [], 'shader-f16: 24 files in packages/typegpu, 3 docs examples (mnist-inference, monocular-light-injection, log-test) and 45 of 194 TypeGPU unit-test files mention f16/vecNh; SwiftShader cannot run any of it'],
  G11: [1, ['asin', 'acos'], 'asin/acos used by 1 example each and 1 lib; error is < spec bound anyway'],
  G12: [1, ['fract'], 'fract used by 16 examples; differs only for |x| < ~1e-8 negative inputs (1.0 vs 0.99999994)'],
  G13: [2, ['mix'], 'mix used by 41 examples and 3 libs; SwiftShader uses x+(y-x)*t, differs by 1 ULP at t=1 and overflows for |x|,|y| ~3e38'],
  G14: [1, [], 'd.f32(u32) of values > 2^24 only; rare'],
  G15: [1, ['atan2'], 'atan2 used by 8 examples; atan2(0,0) is a domain edge'],
  G16: [1, ['dot', 'length', 'mix'], 'intermediate overflow is indeterminate by spec; examples do not rely on it'],
};

const G = [];
const lanesStr = (S) => `${S.lanes.ssA} lanes vs SS-arm64, ${S.lanes.ssX} vs SS-x64`;
const catStr = (S, o) => Object.entries(S.cat[o]).map(([c, n]) => `${c.replace('/', '|')}: ${n}`).join(', ') || 'none';
const mk = (id, title, o) => { const S = laneStats(id); const T = tcount(id); const rel = REL[id]; G.push({ id, title, laneStats: S, tests: T, testPatterns: patt(id), relevance: { score: rel[0], functions: fnUse(rel[1]), rationale: rel[2] }, ...o }); };

mk('G01', 'Subnormal operands flushed to zero: add/sub/mul/div/sqrt/inverseSqrt (+ downstream inf/NaN, length underflow)', {
  affected: 'A add/sub/mul, B div, C inverseSqrt, D sqrt lanes; suites const-fold + edge-cases length/normalize tests',
  verdict: { lavapipe: 'accepted (CTS interval) / indeterminate lanes identical to SS; keeps subnormals', ssArm64: 'identical to Lavapipe (0 differing lanes)', ssX64: 'accepted (CTS) on every decidable lane; flushes subnormal operands (WGSL 15.7: inputs and outputs of listed ops may be flushed)' },
  oracle: 'spec rule (flush permitted) + real CTS interval (rejected = 0 on all four backends)', strict: 'both-fine', lean: 'mixed/none: Metal sides with SS-x64 (flushes), exact value sides with Lavapipe/SS-arm64; flush is spec-permitted', confidence: 'high',
  note: 'Phase-2 claim "same pattern as Metal" holds for arithmetic (Metal agrees with SS-x64 on all differing lanes) but NOT for min/max/neg (see G02).' });
mk('G02', 'Subnormal flush in min/max/neg (SS-x64 only) - fails the harness "exact-select" policy', {
  affected: 'B min/max, A neg lanes; 12 full-suite tests (diff/float min/max/neg x4 types) fail on SS-x64 only',
  verdict: { lavapipe: 'accepted (CTS); returns an operand exactly', ssArm64: 'identical to Lavapipe', ssX64: 'accepted (CTS) on every lane although harness policy "must return an operand exactly" fails 1 820+20 lanes (fail -> accepted in eval.json)' },
  oracle: 'spec rule (flush may apply to outputs) + real CTS interval; harness policy is stricter than WGSL', strict: 'both-fine', lean: 'ss-leaning-off: Metal agrees with Lavapipe (does not flush min/max/neg) on ~97% of the differing min/max subnormal lanes', confidence: 'high',
  note: 'The 12 red tests are a harness-policy artefact (policy asks for exact operand), not a WGSL violation: CTS accepts the flushed value.' });
mk('G03', 'Sign of zero (sin(-0), tanh(-0), mod(-0,y), min/max of +-0)', {
  affected: 'C sin 10 lanes, D tanh 10, B min/max 20, L mod 900 (identical on SS-arm64 and SS-x64)',
  verdict: { lavapipe: 'accepted/indeterminate (same category as SS)', ssArm64: 'same', ssX64: 'same' },
  oracle: 'WGSL text: "Implementations may ignore the sign field of a floating point zero"', strict: 'both-fine', lean: 'mixed (Metal agrees with Lavapipe on sin/mod, with SS on tanh)', confidence: 'high', note: 'No test fails because of it.' });
mk('G04', 'sin/cos accuracy: SwiftShader (both arch) far less accurate than Lavapipe/Metal, still inside the CTS interval', {
  affected: 'C sin 370 + cos 330 lanes; real example `probability` (onUnitCircle/onUnitSphere/onHemisphere)',
  verdict: { lavapipe: 'accepted (CTS); max abs error 5.0e-8 (<= 0.0% of interval half-width)', ssArm64: 'accepted (CTS); max abs error 1.88e-4, uses up to 38.6% of the interval half-width (CTS bound 2^-11)', ssX64: 'same bits as SS-arm64' },
  oracle: 'real CTS interval (accepted/accepted); secondary: f64 reference error and |v|-1 invariant of the real `probability` example', strict: 'both-fine',
  lean: `ss-outlier vs Metal and vs exact: |v|-1 on unit-circle samples max ${INVAR.swiftshaderArm64.onUnitCircle.maxAbsDev.toExponential(1)} (SS) vs ${INVAR.lavapipeArm64.onUnitCircle.maxAbsDev.toExponential(1)} (Lavapipe) / ${INVAR.metal.onUnitCircle.maxAbsDev.toExponential(1)} (Metal)`, confidence: 'high (lane + example evidence)',
  note: 'Probability example differs SS-vs-Metal by ~3150-3310 ULP on sin/cos distributions while Lavapipe-vs-Metal is 2-22 ULP. Acceptable by spec, but any TypeGPU assertion tighter than ~2e-4 on sin/cos output is backend-specific.' });
mk('G05', 'exp/exp2/tanh/log/log2/pow in the normal domain: few-ULP differences (incl. Lavapipe pow(7,1)=7.0000005)', {
  affected: 'C exp/exp2, D tanh, L log/log2/pow lanes; full-suite ported pow tests (exponent one, f16 vec: Lavapipe only)',
  verdict: { lavapipe: 'accepted (CTS) on all lanes; pow(7,1) = 7.000000476837158 inside [6.99999, 7.00001]', ssArm64: 'accepted (CTS) on all lanes', ssX64: 'accepted (CTS); a few more last-bit differences vs arm64' },
  oracle: 'real CTS interval (accepted/accepted); experiments.json E3, E4', strict: 'both-fine', lean: 'mixed/none (see proximity: closer-to-exact counts are split; Metal agrees with each side on a minority of lanes)', confidence: 'high',
  note: 'The two Lavapipe-only red ported tests (pow exponent one, f16 pow vec) are exact-equality asserts that a CTS-accepted result does not meet; SS happens to be exact on those inputs.' });
mk('G06', 'Transcendental special inputs: exp(NaN), log(0), log(NaN), log(<0), log2(0)...', {
  affected: 'C exp/exp2 NaN lanes, L log/log2 domain lanes; ported log/log2 edge-case tests (2 tests red on SS only)',
  verdict: { lavapipe: 'indeterminate (CTS cannot judge); = IEEE-754 (log(0)=-inf, NaN in -> NaN) and = Metal on all 80 lanes', ssArm64: 'indeterminate; returns finite/inf values: log(0)=-88.03, log2(0)=-127, log(NaN)=89.13, exp(NaN)=+inf', ssX64: 'same as SS-arm64' },
  oracle: 'WGSL says indeterminate (finite-math assumption; CTS interval unbounded) -> falls to IEEE-754 value + Metal as non-authoritative reference', strict: 'indeterminate', lean: 'ss-outlier (Lavapipe = IEEE = Metal on every lane; SS differs on every lane)', confidence: 'high for the observation; the "outlier" label is a reference-lean only',
  note: 'TypeGPU own ported tests assert log(0) = -inf; SS fails them. The test file itself notes WGSL leaves it unspecified.' });
mk('G07', 'pow special inputs: pow(0,y), pow(neg,y), pow(x,0)', {
  affected: 'L pow 400 lanes (domain-edge 70, inf-vs-finite 90, NaN-vs-number 240)',
  verdict: { lavapipe: 'indeterminate; pow(0,0)=0 and pow(0,-y)=0 (IEEE: 1 and +inf), NaN for negative bases (= Metal)', ssArm64: 'indeterminate; IEEE-correct for pow(0,0), pow(0,-2), negative base with integer exponent; tiny/huge garbage for pow(0,0.5)=7.7e-20, pow(0,-1)=1.7e38', ssX64: 'same as SS-arm64' },
  oracle: 'WGSL pow inherits exp2(y*log2(x)) (undefined for x<=0) -> IEEE-754 value + Metal reference', strict: 'indeterminate', lean: 'mixed (IEEE match: Lavapipe 180/400, SS 150/400, Metal 310/400; each backend off in different lanes)', confidence: 'medium (lane counts exact; leaning is reference-based)', note: 'Metal is closest to IEEE here; neither software backend is.' });
mk('G08', 'mod / % in the normal domain: Lavapipe approximate, SwiftShader exact', {
  affected: 'L mod 4 980 lanes differ; full-suite diff mod x4 tests (red on Lavapipe only); scalar-const leaking-set test (SS differs)',
  verdict: { lavapipe: 'accepted (CTS) on all lanes; 4 420 lanes differ from the exact remainder (max abs error 10.3); harness "derived" policy fails 280 lanes', ssArm64: 'accepted (CTS); equals fround(want) on all lanes', ssX64: 'same as SS-arm64' },
  oracle: 'real CTS interval (remainderInterval, inherited x - y*trunc(x/y))', strict: 'both-fine', lean: 'lavapipe-leaning-off: SS exact on every differing lane; Metal agrees with SS on 70% of them, with neither on the rest', confidence: 'high',
  note: 'Phase-2: "Lavapipe mod approximate" is confirmed, but inside the spec interval - not a spec violation.' });
mk('G09', 'mod special inputs: infinity operand, subnormal divisor', {
  affected: 'L mod 2 690 lanes (inf-operand 1 120, inf-vs-finite 1 550, subnormal 20)',
  verdict: { lavapipe: 'indeterminate; NaN or +-inf where the finite IEEE result exists (e.g. mod(1, 1e-40) = -inf)', ssArm64: 'indeterminate; = IEEE fmod on every lane', ssX64: 'same as SS-arm64' },
  oracle: 'divisor flush / infinite operands -> CTS unbounded; IEEE fmod + Metal reference', strict: 'indeterminate', lean: 'mixed/none: SS = IEEE fmod on 2 690/2 690, Lavapipe 0; but Metal returns NaN like Lavapipe on 1 120 lanes and agrees with neither on the rest', confidence: 'medium', note: 'No example uses mod with such inputs.' });
const f16 = { id: 'G10', title: 'shader-f16 missing on SwiftShader (capability gap, silent zeros in unguarded mixed tests)' };
G.push({ ...f16, laneStats: null, tests: tcount('G10'), testPatterns: patt('G10'), relevance: { score: REL.G10[0], functions: {}, rationale: REL.G10[2] },
  affected: 'CTS: 476/1 162 cases skipped (all `shader-f16`); full suite +16 skips (arm64: 15 pass->skip +1 fail->skip), 11 pass->fail where an unguarded test emits f16 and the dispatch returns zeros; group E (f16 add/sub/mul) not runnable; bitops api-matrix f16-arg test; example mnist-inference default (f16) path',
  verdict: { lavapipe: 'runs f16; sampled f16 values accepted by CTS (E3 pow(3,3)=26.984375 inside [26.66,27.45])', ssArm64: 'not runnable -> no verdict (UNVERIFIED); silent zero output where tests do not guard on hasF16', ssX64: 'same' },
  oracle: 'none possible for SS (feature absent); Lavapipe f16 lanes were CTS-accepted in Phase 1', strict: 'capability-gap', lean: 'n/a', confidence: 'high', note: 'Cost is accounted in C5 (WS-F16); listed here because 26 red/skipped tests and 1 example path change status because of it.' });
mk('G11', 'asin/acos: Lavapipe errors up to ~2.1e-4 exceed the harness bound but are inside the CTS/spec interval', {
  affected: '8 vector-fns runtime-matrix tests (asin/acos x f32,vec2,3,4) red on Lavapipe (arm64 + x64) only',
  verdict: { lavapipe: 'accepted by the CTS interval on every sampled lane (144 asin, 123 acos lanes; +29 out-of-domain lanes indeterminate); harness abs bound 6.81e-5 exceeded; uses up to 93% of the interval half-width (asin) / 50% (acos)', ssArm64: 'accepted (0% - 17% of half-width)', ssX64: 'same pass pattern as arm64' },
  oracle: 'real CTS asinInterval/acosInterval = span(atan2-inherited interval, abs 6.8e-5) = WGSL "the worse of"; sampled lanes only (full lane set not stored)', strict: 'both-fine', lean: 'lavapipe-leaning-off: Metal and SS within 1-3 ULP of exact in the sample; Lavapipe 1 200-3 600 ULP', confidence: 'medium (sample: 144 asin / 123 acos Lavapipe lanes, 0 rejected; 41% of asin sample above 80% of the interval)', note: 'Harness bound was stricter than the spec ("exceeding is inconclusive" in the test itself). A full-lane re-dump on Lavapipe would settle whether any lane is outside.' });
mk('G12', 'fract of tiny negatives: Lavapipe/Metal 1.0, SwiftShader 0.99999994', {
  affected: '5 suite tests red on SS (edge-cases fract + runtime-matrix fract x4)',
  verdict: { lavapipe: 'accepted (CTS interval [0.99999994, 1] for both probe inputs)', ssArm64: 'accepted (same interval)', ssX64: 'same' }, oracle: 'real CTS fractInterval (E1)', strict: 'both-fine', lean: 'ss-leaning-off: SS returns the lower neighbour; Lavapipe = Metal = round-to-nearest', confidence: 'high', note: 'Test comment already says 1.0 is "allowed by the spec note"; the lower neighbour is allowed too.' });
mk('G13', 'mix formula: SwiftShader x+(y-x)*t vs spec x*(1-t)+y*t', {
  affected: '8 suite tests red on SS (edge-cases mix + runtime-matrix mix f32/vec2-4, mix_s vec2-4); overflow case mix(-3e38,3e38,0.5)',
  verdict: { lavapipe: 'accepted (CTS precise formula); = Metal', ssArm64: 'accepted via the CTS mixImprecise formula (E2: mix(1,0.49999997,1)=0.5, mix(1,1e-9,1)=0); overflow case (y-x overflows -> inf) only inside an unbounded interval = indeterminate', ssX64: 'same as arm64' },
  oracle: 'real CTS mixIntervals = [imprecise, precise] (E2); sample of 248 SS "mix" + 262 "mix_s" lanes: 0 rejected', strict: 'both-fine', lean: 'ss-leaning-off: Lavapipe = Metal = spec formula', confidence: 'medium-high (sample-based for lanes, exact for the probe inputs)', note: 'Both CTS formulas are accepted, so the red tests assert the precise formula only.' });
mk('G14', 'int -> f32 conversion: SwiftShader not always round-to-nearest (96 u32 rows)', {
  affected: '1 suite test (scalar-conv d.f32(u32)) red on SS',
  verdict: { lavapipe: 'round-to-nearest (= spec-allowed)', ssArm64: 'one of the two adjacent f32 values on all 96 rows (the test checks this first) = spec-allowed', ssX64: 'same pattern (test red on both)' },
  oracle: 'WGSL 15.7.6 numeric scalar conversion: "XOut is one of those two values... WGSL does not specify which"', strict: 'both-fine', lean: 'ss-leaning-off: Lavapipe = Metal = round-to-nearest', confidence: 'high', note: 'The test then also asserts round-to-nearest as a Metal observation.' });
mk('G15', 'atan2(0,0): Lavapipe 3pi/4, SwiftShader 0, Metal NaN', {
  affected: 'const-fold atan2 test (red on all non-Metal backends; for atan2(1,-0) Lavapipe = SS = +pi/2 and Metal -pi/2 is the odd one out - listed under shared)',
  verdict: { lavapipe: 'indeterminate (origin outside domain); 2.3561911582946777', ssArm64: 'indeterminate; 0 (= IEEE-754 atan2(0,0))', ssX64: 'same as SS-arm64' },
  oracle: 'CTS interval unbounded (E6) -> IEEE-754 value + Metal', strict: 'indeterminate', lean: 'lavapipe-leaning-off: SS = IEEE value 0; Lavapipe 3pi/4 arbitrary; Metal NaN (neutral)', confidence: 'medium', note: 'Metal NaN is itself a spec-permitted result.' });
mk('G16', 'Intermediate overflow results (dot/distance/fma/mix/N8): inf vs NaN vs finite differ between all backends', {
  affected: 'edge-cases dot/distance/fma test (red on all non-Metal), mul-paths N8 test (red on Lavapipe only)',
  verdict: { lavapipe: 'indeterminate (overflow -> WGSL indeterminate; CTS interval unbounded E9); dot cancellation gives NaN, N8 first component inf/NaN', ssArm64: 'indeterminate; inf or finite (N8 finite)', ssX64: 'dot cancellation NaN like Lavapipe; mix overflow inf like arm64' },
  oracle: 'WGSL finite-math assumption + CTS unbounded interval', strict: 'indeterminate', lean: 'none (all four backends differ pairwise)', confidence: 'high', note: 'These tests assert Metal-observed behaviour.' });

const SHARED = [
  { id: 'S1', title: 'scalar-int silent wrong integer quotient (T(a/b), std.mod through the f32 path)', evidence: 'Metal: 375 wrong quotients on exact multiples (a,b in 1..2048); Lavapipe, SS-arm64, SS-x64: 0 (suites scalar-int results.json)', verdict: 'Lavapipe = SwiftShader (correctly rounded division); Metal is the outlier (still inside WGSL division accuracy 2.5 ULP, so a TypeGPU emission issue, not a backend defect); neither software backend can reproduce it', tests: tcount('S1') },
  { id: 'S2', title: 'atan2(1, -0): Metal -pi/2, Lavapipe = SS = +pi/2 (IEEE)', evidence: 'experiments.json E6', verdict: 'CTS unbounded (indeterminate); Metal deviates from IEEE; Lavapipe = SS', tests: tcount('S2') },
  { id: 'S3', title: 'normalize(vec3f(-1,4,-1)).x one-ULP difference', evidence: 'E5: Metal -0.2357022613286972 vs Lavapipe = SS -0.2357022762298584; all inside the CTS interval', verdict: 'accepted for all three; the ported TypeGPU test asserts Metal-exact bits', tests: tcount('S3') },
  { id: 'S4', title: 'log/log2 of subnormal inputs (8 diff tests red on Lavapipe and SS, not Metal)', evidence: 'dump group L: Lavapipe = SS-arm64 = SS-x64 bit-identical (-87.414, -126.11 ...), Metal flushes the input -> -inf', verdict: 'CTS indeterminate (input flush allowed); Lavapipe = SS; Metal differs', tests: tcount('S4') },
];


for (const g of G) { if (!g.laneStats) continue; const S = g.laneStats; const o = S.lanes.ssA ? 'ssA' : 'ssX'; const c = S.closer[o], m = S.metal[o]; g.proximity = `vs SS-${o === 'ssA' ? 'arm64' : 'x64'} (${S.lanes[o]} lanes): Lavapipe closer to f64 reference on ${c.lavCloser ?? 0}, SS on ${c.ssCloser ?? 0}, tie ${c.tie ?? 0}; Metal = Lavapipe on ${(m.withLav ?? 0) + (m.withBoth ?? 0)}, = SS on ${(m.withSS ?? 0) + (m.withBoth ?? 0)}, neither ${m.withNeither ?? 0}; IEEE/f64 value hit: Lavapipe ${S.ieee[o].lav}, SS ${S.ieee[o].ss}, Metal ${S.ieee[o].metal} of ${S.ieee[o].n}`; }
const gget = (id) => G.find((x) => x.id === id); const chk = []; const must = (name, ok) => { chk.push({ name, ok: !!ok }); if (!ok) throw new Error('CLAIM CHECK FAILED: ' + name); };
{ const S = gget('G06').laneStats, I = S.ieee.ssA; must('G06 Lavapipe = IEEE on all lanes', I.lav === I.n); must('G06 Metal = IEEE on all lanes', I.metal === I.n); must('G06 SS = IEEE on none', I.ss === 0); must('G06 80 lanes', S.lanes.ssA === 80); }
{ const I = gget('G07').laneStats.ieee.ssA; must('G07 IEEE hits 180/150/310 of 400', I.lav === 180 && I.ss === 150 && I.metal === 310 && I.n === 400); }
{ const I = gget('G09').laneStats.ieee.ssA; must('G09 SS = IEEE on all 2690, Lavapipe on none, Metal on none', I.ss === 2690 && I.lav === 0 && I.metal === 0); }
{ const S = gget('G01').laneStats; must('G01 Metal = SS-x64 on every differing lane', S.metal.ssX.withSS === 3670 && !S.metal.ssX.withLav && !S.metal.ssX.withNeither && !S.metal.ssX.withBoth); must('G01 only accepted/accepted or indeterminate/indeterminate', Object.keys(S.cat.ssX).every((c) => c === 'accepted/accepted' || c === 'indeterminate/indeterminate')); }
for (const id of ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'G09']) for (const o of ['ssA', 'ssX']) must(`${id} ${o}: CTS category identical for Lavapipe and SS on every differing lane`, Object.keys(gget(id).laneStats.cat[o]).every((c) => c.split('/')[0] === c.split('/')[1]));
must('rejected = 0 for every backend and group (lane level)', Object.values(LANE.groups).every((gr) => Object.values(gr.perBackendCat).every((c) => !c.rejected)));
must('no rejected lane in sampled suite examples', Object.values(SUX).every((v) => !Object.keys(v.kinds).some((k) => k.endsWith(':rejected'))));
must('G08 SS exact on all', LANE.accuracy.mod.ssA.nonexactLanes === 0 && LANE.accuracy.mod.lav.nonexactLanes === 4420);
must('G04 SS max abs err 1.88e-4', Math.abs(LANE.accuracy.sin.ssA.maxAbsErr - 1.88e-4) < 1e-5);
must('G02 12 full tests SS-x64 only', (TESTS.full.G02 ?? []).every((t) => t.pattern === 'PPPPF') && TESTS.full.G02.length === 12);
must('S4 8 tests: Lavapipe and SS fail, Metal passes', (TESTS.full.S4 ?? []).length === 8 && TESTS.full.S4.every((t) => t.pattern === 'PFFFF'));
must('experiments E1,E2,E3,E4,E5 accepted for all backends where bounded', EXP.filter((e) => /E[1-5]-/.test(e.id) && !e.desc.includes('overflows')).every((e) => Object.values(e.verdicts).every((v) => v.cat !== 'rejected')));


const CMP = '' + new URL('../../../results/phase2/compare/', import.meta.url).pathname + '';
const PAIRS = { 'lav-vs-ssArm64': 'examples-lavapipe-vs-swiftshader-arm64.json', 'lav-vs-ssX64-7763': 'examples-lavapipe-vs-swiftshader-x64-7763.json', 'lav-vs-ssX64-9V45': 'examples-lavapipe-vs-swiftshader-x64-9V45.json', 'metal-vs-lav': 'examples-metal-vs-lavapipe-arm64.json', 'metal-vs-ssArm64': 'examples-metal-vs-swiftshader-arm64.json' };
const EXC = Object.fromEntries(Object.entries(PAIRS).map(([k, f]) => [k, JSON.parse(fs.readFileSync(CMP + f, 'utf8')).tests]));
const exTests = Object.keys(EXC['lav-vs-ssArm64']); const EXMAP = { 'default/probability': 'G04', 'default/mnist-inference': 'G10', 'nof16/mnist-inference': 'G05', 'default/prefix-scan': 'timing-only' };
const examples = exTests.map((t) => { const row = { test: t, equal: Object.fromEntries(Object.entries(EXC).map(([k, v]) => [k, v[t]?.equal])), group: EXMAP[t] ?? 'none (identical)' };
  if (t === 'default/probability') { row.detail = Object.fromEntries(Object.entries(EXC).map(([k, v]) => [k, Object.fromEntries(Object.entries(v[t].perDistribution).filter(([, d]) => d.differ).map(([n, d]) => [n, `${d.differ}/${d.maxUlp}ulp`]))])); row.invariant = INVAR; }
  if (t.endsWith('mnist-inference')) row.detail = Object.fromEntries(Object.entries(EXC).map(([k, v]) => [k, { default: v[t].detail.default.maxAbsLogitDiff, argmaxEqual: v[t].detail.default.argmaxA === v[t].detail.default.argmaxB, f16Flags: v[t].flags }]));
  if (t === 'default/prefix-scan') row.detail = 'result "Tests succeeded." on all backends; only the ms timing field differs'; return row; });


const EXR = readJson(new URL('../../../results/examples/results.json', import.meta.url).pathname); const TRI = J('examples-triple.json');
const EXCAT = { 'algorithms/jump-flood-distance': 'X1', 'rendering/suika-sdf': 'X1', 'algorithms/mnist-inference': 'X2', 'image-processing/monocular-light-injection': 'X2', 'algorithms/bitonic-sort': 'X3', 'tests/prng-cpu-gpu': 'X4', 'tests/uniformity': 'X4',
  'rendering/3d-fish': 'X5', 'threejs/attractors': 'X5', 'threejs/compute-particles': 'X5', 'simulation/slime-mold': 'X5' };
const XCLASS = {
  X1: { title: 'F32_MAX written into a 16-bit float storage texture (jump-flood-distance; per WS-EX also the suika-sdf distance texture): Metal/Lavapipe store 0x7bff (65504), SwiftShader NaN 0x7fff, then saturate(NaN)=0 turns the whole canvas navy vs cream', kind: 'spec-indeterminate behaviour relied on by the example (backend-numerics difference in an unconstrained domain)', oracle: 'WGSL 17.2 texel formats: write value of a 16float channel is quantizeToF16(T); quantizeToF16 (17.5.47): "If e is outside the finite range of binary16 ... the result is an indeterminate value" (shader-creation error only for const-expressions)', strict: 'indeterminate', correctnessVsSpec: false, note: 'Neither 65504 nor NaN is spec-violating; the example is non-portable. Local material is the WGSL spec only: a WebGPU-level clamp/inf rule for texture stores was not available here -> UNVERIFIED beyond WGSL. suika-sdf: the example dir has no F32_MAX literal (value may come from a library); cause taken from WS-EX, not re-verified.' },
  X2: { title: 'shader-f16 optional feature: Metal and Lavapipe take the f16 path, SwiftShader falls back to f32 (mnist-inference, monocular-light-injection; also log-test lines)', kind: 'capability difference (feature absent), not numerics', oracle: 'none needed; WS-EX: with f16 hidden WGSL is identical on all backends for all 87 examples and mnist logits differ <= 4.6e-4 relative', strict: 'capability-gap', correctnessVsSpec: false, note: 'Same root cause as G10.' },
  X3: { title: 'bitonic-sort: Lavapipe is the lone outlier (workload size derived from adapter limits)', kind: 'example/environment dependence (limits-dependent workload), not numerics', oracle: 'none (integer example; Phase-2 15-example run had it identical on all backends at the fixed test size)', strict: 'indeterminate', correctnessVsSpec: false, note: 'Per WS-EX the sizes come from the adapter limits; not re-verified here (hypothesis H7).' },
  X4: { title: 'prng-cpu-gpu / uniformity: BPETER PRNG = fract(cos(a)*136.8168): differs between ALL pairs (also Metal vs Lavapipe, 99.6% of words differ)', kind: 'relies on an unconstrained domain: cos accuracy is defined only on [-pi, pi]; the factor 136.8 plus fract amplifies any cos difference (even in-domain, CTS allows +-5e-4 -> +-0.07 in the fract input)', oracle: 'real CTS cosInterval: bounded only inside [-pi, pi], unbounded (indeterminate) for 100.123 and 12345.678 (E11)', strict: 'indeterminate', correctnessVsSpec: false, note: 'Integer PRNGs (xoroshiro, LCG) are bit-identical everywhere; the argument magnitude of BPETER in the example was not instrumented (hypothesis H8). uniformity: cause not isolated by WS-EX (sign-of-zero ruled out).' },
  X5: { title: 'chaotic amplification of last-bit differences in iterated simulations (3d-fish, attractors, compute-particles, slime-mold)', kind: 'backend-numerics difference amplified by the example (hypothesis, WS-EX H1)', oracle: 'none directly (no per-step reference); Metal~Lavapipe is already "large" for 3d-fish/attractors/compute-particles', strict: 'indeterminate', correctnessVsSpec: false, note: 'Would be settled by running 1-3 steps and comparing against an f64 model.' },
  X6: { title: 'SwiftShader lone outlier, small differences (tiny Metal~Lavapipe, small SS): react/confetti, react/spinning-triangle, cubemap-reflection, phong-reflection, ray-marching, stencil, vaporrave, boids, simulation/confetti, wind-map, sdf-docs-examples, threejs/varyings', kind: 'backend-numerics difference inside spec (hypothesis: SwiftShader sin/cos/pow error G04, plus rasteriser/sampler differences for the 3-4 examples with no direct transcendental call)', oracle: 'signature matches G04 (SwiftShader sin/cos error ~2e-4, Lavapipe = Metal) but no per-example oracle; static std usage: 9 of 12 call sin/cos/pow/exp/atan2 directly', strict: 'both-fine (hypothesis, unverified per example)', correctnessVsSpec: false, note: 'All have <1% of pixels differing by >2/255 (severity s) or tiny.' },
  X7: { title: 'repeat-to-repeat nondeterminism at cp3 on at least one backend: jelly-slider (SwiftShader), jelly-switch (Lavapipe, SwiftShader), compute-particles-snow (Metal) - async races/timers or chaotic state', kind: 'example/test nondeterminism - cross-backend differences for these cannot be attributed to backends', oracle: 'WS-EX determinism check (run1 vs run2 readbacks): see per-example flags', strict: 'indeterminate', correctnessVsSpec: false, note: 'WS-EX H3.' },
  X8: { title: 'remaining all-differ examples with small/moderate canvas/texture differences on every pair (rasterisation, transcendental and sampler last-bit differences)', kind: 'backend-numerics difference (unattributed, hypothesis WS-EX H2)', oracle: 'none per example', strict: 'indeterminate', correctnessVsSpec: false, note: '' },
};
const detRaw = (ex, b) => EXR.examples[ex]?.backends?.[b]?.determinism; const detOf = (ex, b) => { const d = detRaw(ex, b); return d === undefined ? '?' : typeof d === 'string' ? d : `differs@cp${d.differs.join(',')}`; };
const exRows = []; const sevOf = (r) => `${r.ml}${r.ms}${r.ls}`;
for (const [grp, list] of Object.entries(TRI.cp3)) for (const r of list) { if (grp === 'all_agree') continue; const det = ['metal', 'lavapipe', 'swiftshader'].map((b) => detOf(r.ex, b) ?? '?'); const nondet = det.some((d) => d.includes('cp3') && !d.includes('cp30') || /cp3(,|$)/.test(d));
  let cls = EXCAT[r.ex]; if (!cls) cls = nondet ? 'X7' : grp === 'ss_lone' ? 'X6' : 'X8'; if (nondet && !['X1', 'X2', 'X3', 'X4'].includes(cls)) cls = 'X7'; exRows.push({ ex: r.ex, triple: grp, sev: sevOf(r) + ' (M~L,M~S,L~S)', determinism: det.join(' / '), wgslSame: r.wgslSame.join(','), cls }); }
const xCount = {}; for (const r of exRows) addInto(xCount, r.cls);
const xTotals = { examplesAllThree: 87, compared: Object.values(TRI.cp3).reduce((a, l) => a + l.length, 0), cp3: Object.fromEntries(Object.entries(TRI.cp3).map(([k, v]) => [k, v.length])), notComparable: TRI.notComparable.length, byClass: xCount, specViolationsEstablished: 0, falseReds: 0, exclusiveFailures: 0 };
const appendix = { source: 'results/examples/results.json (WS-EX, DONE), RESULTS.md, REPORT.md; recomputed three-way analysis in examples-triple.json', totals: xTotals, classes: XCLASS, rows: exRows };

const strictCls = (g) => g.strict; const buckets = ['lavapipe-outlier', 'ss-outlier', 'both-fine', 'both-off', 'indeterminate', 'capability-gap'];
const tot = { unweighted: Object.fromEntries(buckets.map((b) => [b, 0])), weighted: Object.fromEntries(buckets.map((b) => [b, 0])), groups: G.length };
for (const g of G) { tot.unweighted[strictCls(g)]++; tot.weighted[strictCls(g)] += g.relevance.score; }
const LEAN = { G01: 'mixed/none', G02: 'ss-leaning-off', G03: 'mixed/none', G04: 'ss-leaning-off', G05: 'mixed/none', G06: 'ss-leaning-off', G07: 'mixed/none', G08: 'lavapipe-leaning-off', G09: 'mixed/none', G10: 'n/a', G11: 'lavapipe-leaning-off', G12: 'ss-leaning-off', G13: 'ss-leaning-off', G14: 'ss-leaning-off', G15: 'lavapipe-leaning-off', G16: 'mixed/none' };
const leanKey = (g) => LEAN[g.id];
const lean = { unweighted: {}, weighted: {} }; for (const g of G) { const k = leanKey(g); g.leanClass = k; addInto(lean.unweighted, k); addInto(lean.weighted, k, g.relevance.score); }
const out = { schema: 'adj-scoreboard/1', generatedBy: 'tools/build-scoreboard.mjs', categories: 'accepted/rejected/indeterminate/unverified keep their Phase-1 meaning; strict outcome uses authoritative oracles only (spec rule, real CTS interval); lean = non-authoritative reference (IEEE value, Metal, f64 error)', groups: G, shared: SHARED, examples, appendixExamples: appendix, totals: { strict: tot, lean }, checks: chk, inputs: { lanes: 'lane-adjudication.json', tests: 'tests-inventory.json', experiments: 'experiments.json', suiteExamples: 'suite-examples-oracle.json', usage: 'typegpu-usage.json' } };
fs.writeFileSync(path.join(ADJ, 'scoreboard.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ strict: tot, lean }, null, 1)); for (const g of G) console.log(g.id, g.strict.padEnd(16), g.leanClass.padEnd(22), 'rel', g.relevance.score, JSON.stringify(g.tests), g.laneStats ? lanesStr(g.laneStats) : '');

const cut = (t, n = 150) => (t.length > n ? t.slice(0, n - 1) + '...' : t); const esc = (t) => String(t).replace(/\|/g, '/');
const L = []; const P = (x = '') => L.push(x);
P('# WS-ADJ scoreboard - who is the outlier where Lavapipe and SwiftShader disagree (criterion C4, truth proximity)');
P(); P('Generated by `tools/build-scoreboard.mjs` from `lane-adjudication.json`, `tests-inventory.json`, `experiments.json`, `suite-examples-oracle.json`, `typegpu-usage.json` (all in this directory). Machine-readable twin: `scoreboard.json`. Frozen Phase-1/2 data was only read.');
P(); P('## Method (fixed before the totals were computed)');
P('- **Oracle order** per root cause: (1) spec-defined result or WGSL/IEEE rule; (2) the real CTS interval (`third_party/cts-oracle.cjs`, frozen evaluator `judge()`; categories keep the Phase-1 meaning: accepted = inside a bounded interval, rejected = outside, indeterminate = NaN operand or unbounded interval, unverified = no result); (3) Metal result as a **non-authoritative** real-GPU reference; (4) none (UNVERIFIED). "accepted" is never written as "correct", green is not correct and red is not defect.');
P('- **Strict outcome** uses only (1)+(2): `lavapipe-outlier` / `ss-outlier` (the backend is rejected by the oracle or violates a spec rule while the other is not), `both-fine` (both accepted / spec-permitted), `both-off`, `indeterminate` (no authoritative oracle decides), `capability-gap` (one backend cannot run the code at all; no verdict possible).');
P('- **Lean** (informational, level 3): the side that disagrees with the references that agree with each other (f64/IEEE value and Metal; "Metal neither" is neutral) is `*-leaning-off`; if the two references point to different sides it is `mixed/none`. It is never an outlier verdict.');
P('- **Relevance** (0-3, hand-assigned from `typegpu-usage.json`, scan of the pristine snapshot `TypeGPU checkout e893ad11`: 97 docs examples + library packages): 3 = behaviour is exercised by many examples/libs and visible in outputs or the suite cannot run; 2 = widely used function, differences are last-bit only; 1 = function used but the diverging behaviour is a domain edge / exotic input; 0 = no known use. Weighted totals sum these scores per outcome.');
P('- **Scope**: lane groups A-D, L (195 210 lanes x Lavapipe, SS-arm64 [LLVM], SS-x64 [Subzero], Metal), 1 433 investigation-suite tests (30 differ on some backend), 426 full-suite tests (55 differ), 13 docs-example tests. Sample-based items are marked.');
P(); P('## Headline');
P(`- Lane level: **rejected = 0 on all four backends** (Lavapipe, SS-arm64, SS-x64, Metal) in all 195 210 lanes; every lane where Lavapipe and a SwiftShader variant differ in value has the **same CTS category on both sides** (accepted/accepted or indeterminate/indeterminate). The CTS interval therefore cannot name an outlier at lane level (checked in code: see \`checks\` in scoreboard.json).`);
P(`- Sampled suite lanes (asin/acos/mix/mix_s/fract examples, ${(() => { const st = new Set(); for (const [k, v] of Object.entries(SUX)) for (const l of v.lanes) st.add(JSON.stringify([k.split('|')[0], k.split('|')[1].split(':')[0], l.a, l.gpu])); return st.size; })()} distinct backend/function/lane combinations): 0 rejected on Lavapipe, SwiftShader and Metal.`);
const T = out.totals.strict, LN = out.totals.lean;
P(); P('### Totals over the ' + G.length + ' Lavapipe != SwiftShader root-cause groups');
P('| outcome (strict: authoritative oracles only) | unweighted | weighted by TypeGPU relevance |'); P('|---|---|---|');
for (const b of buckets) P(`| ${b} | ${T.unweighted[b]} | ${T.weighted[b]} |`);
P(`| total | ${G.length} | ${G.reduce((a, g) => a + g.relevance.score, 0)} |`);
P(); P('| lean (level-3 references: IEEE/f64 value + Metal) | unweighted | weighted |'); P('|---|---|---|');
for (const b of ['ss-leaning-off', 'lavapipe-leaning-off', 'mixed/none', 'n/a']) P(`| ${b} | ${LN.unweighted[b] ?? 0} | ${LN.weighted[b] ?? 0} |`);
P(); P('Reading: no authoritative oracle makes either software backend an outlier. Where the references can still say something, SwiftShader leans off in more groups (and in the highest-relevance one, sin/cos, plus the f16 capability gap), Lavapipe in fewer, lower-relevance ones (mod, asin/acos, atan2 origin). The lean column is a tie-breaker for C4, not a truth claim.');
P(); P('## Scoreboard');
P('| id | root cause | affected | Lavapipe | SS-arm64 | SS-x64 | oracle | strict | lean | conf. | rel. |'); P('|---|---|---|---|---|---|---|---|---|---|---|');
for (const g of G) P(`| ${g.id} | ${esc(g.title)} | ${esc(cut(g.affected, 130))} | ${esc(cut(g.verdict.lavapipe, 120))} | ${esc(cut(g.verdict.ssArm64, 120))} | ${esc(cut(g.verdict.ssX64, 120))} | ${esc(cut(g.oracle, 100))} | ${g.strict} | ${g.leanClass} | ${esc(cut(g.confidence, 40))} | ${g.relevance.score} |`);
P(); P('## Per-group detail');
for (const g of G) { P(`### ${g.id} - ${g.title}`); P(`- affected: ${g.affected}`); P(`- Lavapipe: ${g.verdict.lavapipe}`); P(`- SwiftShader arm64 (LLVM): ${g.verdict.ssArm64}`); P(`- SwiftShader x64 (Subzero): ${g.verdict.ssX64}`); P(`- oracle: ${g.oracle}`); P(`- strict: **${g.strict}**; lean: ${g.lean}; confidence: ${g.confidence}`);
  if (g.laneStats) { P(`- lanes differing from Lavapipe: ${lanesStr(g.laneStats)}; CTS category pairs (Lavapipe/SS) vs arm64: ${catStr(g.laneStats, 'ssA')}; vs x64: ${catStr(g.laneStats, 'ssX')}`); P(`- proximity: ${g.proximity}`); }
  if (g.tests.suites || g.tests.full) P(`- tests changing status (pattern = Metal,Lavapipe-arm64,SS-arm64,Lavapipe-x64,SS-x64; P pass F fail S skip): suites ${g.tests.suites}, full ${g.tests.full}; patterns ${JSON.stringify(g.testPatterns)}`);
  P(`- TypeGPU relevance: **${g.relevance.score}** - ${g.relevance.rationale}${Object.keys(g.relevance.functions).length ? '. Uses (docs examples / library packages): ' + Object.entries(g.relevance.functions).map(([f, u]) => `${f} ${u.examples}/${u.libs}`).join(', ') : ''}`); if (g.note) P(`- note: ${g.note}`); P(); }
P('## Shared divergences (Lavapipe = SwiftShader, Metal differs) - not part of the totals'); P();
for (const sh of SHARED) { P(`- **${sh.id}** ${sh.title}. Evidence: ${sh.evidence}. Reading: ${sh.verdict}. Tests: ${JSON.stringify(sh.tests)}`); }
P(); P('## Docs examples (13 tests, 16 incl. no-f16 variants) - existing Phase-2 runs'); P('| example test | Lav vs SS-arm64 | Lav vs SS-x64 (2 CPUs) | Metal vs Lav | Metal vs SS-arm64 | root cause |'); P('|---|---|---|---|---|---|');
for (const e of examples) P(`| ${e.test} | ${e.equal['lav-vs-ssArm64'] ? 'identical' : 'differs'} | ${e.equal['lav-vs-ssX64-7763'] && e.equal['lav-vs-ssX64-9V45'] ? 'identical' : 'differs'} | ${e.equal['metal-vs-lav'] ? 'identical' : 'differs'} | ${e.equal['metal-vs-ssArm64'] ? 'identical' : 'differs'} | ${e.group} |`);
const pe = examples.find((e) => e.test === 'default/probability');
P(); P(`- probability: Lavapipe-vs-Metal max ${JSON.stringify(pe.detail['metal-vs-lav'])}; SS-arm64-vs-Metal ${JSON.stringify(pe.detail['metal-vs-ssArm64'])}. Math invariant (|v| = 1 on unit-circle/sphere samples, no backend data needed): max | |v|-1 | = Metal ${INVAR.metal.onUnitCircle.maxAbsDev.toExponential(2)}, Lavapipe ${INVAR.lavapipeArm64.onUnitCircle.maxAbsDev.toExponential(2)}, SS-arm64 ${INVAR.swiftshaderArm64.onUnitCircle.maxAbsDev.toExponential(2)}, SS-x64 ${INVAR.swiftshaderX64.onUnitCircle.maxAbsDev.toExponential(2)} (circle); sphere SS ${INVAR.swiftshaderArm64.onUnitSphere.maxAbsDev.toExponential(2)}. The SS error is within the sin/cos CTS bound (2^-11) but three orders above the other two.`);
P('- mnist-inference (default): Lavapipe and Metal take the shader-f16 path, SwiftShader cannot (G10); logits differ <= 0.02, argmax identical on all backends. With f16 hidden (nof16) logits differ <= 6e-6 and argmax is identical (last-bit differences, G05). prefix-scan: result string identical, only timing differs.');
P('- All integer/boolean/self-checking examples are identical on all backends and architectures (bitonic-sort, prefix-scan result, prng-cpu-gpu, matrix-*, dispatch, increment, tgsl-parsing-test, concurrent-chart, jump-flood-voronoi, log-test).');
P(); P('## Targeted oracle experiments (`experiments.json`, tool `tools/experiments.mjs`)'); P('| id | probe | interval(s) | verdicts |'); P('|---|---|---|---|');
for (const e of EXP) P(`| ${e.id} | ${esc(cut(e.desc, 100))} | ${esc(e.intervals.map((i) => '[' + i.join(', ') + ']').join(' / ').slice(0, 90))} | ${Object.entries(e.verdicts).map(([b, v]) => `${b}=${v.value} ${v.cat}`).join('; ')} |`);
P(); P('## Appendix: WS-EX example divergences (fold-in done 2026-10-19)'); P('Source: WS-EX (`results/examples/results.json`, 97 examples x Metal / Lavapipe arm64 / SwiftShader arm64, TypeGPU HEAD e893ad11, 2 repeats, checkpoint cp3 primary). x86_64 is not covered by WS-EX. Three-way analysis recomputed by `tools/examples-triple.mjs` (reproduces WS-EX: 34 / 16 / 1 / 36). Not part of the 16-group totals above (those are lane/test root causes); examples are scored here by whether the divergence is a **backend-numerics difference**, an **example/test nondeterminism / environment dependence**, a **capability difference**, or an **actual correctness difference vs spec**.');
P(); P(`- 87 examples ran on all three backends (10 need unavailable APIs on all three); 0 validation errors/crashes, 0 false reds vs Metal, 0 exclusive failures. cp3 three-way (agree = identical or tiny): all agree ${xTotals.cp3.all_agree}, **SwiftShader lone outlier ${xTotals.cp3.ss_lone}**, **Lavapipe lone outlier ${xTotals.cp3.lav_lone}**, Metal lone ${xTotals.cp3.metal_lone}, all differ ${xTotals.cp3.all_differ} (10 not comparable).`);
P('- **Actual correctness differences vs spec established: 0.** Every divergence falls into: spec-indeterminate behaviour, within-spec numerics, capability, nondeterminism/environment, or unattributed (hypothesis). Strict categories: no example has a spec-defined result that a backend violates; where the oracle applies (F32_MAX -> f16, cos domain) the spec says indeterminate/unbounded.');
P('- Reading for C4: "SwiftShader lone outlier in 16 vs Lavapipe 1" is real, but only 2 of the 16 are spec-indeterminate numerics-visible (X1), 2 are the f16 capability gap (X2), and 12 are small differences whose signature matches SwiftShader sin/cos error (G04, hypothesis). The Lavapipe-lone one (bitonic-sort) is environment dependence, not numerics.');
P(); P('| class | what | kind | oracle / evidence | strict | #examples |'); P('|---|---|---|---|---|---|');
for (const [k, c] of Object.entries(XCLASS)) P(`| ${k} | ${esc(c.title)} | ${esc(c.kind)} | ${esc(c.oracle)} | ${c.strict} | ${xCount[k] ?? 0} |`);
P(); for (const [k, c] of Object.entries(XCLASS)) if (c.note) P(`- ${k}: ${c.note}`);
P(); P('| example | three-way (cp3) | severity M~L,M~S,L~S | determinism M/L/S | class |'); P('|---|---|---|---|---|');
for (const r of exRows.sort((a, b) => a.cls.localeCompare(b.cls) || a.ex.localeCompare(b.ex))) P(`| ${r.ex} | ${r.triple} | ${r.sev} | ${r.determinism} | ${r.cls} |`);
P(); P('Other WS-EX probe results used: sign of zero `-(+0)` = -0 on Metal and Lavapipe, +0 on SwiftShader (WGSL: "Implementations may ignore the sign field of a floating point zero" -> spec-permitted, same cause as G03); game-of-life Phase-2 "Metal discrepancy" explained as naive (dead border) vs tiled/bitpacked (wrap), identical on all backends.');
P('Added hypotheses: H7 bitonic-sort workload depends on adapter limits (WS-EX, not re-verified); H8 BPETER sees cos arguments outside [-pi, pi] in these examples (not instrumented); X6/X8 causes are unattributed per example - settle by per-example substitution runs (replace std.sin/cos with a high-accuracy implementation on SwiftShader and re-compare).');
fs.writeFileSync(path.join(ADJ, 'SCOREBOARD.md'), L.join('\n') + '\n');
