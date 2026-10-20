import { beforeAll, describe, expect, it, vi } from 'vitest';
import { d } from 'typegpu';
import { type Any, MAX, MIN, UMAX, bitsF32, cpuMap, f32Candidates, gpuMap, rng } from './lib.ts';
import { saveEvidence } from './evidence.ts';
import { CONVS } from './ops.ts';
import { IV, SPECIAL_F, UV } from './sweep.ts';

beforeAll(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });

function randF(n: number, seed: number): number[] {
  const r = rng(seed), out: number[] = [];
  for (let i = 0; i < n; i++) { const e = -4 + r() * 44, v = Math.fround((r() < 0.5 ? -1 : 1) * 2 ** e * (1 + r())); if (Number.isFinite(v)) out.push(v); }
  return out;
}
const evidence: Any = {};
const inputsFor = (from: string): number[] => (from === 'f32' ? [...SPECIAL_F, ...randF(20000, 99)] : from === 'i32' ? [...IV, ...randI(20000, 5, true)] : [...UV, ...randI(20000, 6, false)]);
function randI(n: number, seed: number, signed: boolean): number[] {
  const r = rng(seed), out: number[] = [];
  for (let i = 0; i < n; i++) { const bits = Math.floor(r() * (signed ? 32 : 33)); const m = bits === 0 ? 0 : Math.floor(2 ** (bits - 1) + r() * 2 ** (bits - 1)); out.push(signed ? Math.max(MIN, Math.min(MAX, r() < 0.5 ? -m : m)) : Math.min(UMAX, m)); }
  return out;
}
const dawnF2I = (T: 'i32' | 'u32', v: number) => (T === 'i32' ? Math.min(Math.max(Math.trunc(v), MIN), 2147483520) : Math.min(Math.max(Math.trunc(v), 0), 4294967040)) + 0;
const idealF2I = (T: 'i32' | 'u32', v: number) => (T === 'i32' ? Math.min(Math.max(Math.trunc(v), MIN), MAX) : Math.min(Math.max(Math.trunc(v), 0), UMAX)) + 0;

const R: Record<string, { rows: number[]; cpu: (number | string)[]; gpu: number[] }> = {};
beforeAll(async () => {
  for (const c of CONVS) {
    const values = inputsFor(c.from);
    const g = (await gpuMap(c.fn, [{ k: c.from, values }], c.to)) as Any;
    if (g.error) throw new Error(`${c.name}: ${g.error}`);
    R[c.name] = { rows: values, cpu: cpuMap(c.fn, [{ k: c.from, values }]), gpu: g.out };
  }
}, 300000);

describe('[WGSL] i32 <-> u32 conversions reinterpret bits; CPU agrees', () => {
  for (const name of ['d.i32(u32)', 'd.u32(i32)']) it(`${name}: GPU == BigInt reinterpretation and CPU == GPU on all rows`, () => {
    const c = CONVS.find((x) => x.name === name)!, r = R[name]!;
    r.rows.forEach((v, i) => { expect(r.gpu[i]).toBe(c.oracle(v)); expect(r.cpu[i]).toBe(r.gpu[i]); });
  });
});

describe('[WGSL] int -> f32: GPU result is one of the two neighbouring f32 values (spec leaves the choice open); CPU uses round-to-nearest', () => {
  for (const name of ['d.f32(i32)', 'd.f32(u32)']) it(`${name}`, () => {
    const r = R[name]!; let notNearest = 0;
    r.rows.forEach((v, i) => { expect(f32Candidates(v)).toContain(r.gpu[i]); if (r.gpu[i] !== Math.fround(v)) notNearest++; expect(r.cpu[i]).toBe(Math.fround(v)); });
    evidence[`${name} gpuNotNearest`] = { rows: r.rows.length, notNearest };
    expect(notNearest).toBe(0);
  });
});

describe('[observation] f32 -> int conversion on the GPU (Dawn/Metal) saturates to the largest f32 below the type max', () => {
  for (const [name, T] of [['d.i32(f32)', 'i32'], ['d.u32(f32)', 'u32']] as const) it(`${name}: GPU == clamp(trunc(v), lowest, largest f32 below max); differs from the spec-text clamp to the exact type max only for |v| >= 2^31 / 2^32`, () => {
    const r = R[name]!; let vsIdeal = 0; const samples: Any[] = [];
    r.rows.forEach((v, i) => { expect(r.gpu[i], `v=${v}`).toBe(dawnF2I(T, v)); if (r.gpu[i] !== idealF2I(T, v)) { vsIdeal++; if (samples.length < 4) samples.push({ v, gpu: r.gpu[i], specIdeal: idealF2I(T, v) }); } });
    evidence[`${name} gpuVsSpecTextClamp`] = { rows: r.rows.length, differs: vsIdeal, samples };
    expect(vsIdeal).toBeGreaterThan(0);
  });
});

describe('[expected difference] CPU d.i32(f) / d.u32(f) cannot know the source is f32: integers are treated as bit reinterpretation (documented), GPU saturates', () => {
  const categories = (name: string, T: 'i32' | 'u32') => {
    const r = R[name]!, cat: Record<string, number> = {}; const samples: Record<string, Any> = {};
    r.rows.forEach((v, i) => {
      const c = r.cpu[i] as number, g = r.gpu[i]!;
      if (c === g) return;
      const k = T === 'u32' ? (v < 0 ? 'negative f32 -> u32 (CPU reinterprets integral, GPU 0)' : 'f32 >= 2^32 -> u32 (CPU wraps, GPU saturates)') : (v >= 2 ** 31 ? 'f32 >= 2^31 -> i32 (CPU wraps, GPU saturates)' : 'f32 < -2^31 -> i32 (CPU wraps, GPU saturates)');
      cat[k] = (cat[k] ?? 0) + 1; samples[k] ??= { v, cpu: c, gpu: g };
    });
    return { cat, samples, rows: r.rows.length };
  };
  it('d.u32(f32): CPU != GPU only for negative integral values (CPU 4294967295-style reinterpretation, GPU 0) and for values >= 2^32', () => {
    const { cat, samples, rows } = categories('d.u32(f32)', 'u32');
    evidence['d.u32(f32) cpuVsGpu'] = { rows, categories: cat, samples };
    expect(Object.keys(cat).length).toBeGreaterThan(0);
    const r = R['d.u32(f32)']!;
    for (const v of [-0.5, -1.5, -2.5]) { const i = r.rows.indexOf(v); expect((r.cpu[i] as number) === 0).toBe(true); expect(r.gpu[i]).toBe(0); }
    for (const v of [-1]) { const i = r.rows.indexOf(v); expect(r.cpu[i]).toBe(UMAX); expect(r.gpu[i]).toBe(0); }
  });
  it('d.i32(f32): CPU != GPU only for |v| >= 2^31 (CPU wraps like ToInt32, GPU saturates)', () => {
    const { cat, samples, rows } = categories('d.i32(f32)', 'i32');
    evidence['d.i32(f32) cpuVsGpu'] = { rows, categories: cat, samples };
    expect(Object.keys(cat).length).toBeGreaterThan(0);
    const r = R['d.i32(f32)']!;
    r.rows.forEach((v, i) => { if (Math.abs(v) < 2 ** 31 - 128) expect(r.cpu[i], `v=${v}`).toBe(r.gpu[i]); });
  });
  it('[TypeGPU] documented CPU behaviour (data-schemas.mdx, JSDoc): d.u32(31.1)=31, d.u32(-1)=4294967295, d.u32(-3.1)=0, d.i32(-3.9)=-3, d.i32(10000000000)=1410065408', () => {
    expect(d.u32(31.1)).toBe(31); expect(d.u32(-1)).toBe(4294967295); expect(d.u32(-3.1)).toBe(0); expect(d.i32(3.14)).toBe(3); expect(d.i32(-3.9)).toBe(-3); expect(d.i32(10000000000)).toBe(1410065408);
  });
});

describe('[TypeGPU] non-finite values: CPU casts throw (Finite Math Assumption); GPU converts them (observation, indeterminate in WGSL)', () => {
  it('CPU: d.i32/d.u32/d.f32 of NaN, +-Infinity throw FiniteMathAssumptionError', () => {
    for (const f of [d.i32, d.u32, d.f32]) for (const v of [NaN, Infinity, -Infinity]) expect(() => (f as Any)(v)).toThrow(/Finite Math Assumption/);
  });
  it('GPU (observation): i32(NaN) = INT_MIN, u32(NaN) = 0, +inf saturates like a large finite value', async () => {
    const vals = [NaN, Infinity, -Infinity];
    const gi = ((await gpuMap(CONVS.find((c) => c.name === 'd.i32(f32)')!.fn, [{ k: 'f32', values: vals }], 'i32')) as Any).out;
    const gu = ((await gpuMap(CONVS.find((c) => c.name === 'd.u32(f32)')!.fn, [{ k: 'f32', values: vals }], 'u32')) as Any).out;
    evidence.nonFinite = { inputs: ['NaN', '+inf', '-inf'], i32: gi, u32: gu };
    expect(gi.length).toBe(3); expect(bitsF32(0x7fc00000)).toBeNaN();
  });
});

describe('evidence', () => { it('writes results.json (conversions)', () => { saveEvidence('conversions', evidence); }); });
