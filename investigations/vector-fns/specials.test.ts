import { afterAll, describe, expect, it } from 'vitest';
import { d } from 'typegpu';
import { RT } from './bodies.ts';
import { cpuEval, fr, gpuBatch, ulpDist, type Any } from './common.ts';
import { SPECS } from './specs.ts';
import { saveSection } from './store.ts';

const S0 = [Infinity, -Infinity, NaN, 0, -0, 1, -1, 0.5, 2.5, 3.4028234663852886e38].map(fr);
const cls = (v: number) => (Number.isNaN(v) ? 'NaN' : v === Infinity ? '+inf' : v === -Infinity ? '-inf' : 'finite');
const fmt = (v: number) => (Number.isNaN(v) ? 'NaN' : !Number.isFinite(v) ? String(v) : Object.is(v, -0) ? '-0' : String(v));
const out: Any = { scalar: {}, vec3: {} };

describe('inf/NaN observations', () => {
  it('[observation] vecNf constructors reject inf/NaN on the CPU [TypeGPU]', () => {
    for (const bad of [Infinity, -Infinity, NaN]) expect(() => d.vec3f(bad, 0, 0)).toThrow(/Finite Math Assumption/);
  });
  for (const spec of SPECS) {
    if (!spec.dims.includes(0)) continue;
    const key = `${spec.name}${spec.body === 'selectS' ? '' : ''}`;
    it(`[observation] ${key}(f32) with inf/NaN: CPU (JS) vs GPU`, async () => {
      const arity = spec.shapes.length;
      const idx: number[][] = arity === 1 ? S0.map((_, i) => [i]) : arity === 2 ? S0.flatMap((_, i) => S0.map((__, j) => [i, j])) : S0.flatMap((_, i) => S0.flatMap((__, j) => [0, 3, 5, 7].map((k) => [i, j, (k + i + j) % S0.length])));
      const rows = idx.map((ix) => ix.map((i) => [S0[i]!]));
      const fn = RT[spec.body ?? spec.name]!, argDims = Array(arity).fill(0);
      const gpu = await gpuBatch(fn, argDims, 0, argDims.map((_, j) => rows.map((r) => r[j]!)));
      const diffs: Any[] = [];
      const counts: Record<string, number> = { rows: rows.length, cpuThrew: 0, sameClassAndValue: 0, nanVsFinite: 0, infVsFinite: 0, finiteDiffer: 0, zeroSignOnly: 0, closeFinite_le4096ulp: 0 };
      rows.forEach((r, i) => {
        const c = cpuEval(fn, argDims, 0, r), g = gpu[i]![0]!;
        if (!c.ok) { counts.cpuThrew!++; return; }
        const cv = c.lanes[0]!, u = ulpDist(cv, g);
        let kind = 'same';
        if (u === 0) { if (Object.is(cv, -0) !== Object.is(g, -0) && cv === 0) { kind = 'zeroSign'; counts.zeroSignOnly!++; } else counts.sameClassAndValue!++; }
        else if (cls(cv) === 'NaN' || cls(g) === 'NaN') { kind = 'nanVsOther'; counts.nanVsFinite!++; }
        else if (cls(cv) !== 'finite' || cls(g) !== 'finite') { kind = 'infVsOther'; counts.infVsFinite!++; }
        else if ((u as number) <= 4096) { kind = 'close'; counts.closeFinite_le4096ulp!++; }
        else { kind = 'finiteDiffer'; counts.finiteDiffer!++; }
        if (kind !== 'same' && kind !== 'zeroSign' && kind !== 'close' && diffs.length < 6) diffs.push({ args: r.map((a) => fmt(a[0]!)), cpu: fmt(cv), gpu: fmt(g), kind });
      });
      out.scalar[key] = { ...counts, examples: diffs };
      expect(counts.rows).toBeGreaterThan(0);
    });
  }
  for (const spec of SPECS) {
    const dim = 3;
    if (!spec.dims.includes(dim)) continue;
    it(`[observation] ${spec.name}(vec3f) with inf/NaN lanes: GPU only`, async () => {
      const arity = spec.shapes.length, n = 120;
      const rows = Array.from({ length: n }, (_, i) => Array.from({ length: arity }, (_, j) => (spec.shapes[j] === 'S' ? [S0[(i * 3 + j) % S0.length]!] : Array.from({ length: 3 }, (_, l) => S0[(i + 3 * j + 7 * l) % S0.length]!))));
      const fn = RT[spec.body ?? spec.name]!, argDims = spec.shapes.map((s) => (s === 'S' ? 0 : dim)), outDim = spec.out === 'S' ? 0 : dim;
      const gpu = await gpuBatch(fn, argDims, outDim, argDims.map((_, j) => rows.map((r) => r[j]!)));
      const cpuThrew = rows.filter((r) => !cpuEval(fn, argDims, outDim, r).ok).length;
      const classes: Record<string, number> = {};
      for (const g of gpu) for (const v of g) classes[cls(v)] = (classes[cls(v)] ?? 0) + 1;
      out.vec3[spec.name] = { rows: n, cpuThrewRows: cpuThrew, gpuResultClasses: classes };
      expect(gpu.length).toBe(n);
    });
  }
});
afterAll(() => saveSection('specials', out));
