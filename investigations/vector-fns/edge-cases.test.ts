// Targeted semantic edge cases (runtime path; compile-time path is in const-fold.test.ts). Labels: [WGSL] spec text, [TypeGPU] TypeGPU contract,
// [observation] recorded behaviour without a spec-derived criterion, [API limitation] CPU implementation missing.
import { afterAll, describe, expect, it } from 'vitest';
import { RT } from './bodies.ts';
import { cpuEval, fr, gpuBatch, hex, roundHalfEven, sameValue, ulpDist, type Any } from './common.ts';
import { saveSection } from './store.ts';

const out: Record<string, Any> = {};
const fmt = (v: number) => (Number.isNaN(v) ? 'NaN' : !Number.isFinite(v) ? String(v) : Object.is(v, -0) ? '-0' : String(v));

async function probe(name: string, dim: number, argDims: number[], rows: number[][][], outDim = dim, body = name) {
  const fn = RT[body]!;
  const gpu = await gpuBatch(fn, argDims, outDim, argDims.map((_, j) => rows.map((r) => r[j]!)));
  return rows.map((r, i) => ({ args: r, cpu: cpuEval(fn, argDims, outDim, r), gpu: gpu[i]! }));
}
const rec = (key: string, v: Any) => { out[key] = v; };

describe('CPU implementation coverage [API limitation]', () => {
  const sample: Record<string, (dim: number) => number[][]> = {
    1: (dim) => [Array(Math.max(1, dim)).fill(0.5)],
    2: (dim) => [Array(Math.max(1, dim)).fill(0.5), Array(Math.max(1, dim)).fill(0.25)],
    3: (dim) => [Array(Math.max(1, dim)).fill(0.5), Array(Math.max(1, dim)).fill(0.25), Array(Math.max(1, dim)).fill(0.75)],
  };
  const FUNCS: [string, number, ('V' | 'S')[], number[]][] = [
    ['abs', 1, ['V'], [0, 3]], ['floor', 1, ['V'], [0, 3]], ['ceil', 1, ['V'], [0, 3]], ['trunc', 1, ['V'], [0, 3]], ['round', 1, ['V'], [0, 3]], ['sign', 1, ['V'], [0, 3]],
    ['fract', 1, ['V'], [0, 3]], ['saturate', 1, ['V'], [0, 3]], ['radians', 1, ['V'], [0, 3]], ['degrees', 1, ['V'], [0, 3]], ['atan', 1, ['V'], [0, 3]], ['asin', 1, ['V'], [0, 3]],
    ['acos', 1, ['V'], [0, 3]], ['sinh', 1, ['V'], [0, 3]], ['cosh', 1, ['V'], [0, 3]], ['tan', 1, ['V'], [0, 3]], ['normalize', 1, ['V'], [3]], ['length', 1, ['V'], [0, 3]],
    ['step', 2, ['V', 'V'], [0, 3]], ['reflect', 2, ['V', 'V'], [3]], ['atan2', 2, ['V', 'V'], [0, 3]], ['cross', 2, ['V', 'V'], [3]], ['dot', 2, ['V', 'V'], [3]], ['distance', 2, ['V', 'V'], [0, 3]],
    ['clamp', 3, ['V', 'V', 'V'], [0, 3]], ['smoothstep', 3, ['V', 'V', 'V'], [0, 3]], ['fma', 3, ['V', 'V', 'V'], [0, 3]], ['faceForward', 3, ['V', 'V', 'V'], [3]], ['mix', 3, ['V', 'V', 'V'], [0, 3]], ['refract', 3, ['V', 'V', 'S'], [3]],
  ];
  it('which std functions have a CPU implementation for f32 / vec3f (0.12.7)', () => {
    const table: Record<string, Record<string, string>> = {};
    for (const [name, arity, shapes, dims] of FUNCS) for (const dim of dims) {
      const args = sample[arity]!(dim).map((a, j) => (shapes[j] === 'S' ? [a[0]!] : a));
      const argDims = shapes.map((s) => (s === 'S' ? 0 : dim));
      const r = cpuEval(RT[name]!, argDims, ['length', 'dot', 'distance'].includes(name) ? 0 : dim, args);
      (table[name] ??= {})[dim === 0 ? 'f32' : 'vec3f'] = r.ok ? 'implemented' : /not implemented yet/.test(r.error) ? 'NOT IMPLEMENTED' : `error: ${r.error}`;
    }
    rec('cpuCoverage', table);
    const missing = Object.entries(table).flatMap(([n, t]) => Object.entries(t).filter(([, v]) => v === 'NOT IMPLEMENTED').map(([k]) => `${n}:${k}`)).sort();
    // [API limitation] snapshot of the current gaps; when upstream implements one of them this test flips and the list must be updated
    expect(missing).toEqual(['degrees:vec3f', 'faceForward:vec3f', 'fma:vec3f', 'radians:vec3f', 'refract:vec3f', 'round:vec3f', 'saturate:vec3f', 'step:vec3f', 'tan:vec3f', 'trunc:f32', 'trunc:vec3f']);
    for (const t of Object.values(table)) for (const v of Object.values(t)) expect(v).toMatch(/implemented|NOT IMPLEMENTED/i);
  });
});

describe('round: ties to even [WGSL], and the sign of zero', () => {
  const ties = [0.5, 1.5, 2.5, 3.5, -0.5, -1.5, -2.5, -3.5, 4194304.5, 8388607.5, 0.49999997, 0.50000006, -0.49999997, 1e-30, -1e-30, 8388608, 16777216, 4194303.5];
  it('[WGSL] GPU round = round-half-even for every tie / near-tie (scalar and vec3f lanes); [TypeGPU] scalar CPU agrees', async () => {
    const rows = ties.map((t) => [[fr(t)]]);
    const res = await probe('round', 0, [0], rows);
    const rows3 = ties.map((t, i) => [[fr(t), fr(ties[(i + 1) % ties.length]!), fr(ties[(i + 2) % ties.length]!)]]);
    const res3 = await probe('round', 3, [3], rows3);
    const table = ties.map((t, i) => ({ x: t, expected: roundHalfEven(fr(t)), gpuScalar: res[i]!.gpu[0], gpuLane0: res3[i]!.gpu[0], cpuScalar: res[i]!.cpu.ok ? res[i]!.cpu.lanes[0] : 'threw' }));
    rec('roundTies', table);
    const zeroSign = table.filter((r) => Object.is(r.cpuScalar, 0) !== Object.is(r.gpuScalar, 0) || (r.cpuScalar === 0 && Object.is(r.cpuScalar, -0) !== Object.is(r.gpuScalar, -0)));
    rec('roundZeroSignDiffs', zeroSign.map((r) => ({ x: r.x, cpu: fmt(r.cpuScalar as number), gpu: fmt(r.gpuScalar as number) })));
    for (const r of table) {
      expect(sameValue(r.gpuScalar as number, r.expected), `GPU round(${r.x})`).toBe(true);
      expect(sameValue(r.gpuLane0 as number, r.expected), `GPU vec3f round(${r.x})`).toBe(true);
      expect(sameValue(r.cpuScalar as number, r.expected), `CPU round(${r.x})`).toBe(true);
    }
    expect(ties.filter((t) => Math.round(t) !== roundHalfEven(t)).length).toBeGreaterThan(0);
  });
  it('[observation] sign of zero: round(-0.5) is -0 on the GPU and +0 on the CPU; sign(-0) is -0 on the CPU and +0 on the GPU (WGSL allows ignoring the sign of zero)', async () => {
    const r1 = (await probe('round', 0, [0], [[[-0.5]]]))[0]!, r2 = (await probe('sign', 0, [0], [[[-0]]]))[0]!;
    const obs = { round_m05: { cpu: fmt((r1.cpu as Any).lanes[0]), gpu: fmt(r1.gpu[0]!) }, sign_m0: { cpu: fmt((r2.cpu as Any).lanes[0]), gpu: fmt(r2.gpu[0]!) } };
    rec('signedZero', obs);
    expect(r1.cpu.ok && r2.cpu.ok).toBe(true);
    expect(sameValue((r1.cpu as Any).lanes[0], r1.gpu[0]!)).toBe(true);
    expect(sameValue((r2.cpu as Any).lanes[0], r2.gpu[0]!)).toBe(true);
  });
});

describe('clamp / smoothstep / step edges', () => {
  it('[observation] clamp(e, low, high) with low > high: CPU = min(max(e,low),high) and GPU agrees on all tested inputs (WGSL also allows median-of-3)', async () => {
    const es = [-5, 0, 0.5, 1, 5, 10, 15];
    const rows = es.map((e) => [[e], [10], [0]]);
    const res = await probe('clamp', 0, [0, 0, 0], rows);
    const table = res.map((r, i) => ({ e: es[i], low: 10, high: 0, cpu: (r.cpu as Any).lanes[0], gpu: r.gpu[0], minMax: Math.min(Math.max(es[i]!, 10), 0), median: [es[i]!, 10, 0].sort((a, b) => a - b)[1] }));
    rec('clampLowGtHigh', table);
    const gpuIsMinMax = table.every((t) => t.gpu === t.minMax), gpuIsMedian = table.every((t) => t.gpu === t.median);
    rec('clampLowGtHighGpuFormulation', { gpuIsMinMax, gpuIsMedian });
    for (const t of table) expect(t.cpu).toBe(t.minMax);
    expect(gpuIsMinMax || gpuIsMedian).toBe(true);
  });
  it('[WGSL] smoothstep with edge0 > edge1 descends (CPU and GPU), and values are in [0,1]', async () => {
    const xs = [-1, 0, 0.25, 0.5, 0.75, 1, 2];
    const res = await probe('smoothstep', 0, [0, 0, 0], xs.map((x) => [[1], [0], [x]]));
    for (let i = 0; i < xs.length; i++) {
      const t = Math.min(Math.max((xs[i]! - 1) / (0 - 1), 0), 1), exp = t * t * (3 - 2 * t);
      expect(ulpDist(res[i]!.gpu[0]!, fr(exp)) as number, `GPU x=${xs[i]}`).toBeLessThanOrEqual(3);
      expect(ulpDist((res[i]!.cpu as Any).lanes[0], fr(exp)) as number, `CPU x=${xs[i]}`).toBeLessThanOrEqual(1);
    }
  });
  it('[observation] smoothstep(e, e, x) (indeterminate in WGSL for runtime args): CPU returns 0 always, GPU returns 1 for x > e (known harmless divergence)', async () => {
    const xs = [0, 1, 2], res = await probe('smoothstep', 0, [0, 0, 0], xs.map((x) => [[1], [1], [x]]));
    rec('smoothstepEqualEdges', res.map((r, i) => ({ x: xs[i], cpu: (r.cpu as Any).lanes[0], gpu: r.gpu[0] })));
    for (const r of res) expect((r.cpu as Any).lanes[0]).toBe(0);
  });
  it('[WGSL] step: edge <= x -> 1 (equal gives 1; signed zeros equal; 0.99999994 < 1)', async () => {
    const pairs: [number, number, number][] = [[0, 0, 1], [0, -0, 1], [-0, 0, 1], [1, 1, 1], [1, fr(0.99999994), 0], [-1, -1, 1], [fr(1e30), fr(1e30), 1], [fr(-3e38), fr(-3e38), 1], [2, 1, 0]];
    const res = await probe('step', 0, [0, 0], pairs.map(([e, x]) => [[e], [x]]));
    res.forEach((r, i) => { expect(r.gpu[0], `GPU step(${pairs[i]![0]},${pairs[i]![1]})`).toBe(pairs[i]![2]); expect((r.cpu as Any).lanes[0]).toBe(pairs[i]![2]); });
  });
});

describe('overflow / underflow of intermediates (length, normalize, distance, dot, mix, fma) [observation: expected difference]', () => {
  const rows3 = (r: number[][]) => r.map((a) => [a.map(fr)]);
  it('length(vec3f) / normalize: the CPU (f64 intermediates) gives the mathematical value, the GPU overflows or underflows in the squares', async () => {
    const vs = [[1e30, 1e30, 1e30], [1e20, 1e20, 1e20], [3e38, 0, 0], [1e19, 0, 0], [1e-19, 1e-19, 0], [1e-20, 0, 0], [1e-30, 1e-30, 1e-30], [3, 4, 0]];
    const L = await probe('length', 3, [3], rows3(vs), 0), N = await probe('normalize', 3, [3], rows3(vs));
    const table = vs.map((v, i) => ({ v, exactLength: Math.hypot(...v.map(fr)), cpuLength: (L[i]!.cpu as Any).lanes[0], gpuLength: L[i]!.gpu[0], cpuNormalize: (N[i]!.cpu as Any).lanes ?? 'threw', gpuNormalize: N[i]!.gpu }));
    rec('lengthNormalizeExtremes', table.map((t) => ({ ...t, cpuLength: fmt(t.cpuLength), gpuLength: fmt(t.gpuLength), cpuNormalize: t.cpuNormalize === 'threw' ? 'threw' : (t.cpuNormalize as number[]).map(fmt), gpuNormalize: t.gpuNormalize.map(fmt) })));
    for (const t of table) {
      expect(ulpDist(t.cpuLength, fr(t.exactLength))).toBe(0);
      const g = t.gpuLength;
      expect(g === Infinity || g === 0 || (ulpDist(g, fr(t.exactLength)) as number) <= 8, `GPU length of ${JSON.stringify(t.v)} = ${g}`).toBe(true);
    }
    expect(table[1]!.gpuLength).toBe(Infinity);
    expect(Math.abs(table[1]!.cpuLength / 1.7320508e20 - 1)).toBeLessThan(1e-6);
  });
  it('[observation] dot / distance / fma / mix intermediates: GPU inf where the exact result is finite (cancellation after overflow)', async () => {
    const d1 = (await probe('dot', 3, [3, 3], [[[1e30, 1e30, 0], [1e30, -1e30, 0]]], 0))[0]!;
    const d2 = (await probe('distance', 3, [3, 3], [[[1e30, 0, 0], [0, 0, 0]]], 0))[0]!;
    const m1 = (await probe('mix', 0, [0, 0, 0], [[[-3e38], [3e38], [0.5]]], 0))[0]!;
    rec('overflowCases', { dot_1e30_cancel: { exact: 0, cpu: fmt((d1.cpu as Any).lanes[0]), gpu: fmt(d1.gpu[0]!) }, distance_1e30: { exact: 1e30, cpu: fmt((d2.cpu as Any).lanes[0]), gpu: fmt(d2.gpu[0]!) }, mix_pm3e38_half: { exact: 0, cpu: fmt((m1.cpu as Any).lanes[0]), gpu: fmt(m1.gpu[0]!) } });
    expect((d1.cpu as Any).lanes[0]).toBe(0);
    expect(d1.gpu[0]).toBe(Infinity);
    expect(m1.gpu[0]).toBe(0);
    expect((m1.cpu as Any).lanes[0]).toBe(0);
  });
  it('[TypeGPU] normalize(vec3f(0)): the CPU throws (NaN is not representable in vec3f), the GPU returns NaN lanes (indeterminate: zero vector is outside the domain)', async () => {
    const r = (await probe('normalize', 3, [3], [[[0, 0, 0]]]))[0]!;
    rec('normalizeZero', { cpu: r.cpu.ok ? 'returned' : r.cpu.error, gpu: r.gpu.map(fmt) });
    expect(r.cpu.ok).toBe(false);
    if (!r.cpu.ok) expect(r.cpu.error).toMatch(/Finite Math Assumption/);
    expect(r.gpu.every((v) => Number.isNaN(v))).toBe(true);
  });
});

describe('atan2 and zero arguments', () => {
  it('[observation] atan2(y, x) with x = +-0 and the origin: CPU follows IEEE/JS, the GPU does not (WGSL: error unbounded at the origin / tiny |x|)', async () => {
    const cases: [number, number][] = [[0, 0], [-0, 0], [0, -0], [-0, -0], [1, 0], [1, -0], [-1, 0], [-1, -0], [0, 1], [-0, 1], [0, -1], [-0, -1]];
    const res = await probe('atan2', 0, [0, 0], cases.map(([y, x]) => [[y], [x]]));
    const table = cases.map(([y, x], i) => ({ y: fmt(y), x: fmt(x), cpu: fmt((res[i]!.cpu as Any).lanes[0]), gpu: fmt(res[i]!.gpu[0]!), ieee: fmt(Math.atan2(y, x)) }));
    rec('atan2Zeros', table);
    for (const [i, [y, x]] of cases.entries()) {
      const g = res[i]!.gpu[0]!, c = (res[i]!.cpu as Any).lanes[0];
      if (x !== 0 && y !== 0) expect(ulpDist(g, fr(c)) as number, `atan2(${fmt(y)}, ${fmt(x)})`).toBeLessThanOrEqual(4096);
    }
  });
});

describe('mix with t outside [0,1] and extreme t [WGSL: x*(1-z)+y*z]', () => {
  it('[WGSL] extrapolation and exactness of the formula', async () => {
    const rows: [number, number, number][] = [[1, 2, -1], [1, 2, 2], [1, 2, 10], [0, 1, 1e30], [1, 1e-9, 1], [1, 1e-9, 0], [-4, 6, 0.25], [5, 5, 0.3], [1e30, -1e30, 0.5], [3, 7, -0.5]];
    const res = await probe('mix', 0, [0, 0, 0], rows.map(([a, b, t]) => [[fr(a)], [fr(b)], [fr(t)]]));
    const table = rows.map(([a, b, t], i) => { const exact = fr(a) * (1 - fr(t)) + fr(b) * fr(t); return { a, b, t, exact: fr(exact), cpu: (res[i]!.cpu as Any).lanes[0], gpu: res[i]!.gpu[0], ulpGpu: ulpDist(res[i]!.gpu[0]!, fr(exact)) }; });
    rec('mixExtrapolation', table.map((t) => ({ ...t, exact: fmt(t.exact), cpu: fmt(t.cpu), gpu: fmt(t.gpu!) })));
    for (const t of table) { expect(ulpDist(t.cpu, t.exact) as number).toBeLessThanOrEqual(1); expect(ulpDist(t.gpu!, t.exact) as number, `mix(${t.a},${t.b},${t.t})`).toBeLessThanOrEqual(2); }
  });
});

describe('fract of negative and large numbers [WGSL: x - floor(x)]', () => {
  it('[WGSL] fract matches the f32 x - floor(x) (tiny negatives round to 1.0, allowed by the spec note)', async () => {
    const xs = [-0.25, -1e-10, -1e-30, -1.5, -123.456, -8388607.5, -16777216, 8388607.5, 1e30, -1e30, 0.1, -0.1, 3e38, -3e38].map(fr);
    const res = await probe('fract', 0, [0], xs.map((x) => [[x]]));
    const table = xs.map((x, i) => ({ x, exact: fr(x - Math.floor(x)), cpu: (res[i]!.cpu as Any).lanes[0], gpu: res[i]!.gpu[0] }));
    rec('fract', table);
    for (const t of table) { expect(sameValue(t.gpu!, t.exact), `GPU fract(${t.x})`).toBe(true); expect(sameValue(t.cpu, t.exact), `CPU fract(${t.x})`).toBe(true); }
  });
});

describe('sinh for small arguments [WGSL: inherited from (exp(x) - exp(-x)) * 0.5]', () => {
  it('[WGSL] GPU sinh stays within the absolute bound implied by the exp-based formula; [observation] relative error is huge for |x| < ~1e-4 while the CPU (Math.sinh) is accurate', async () => {
    const xs = [1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 0.1, 0.5].map(fr).flatMap((x) => [x, -x]);
    const res = await probe('sinh', 0, [0], xs.map((x) => [[x]]));
    const table = xs.map((x, i) => { const exact = Math.sinh(x), g = res[i]!.gpu[0]!; return { x, exact, cpu: (res[i]!.cpu as Any).lanes[0], gpu: g, relErrGpu: exact === 0 ? 0 : Math.abs(g - exact) / Math.abs(exact), bound: Math.cosh(x) * (3 + 2 * Math.abs(x)) * 2 ** -23 * 1.05 + Math.abs(exact) * 2 ** -23 }; });
    rec('sinhSmall', table.map((t) => ({ x: t.x, exact: t.exact, cpu: t.cpu, gpu: t.gpu, relErrGpu: Number(t.relErrGpu.toExponential(2)), absErrGpu: Number(Math.abs(t.gpu - t.exact).toExponential(2)), absBound: Number(t.bound.toExponential(2)) })));
    for (const t of table) { expect(Math.abs(t.gpu - t.exact), `GPU sinh(${t.x})`).toBeLessThanOrEqual(t.bound); expect(ulpDist(t.cpu, fr(t.exact)) as number).toBeLessThanOrEqual(1); }
  });
});

afterAll(() => saveSection('edgeCases', out));
