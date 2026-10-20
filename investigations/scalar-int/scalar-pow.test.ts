import { beforeAll, describe, expect, it, vi } from 'vitest';
import { std } from 'typegpu';
import { type Any, cpuMap, fnWgsl, gpuMap } from './lib.ts';
import { saveEvidence } from './evidence.ts';

beforeAll(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
const evidence: Any = {};
const ops = { 'a ** b': (a: Any, b: Any) => { 'use gpu'; return a ** b; }, 'std.pow': (a: Any, b: Any) => { 'use gpu'; return std.pow(a, b); } };

describe('[observation] scalar integer pow goes through f32 pow(): exactly representable integer results are not reliably exact on the GPU', () => {
  for (const [name, fn] of Object.entries(ops)) for (const T of ['i32', 'u32'] as const) {
    it(`${name} ${T}: WGSL text i32/u32(pow(f32(a), f32(b))); frequency of wrong results for a in 0..40, b in 0..16 with exact result < 2^31`, async () => {
      const a: number[] = [], b: number[] = [], exact: bigint[] = [];
      for (let x = 0; x <= 40; x++) for (let y = 0; y <= 16; y++) { const e = BigInt(x) ** BigInt(y); if (e < 2n ** 31n && !(x === 0 && y === 0)) { a.push(x); b.push(y); exact.push(e); } }
      const ins = [{ k: T, values: a }, { k: T, values: b }];
      const g = ((await gpuMap(fn, ins, T)) as Any).out as number[], c = cpuMap(fn, ins) as number[];
      let wrong = 0, wrongBelow2p24 = 0, below2p24 = 0, cpuWrong = 0; const samples: Any[] = [];
      exact.forEach((e, i) => {
        const small = e < 2n ** 24n; if (small) below2p24++;
        if (BigInt(g[i]!) !== e) { wrong++; if (small) wrongBelow2p24++; if (samples.length < 6) samples.push({ a: a[i], b: b[i], exact: Number(e), gpu: g[i] }); }
        if (BigInt(c[i]!) !== e) cpuWrong++;
      });
      const zero = ((await gpuMap(fn, [{ k: T, values: [0] }, { k: T, values: [0] }], T)) as Any).out;
      evidence[`${name} ${T}`] = { wgsl: fnWgsl(fn, [T, T], T), rows: exact.length, gpuWrong: wrong, rowsBelow2p24: below2p24, gpuWrongBelow2p24: wrongBelow2p24, cpuWrong, samples, zeroPowZero: { gpu: zero, cpu: Math.pow(0, 0) } };
      expect(evidence[`${name} ${T}`].wgsl).toMatch(/pow\(f32\(a\), f32\(b\)\)/);
      expect(cpuWrong).toBe(0);
      expect(wrong).toBeGreaterThan(0);
    });
  }
});
describe('evidence', () => { it('writes results.json (pow)', () => { saveEvidence('pow', evidence); }); });
