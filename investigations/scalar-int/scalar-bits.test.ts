import { beforeAll, describe, expect, it, vi } from 'vitest';
import { d, std } from 'typegpu';
import { type Any, cpuMap, gpuMap, rng } from './lib.ts';
import { saveEvidence } from './evidence.ts';
import { IV, UV } from './sweep.ts';

beforeAll(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
const bits32 = (x: number) => BigInt.asUintN(32, BigInt(x));
const pop = (x: bigint) => { let c = 0; for (let i = 0n; i < 32n; i++) c += Number((x >> i) & 1n); return c; };
const clz = (x: bigint) => { for (let i = 31; i >= 0; i--) if ((x >> BigInt(i)) & 1n) return 31 - i; return 32; };
const ctz = (x: bigint) => { for (let i = 0; i < 32; i++) if ((x >> BigInt(i)) & 1n) return i; return 32; };
const rev = (x: bigint) => { let r = 0n; for (let i = 0n; i < 32n; i++) r |= ((x >> i) & 1n) << (31n - i); return r; };
const flbU = (x: bigint) => (x === 0n ? 0xffffffff : 31 - clz(x));
const flbI = (x: bigint) => { const neg = (x >> 31n) & 1n; const y = neg ? ~x & 0xffffffffn : x; return y === 0n ? -1 : 31 - clz(y); };
const ftb = (x: bigint, T: string) => (x === 0n ? (T === 'u32' ? 0xffffffff : -1) : ctz(x));
const asT = (T: string, v: bigint | number) => Number(T === 'i32' ? BigInt.asIntN(32, BigInt(v)) : BigInt.asUintN(32, BigInt(v)));

const FNS: { name: string; fn: Any; orc: (T: 'i32' | 'u32', x: bigint) => number }[] = [
  { name: 'std.countOneBits', fn: (a: Any) => { 'use gpu'; return std.countOneBits(a); }, orc: (T, x) => asT(T, pop(x)) },
  { name: 'std.countLeadingZeros', fn: (a: Any) => { 'use gpu'; return std.countLeadingZeros(a); }, orc: (T, x) => asT(T, clz(x)) },
  { name: 'std.countTrailingZeros', fn: (a: Any) => { 'use gpu'; return std.countTrailingZeros(a); }, orc: (T, x) => asT(T, ctz(x)) },
  { name: 'std.firstLeadingBit', fn: (a: Any) => { 'use gpu'; return std.firstLeadingBit(a); }, orc: (T, x) => asT(T, T === 'u32' ? flbU(x) : flbI(x)) },
  { name: 'std.firstTrailingBit', fn: (a: Any) => { 'use gpu'; return std.firstTrailingBit(a); }, orc: (T, x) => asT(T, ftb(x, T)) },
  { name: 'std.reverseBits', fn: (a: Any) => { 'use gpu'; return std.reverseBits(a); }, orc: (T, x) => asT(T, rev(x)) },
];
const rows = (T: 'i32' | 'u32') => {
  const r = rng(4242), out = [...(T === 'i32' ? IV : UV)];
  for (let i = 0; i < 5000; i++) {
    const b = Math.floor(r() * 33), m = b === 0 ? 0 : Math.floor(2 ** (b - 1) + r() * 2 ** (b - 1));
    out.push(T === 'i32' ? Math.max(-2147483648, Math.min(2147483647, r() < 0.5 ? -m : m)) : Math.min(m, 4294967295));
  }
  return out;
};
const evidence: Any = {};
describe('[observation] integer bit builtins: GPU == standard definition; no CPU implementation (API limitation)', () => {
  for (const f of FNS) for (const T of ['i32', 'u32'] as const) {
    it(`${f.name} ${T}: GPU matches the oracle on every row; CPU call throws 'not implemented'`, async () => {
      const values = rows(T);
      const g = (await gpuMap(f.fn, [{ k: T, values }], T)) as Any;
      expect(g.error).toBeUndefined();
      let bad = 0; const samples: Any[] = [];
      values.forEach((v, i) => { const o = f.orc(T, bits32(v)); if (g.out[i] !== o) { bad++; if (samples.length < 3) samples.push({ v, o, gpu: g.out[i] }); } });
      evidence[`${f.name} ${T}`] = { rows: values.length, gpuMismatches: bad, samples };
      expect(bad, JSON.stringify(samples)).toBe(0);
      const c = cpuMap(f.fn, [{ k: T, values: [5] }]);
      expect(String(c[0])).toMatch(/CPU implementation for .* not implemented/);
    });
  }
});

describe('[WGSL] bitcast between i32 and u32 (scalar): CPU == GPU == BigInt reinterpretation', () => {
  const toU = (a: Any) => { 'use gpu'; return std.bitcast(d.i32, d.u32)(a); };
  const toI = (a: Any) => { 'use gpu'; return std.bitcast(d.u32, d.i32)(a); };
  it('i32 -> u32', async () => {
    const values = rows('i32'); const g = (await gpuMap(toU, [{ k: 'i32', values }], 'u32')) as Any; const c = cpuMap(toU, [{ k: 'i32', values }]);
    values.forEach((v, i) => { expect(g.out[i]).toBe(Number(bits32(v))); expect(c[i]).toBe(g.out[i]); });
  });
  it('u32 -> i32', async () => {
    const values = rows('u32'); const g = (await gpuMap(toI, [{ k: 'u32', values }], 'i32')) as Any; const c = cpuMap(toI, [{ k: 'u32', values }]);
    values.forEach((v, i) => { expect(g.out[i]).toBe(Number(BigInt.asIntN(32, BigInt(v)))); expect(c[i]).toBe(g.out[i]); });
  });
});
describe('evidence', () => { it('writes results.json (bits)', () => { saveEvidence('bits', evidence); }); });
