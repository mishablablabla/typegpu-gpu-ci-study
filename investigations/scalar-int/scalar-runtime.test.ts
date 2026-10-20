import { beforeAll, describe, expect, it, vi } from 'vitest';
import { d } from 'typegpu';
import { type Any, MAX, MIN, UMAX, gpuMap, cpuMap, fnWgsl } from './lib.ts';
import { saveEvidence } from './evidence.ts';
import { OPS, TERNARY, UNARY, type Op } from './ops.ts';
import { type SweepResult, divModelAllows, makeRows, modModelAllows, sweepOp } from './sweep.ts';

const ALL: Op[] = [...OPS, ...UNARY.filter((o) => o.name !== 'd.i32(a) / d.u32(a) identity'), ...TERNARY];
type Key = string;
const key = (op: Op, T: string): Key => `${op.name} | ${T}`;
const isShift = (op: Op) => op.name.includes('<<') || op.name.includes('>>');
const S: Record<Key, { grid: SweepResult; random: SweepResult }> = {};
const get = (name: string, T: 'i32' | 'u32') => S[`${name} | ${T}`]!;
const POW53 = 2n ** 53n;
const evidence: Any = { scalarMulStored: {}, divF32Ulp: {}, u32BitwiseCpu: {} };

beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  for (const op of ALL) for (const T of op.types) {
    const nin = op.ins(T).length, sh = isShift(op);
    const gridRows = makeRows(T, nin, sh, 0, 1);
    const grid = await sweepOp(op, T, gridRows, true);
    const random = await sweepOp(op, T, makeRows(T, nin, sh, 20000, 20260101).slice(gridRows.length), true);
    S[key(op, T)] = { grid, random };
  }
}, 900000);

const strip = (r: SweepResult) => { const { rows: _rows, ...rest } = r; return rest; };
const rowsOf = (r: SweepResult) => r.rows!.rows.map((row, i) => ({ row, o: r.rows!.oracle[i]!, c: r.rows!.cpu[i]!, g: r.rows!.gpu[i]! }));

describe('[WGSL] GPU runtime equals the BigInt oracle for every op that TypeGPU emits as a plain WGSL operator/builtin', () => {
  const exactNames = ALL.filter((o) => !['std.mod', 'T(a / b)', 'std.div -> T', 'a / b -> f32'].includes(o.name));
  for (const op of exactNames) for (const T of op.types) {
    it(`${op.name} ${T}: grid + random, wrap-around / div-by-zero / INT_MIN rules`, () => {
      const s = S[key(op, T)]!;
      expect(s.grid.gpuErr).toBeUndefined();
      expect(s.grid.gpuVsOracle.mismatches, JSON.stringify(s.grid.gpuVsOracle.samples)).toBe(0);
      expect(s.random.gpuVsOracle.mismatches, JSON.stringify(s.random.gpuVsOracle.samples)).toBe(0);
    });
  }
});

describe('[expected difference] CPU scalar ints are plain JS numbers: no wrap-around, CPU == GPU modulo 2^32', () => {
  for (const name of ['a + b', 'a - b', 'std.add', 'std.sub', 'x += b', 'x -= b', 'x++', 'x--', '-a', 'std.neg', 'std.abs'])
    for (const T of ['i32', 'u32'] as const) {
      if (!S[`${name} | ${T}`]) continue;
      it(`${name} ${T}: every CPU/GPU difference is an out-of-range integer whose 32-bit wrap equals the GPU value`, () => {
        for (const r of [get(name, T).grid, get(name, T).random]) {
          expect(r.cpuVsOracle.nonInteger).toBe(0);
          expect(r.cpuVsOracle.inRangeButDifferent).toBe(0);
          expect(r.cpuStoredVsOracle.mismatches).toBe(0);
        }
        if (!(name === 'std.abs' && T === 'u32')) expect(get(name, T).grid.cpuVsOracle.mismatches).toBeGreaterThan(0);
      });
    }
  for (const T of ['i32', 'u32'] as const)
    for (const name of ['a * b', 'std.mul', 'x *= b']) {
      it(`${name} ${T}: CPU product is an out-of-range integer; once stored (wrapped) it is wrong exactly when the exact product exceeds 2^53 (f64 precision), see integer-mul/ defect #1 for vectors`, () => {
        const s = get(name, T);
        let wrongStored = 0, wrongStoredBelow53 = 0, wrongStoredAbove53 = 0;
        for (const r of [s.grid, s.random]) {
          expect(r.cpuVsOracle.nonInteger).toBe(0);
          for (const { row, o, c } of rowsOf(r)) {
            const stored = T === 'i32' ? Math.trunc(c as number) | 0 : Math.trunc(c as number) >>> 0;
            if (stored !== o) { wrongStored++; const ex = BigInt(row[0]!) * BigInt(row[1]!); if ((ex < 0n ? -ex : ex) > POW53) wrongStoredAbove53++; else wrongStoredBelow53++; }
          }
        }
        expect(wrongStoredBelow53).toBe(0);
        expect(wrongStoredAbove53).toBe(wrongStored);
        expect(wrongStored).toBeGreaterThan(0);
        evidence.scalarMulStored[`${name} ${T}`] = { wrongStored, wrongStoredAbove53 };
      });
    }
});

describe('[expected difference] division by zero and INT_MIN / -1 (WGSL runtime: x/0 = x, x%0 = 0, MIN/-1 = MIN, MIN%-1 = 0)', () => {
  for (const T of ['i32', 'u32'] as const) {
    it(`${T}: CPU a % 0 is NaN and std.intdiv(a, 0) is +-Infinity/NaN; GPU gives the WGSL values`, () => {
      for (const name of ['a % b', 'x %= b', 'std.intdiv']) {
        const rows = rowsOf(get(name, T).grid).filter((x) => x.row[1] === 0);
        expect(rows.length).toBeGreaterThan(0);
        for (const { row, c, g } of rows) {
          if (name === 'std.intdiv') { expect(g).toBe(row[0]); expect(Number.isFinite(c as number)).toBe(false); } else { expect(g).toBe(0); expect(Number.isNaN(c)).toBe(true); }
        }
      }
    });
  }
  it('[WGSL] i32 MIN / -1 = MIN and MIN % -1 = 0 on the GPU (std.intdiv, %, /=), CPU gives 2^31 and 0', () => {
    for (const name of ['std.intdiv', 'x /= b']) {
      const r = rowsOf(get(name, 'i32').grid).find((x) => x.row[0] === MIN && x.row[1] === -1)!;
      expect(r.g).toBe(MIN); expect(r.c).toBe(2147483648);
    }
    const r = rowsOf(get('a % b', 'i32').grid).find((x) => x.row[0] === MIN && x.row[1] === -1)!;
    expect(r.g).toBe(0); expect(r.c === 0).toBe(true);
    evidence.minModMinus1 = { cpuIsNegativeZero: Object.is(r.c, -0), gpu: r.g };
  });
});

describe('[TypeGPU] scalar integer `/` and `std.div` are compiled to f32 (documented): GPU conforms to f32(a) / f32(b) within the WGSL accuracy table', () => {
  it('a / b -> f32: GPU result within 4.5 ULP of the real quotient (2.5 ULP division + <=1 ULP per int->f32 conversion, either neighbour allowed by WGSL 15.7.6)', () => {
    for (const T of ['i32', 'u32'] as const) {
      let maxUlp = 0, n = 0;
      for (const r of [get('a / b -> f32', T).grid, get('a / b -> f32', T).random]) for (const { row, g } of rowsOf(r)) {
        const q = row[0]! / row[1]!;
        const ulp = Math.abs(g - q) / (2 ** (Math.max(Math.floor(Math.log2(Math.abs(q) || 1e-300)), -126) - 23));
        maxUlp = Math.max(maxUlp, ulp); n++;
      }
      evidence.divF32Ulp[T] = { rows: n, maxUlp };
      expect(maxUlp).toBeLessThanOrEqual(4.5);
    }
  });
  for (const name of ['T(a / b)', 'std.div -> T'] as const) for (const T of ['i32', 'u32'] as const) {
    it(`${name} ${T}: GPU value is consistent with i32/u32(f32(a)/f32(b)) (model: 2.5 ULP + either int->f32 neighbour + saturating truncation)`, () => {
      let fail = 0, n = 0;
      for (const r of [get(name, T).grid, get(name, T).random]) for (const { row, g } of rowsOf(r)) { n++; if (!divModelAllows(T, row[0]!, row[1]!, g)) fail++; }
      expect(fail).toBe(0); expect(n).toBeGreaterThan(1000);
    });
  }
  it('T(a / b) and std.div -> T give identical GPU results (same compilation)', () => {
    for (const T of ['i32', 'u32'] as const) expect(get('T(a / b)', T).random.rows!.gpu).toEqual(get('std.div -> T', T).random.rows!.gpu);
  });
});

describe('[observation] silent wrong integer quotient on the GPU through the f32 path (quantified)', () => {
  it('exhaustive a,b in 1..2048 (u32): wrong ONLY for exact multiples (a % b == 0); non-multiples are always right; std.mod is wrong on exactly the same rows', async () => {
    const N = 2048, a: number[] = [], b: number[] = [];
    for (let i = 1; i <= N; i++) for (let j = 1; j <= N; j++) { a.push(i); b.push(j); }
    const ins = [{ k: 'u32' as const, values: a }, { k: 'u32' as const, values: b }];
    const run = async (op: Op) => ((await gpuMap(op.fn, ins, 'u32')) as Any).out as number[];
    const divT = await run(OPS.find((o) => o.name === 'T(a / b)')!), mod = await run(OPS.find((o) => o.name === 'std.mod')!), idiv = await run(OPS.find((o) => o.name === 'std.intdiv')!);
    let mult = 0, multWrong = 0, nonWrong = 0, modWrongMult = 0, modWrongNon = 0, idivWrong = 0; const examples: number[][] = [];
    for (let i = 0; i < a.length; i++) {
      const x = a[i]!, y = b[i]!, isMult = x % y === 0;
      if (isMult) mult++;
      if (divT[i] !== Math.floor(x / y)) { if (isMult) { multWrong++; if (examples.length < 6) examples.push([x, y, divT[i]!]); } else nonWrong++; }
      if (mod[i] !== x % y) { if (isMult) modWrongMult++; else modWrongNon++; }
      if (idiv[i] !== Math.floor(x / y)) idivWrong++;
    }
    evidence.exhaustive2048 = { pairs: a.length, exactMultiples: mult, divWrongOnMultiples: multWrong, divWrongOnNonMultiples: nonWrong, modWrongOnMultiples: modWrongMult, modWrongOnNonMultiples: modWrongNon, intdivWrong: idivWrong, examples };
    expect(nonWrong).toBe(0); expect(modWrongNon).toBe(0); expect(idivWrong).toBe(0);
    expect(multWrong).toBeGreaterThan(0); expect(modWrongMult).toBe(multWrong);
  }, 300000);

  it('error magnitude and frontier of T(a / b): off by 1 for small operands (exact multiples), growing with magnitude; no mismatches at all for |a|,|b| < 2^20 except exact multiples', () => {
    const rep: Any = {};
    for (const name of ['T(a / b)', 'std.mod'] as const) for (const T of ['i32', 'u32'] as const) {
      const r = get(name, T).random; let wrong = 0, wrongNonMult = 0, wrongNonMultBelow2p20 = 0, maxErr = 0, minNonMultBits = 99;
      for (const { row, o, g } of rowsOf(r)) {
        if (g === o) continue;
        wrong++; maxErr = Math.max(maxErr, Math.abs(g - o));
        if (row[0]! % row[1]! !== 0) { wrongNonMult++; const bits = Math.max(Math.abs(row[0]!), Math.abs(row[1]!)).toString(2).length; minNonMultBits = Math.min(minNonMultBits, bits); if (bits <= 20) wrongNonMultBelow2p20++; }
      }
      rep[`${name} ${T}`] = { n: r.n, wrong, wrongRate: wrong / r.n, wrongOnNonMultiples: wrongNonMult, smallestBitLengthOfWrongNonMultiple: minNonMultBits, maxAbsErr: maxErr, grid: { n: get(name, T).grid.n, wrong: get(name, T).grid.gpuVsOracle.mismatches } };
      if (name === 'T(a / b)') expect(wrongNonMultBelow2p20).toBe(0);
    }
    evidence.divFrontier = rep;
  });

  it('INT_MIN / -1 and large quotients saturate: T(a / b) i32 gives 2147483520 (largest f32 below 2^31), WGSL integer division would give INT_MIN', () => {
    const r = rowsOf(get('T(a / b)', 'i32').grid).find((x) => x.row[0] === MIN && x.row[1] === -1)!;
    evidence.intMinOverMinus1 = { gpu: r.g, cpuRaw: r.c, wgslIntegerDivision: MIN };
    expect(r.g).toBe(2147483520);
    const m = rowsOf(get('T(a / b)', 'i32').grid).find((x) => x.row[0] === MAX && x.row[1] === 1)!;
    expect(m.g).toBe(2147483520);
  });

  it('GPU zero divisor on the f32 path: T(a / b) with b = 0 -> saturated value, while `x /= b` and std.intdiv give a (WGSL integer rule)', async () => {
    const f = OPS.find((o) => o.name === 'T(a / b)')!, g2 = OPS.find((o) => o.name === 'x /= b')!;
    const ins = [{ k: 'i32' as const, values: [7, -7, 0] }, { k: 'i32' as const, values: [0, 0, 0] }];
    const viaF32 = ((await gpuMap(f.fn, ins, 'i32')) as Any).out, viaInt = ((await gpuMap(g2.fn, ins, 'i32')) as Any).out;
    evidence.zeroDivisor = { 'T(a / b)': viaF32, 'x /= b': viaInt, inputs: ins[0]!.values };
    expect(viaInt).toEqual([7, -7, 0]);
    expect(viaF32).toEqual([2147483520, -2147483648, -2147483648]);
  });
});

describe('[PROBABLE DEFECT S1] scalar integer std.mod goes through f32 and returns wrong remainders', () => {
  it.fails('std.mod(a, b) on i32/u32 should equal the truncated remainder (as `%` and vector mod do): std.mod(47, 47) is 47 on the GPU, not 0', () => {
    for (const T of ['i32', 'u32'] as const) {
      const bad = rowsOf(get('std.mod', T).grid).filter((x) => x.g !== x.o);
      expect(bad.length, `${T}: ${JSON.stringify(bad.slice(0, 3))}`).toBe(0);
    }
  });
  it('[observation] frequency and shape: result outside [0, |b|) occurs; std.mod is wrong for exact multiples at any size and for most large operands (>= 2^24)', () => {
    const rep: Any = {};
    for (const T of ['i32', 'u32'] as const) {
      const r = get('std.mod', T); let outsideRange = 0, n = 0;
      for (const { row, g } of [...rowsOf(r.grid), ...rowsOf(r.random)]) { n++; if (Math.abs(g) >= Math.abs(row[1]!)) outsideRange++; }
      rep[T] = { gridRows: r.grid.n, gridWrong: r.grid.gpuVsOracle.mismatches, randomRows: r.random.n, randomWrong: r.random.gpuVsOracle.mismatches, resultOutsideZeroToAbsB: outsideRange, rowsTotal: n, maxAbsErrRandom: r.random.maxAbsErr, samples: r.random.gpuVsOracle.samples.slice(0, 4) };
    }
    evidence.stdModFrequency = rep;
    expect(rep.i32.randomWrong).toBeGreaterThan(0);
  });
  it('[observation] `a % b` (WGSL integer %) is exact; vector mod is exact; so the same remainder has two GPU answers depending on spelling', () => {
    for (const T of ['i32', 'u32'] as const) expect(get('a % b', T).random.gpuVsOracle.mismatches).toBe(0);
  });
  it('[observation] zero divisor: std.mod(7, 0) on the GPU is an indeterminate-looking f32->int conversion of NaN (not the WGSL integer rule 0)', async () => {
    const f = OPS.find((o) => o.name === 'std.mod')!;
    const out = ((await gpuMap(f.fn, [{ k: 'i32', values: [7, -7, MAX] }, { k: 'i32', values: [0, 0, 0] }], 'i32')) as Any).out;
    evidence.stdModZero = { inputs: [7, -7, MAX], gpu: out };
    expect(out.length).toBe(3);
  });
});

describe('[PROBABLE DEFECT S2] compound `x /= b` on integers bypasses the f32 policy (inconsistent with `/` and std.div, CPU keeps a fraction)', () => {
  it('[TypeGPU] WGSL text: `x /= b` is emitted as integer /=, `x = x / b` as i32(f32(x) / f32(b))', () => {
    const a = fnWgsl((a: Any, b: Any) => { 'use gpu'; let x = a; x /= b; return x; }, ['i32', 'i32'], 'i32');
    const b = fnWgsl((a: Any, b: Any) => { 'use gpu'; let x = a; x = x / b; return x; }, ['i32', 'i32'], 'i32');
    evidence.compoundDivWgsl = { 'x /= b': a, 'x = x / b': b };
    expect(a).toContain('x /= b');
    expect(b).toContain('i32((f32(x) / f32(b)))');
  });
  it('[observation] GPU `x /= b` vs GPU `x = x / b`: different results (zero divisor, INT_MIN / -1, exact multiples)', async () => {
    const f = (a: Any, b: Any) => { 'use gpu'; let x = a; x = x / b; return x; };
    const rows = [[7, 0], [MIN, -1], [47, 47], [MAX, 3], [100, 7]];
    const ins = [{ k: 'i32' as const, values: rows.map((r) => r[0]!) }, { k: 'i32' as const, values: rows.map((r) => r[1]!) }];
    const viaOp = ((await gpuMap(f, ins, 'i32')) as Any).out, viaAssign = ((await gpuMap(OPS.find((o) => o.name === 'x /= b')!.fn, ins, 'i32')) as Any).out;
    evidence.compoundDivDiffers = { rows, 'x = x / b': viaOp, 'x /= b': viaAssign };
    expect(viaOp).not.toEqual(viaAssign);
  });
  it.fails('`x /= b` and `x = x / b` should behave the same on the GPU (documented: all divisions are f32-wrapped)', async () => {
    const f = (a: Any, b: Any) => { 'use gpu'; let x = a; x = x / b; return x; };
    const rows = [[47, 47], [MAX, 3], [MIN, -1]];
    const ins = [{ k: 'i32' as const, values: rows.map((r) => r[0]!) }, { k: 'i32' as const, values: rows.map((r) => r[1]!) }];
    expect(((await gpuMap(OPS.find((o) => o.name === 'x /= b')!.fn, ins, 'i32')) as Any).out).toEqual(((await gpuMap(f, ins, 'i32')) as Any).out);
  });
  it('[expected difference] CPU `x /= 2` leaves 3.5 (like `/`), so `x /= 2; x *= 2` is 7 on the CPU and 6 on the GPU', async () => {
    const f = (a: Any, _b: Any) => { 'use gpu'; let x = a; x /= 2; x *= 2; return x; };
    const cpu = f(7, 0), gpu = ((await gpuMap(f, [{ k: 'i32', values: [7] }, { k: 'i32', values: [0] }], 'i32')) as Any).out[0];
    evidence.compoundDivSequence = { cpu, gpu };
    expect(cpu).toBe(7); expect(gpu).toBe(6);
  });
});

describe('[PROBABLE DEFECT S3] u32 bitwise results on the CPU are signed int32 (negative when bit 31 is set)', () => {
  for (const name of ['a & b', 'a | b', 'a ^ b', '~a', 'a << b', 'a <<= b', 'a &= b', 'a |= b', 'a ^= b']) {
    it(`${name} u32: CPU result is congruent to the GPU/oracle value modulo 2^32 but negative when bit 31 is set (outside the u32 domain)`, () => {
      const s = get(name, 'u32'); let neg = 0, nonCongruent = 0, n = 0;
      for (const r of [s.grid, s.random]) for (const { o, c } of rowsOf(r)) { n++; if (typeof c === 'number' && c !== o) { if (c < 0) neg++; if (((c % 2 ** 32) + 2 ** 32) % 2 ** 32 !== o) nonCongruent++; } }
      evidence.u32BitwiseCpu[name] = { rows: n, cpuNegative: neg };
      expect(nonCongruent).toBe(0); expect(neg).toBeGreaterThan(0);
    });
  }
  it('[observation] realistic impact: an xorshift32 hash written with `^`, `<<`, `>>>` (pattern used by the repo examples) is congruent on CPU and GPU, but d.f32(h) / 2^32 is negative on the CPU for about half of the seeds', async () => {
    const hash = (a: Any) => { 'use gpu'; let x = a; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x; };
    const unit = (a: Any) => { 'use gpu'; let x = a; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return d.f32(x) / 4294967296; };
    const seeds = Array.from({ length: 2000 }, (_, i) => (i * 2654435761 + 12345) >>> 0 || 1);
    const gh = ((await gpuMap(hash, [{ k: 'u32', values: seeds }], 'u32')) as Any).out as number[], gu = ((await gpuMap(unit, [{ k: 'u32', values: seeds }], 'f32')) as Any).out as number[];
    let congruent = 0, cpuNeg = 0, gpuNeg = 0, unitNegCpu = 0;
    seeds.forEach((sd, i) => { const c = hash(sd); if (((c % 2 ** 32) + 2 ** 32) % 2 ** 32 === gh[i]) congruent++; if (c < 0) cpuNeg++; if (gh[i]! < 0) gpuNeg++; if (unit(sd) < 0) unitNegCpu++; if (gu[i]! < 0) gpuNeg++; });
    evidence.xorshift = { seeds: seeds.length, congruent, cpuHashNegative: cpuNeg, cpuUnitNegative: unitNegCpu, gpuNegative: gpuNeg };
    expect(congruent).toBe(seeds.length); expect(gpuNeg).toBe(0); expect(unitNegCpu).toBeGreaterThan(seeds.length / 4);
  });
  it('[observation] same ops on i32 agree exactly on CPU and GPU', () => {
    for (const name of ['a & b', 'a | b', 'a ^ b', '~a', 'a << b', 'a >> b (i32)', 'a &= b', 'a |= b', 'a ^= b']) {
      const s = get(name, 'i32'); expect(s.grid.cpuVsGpuRaw.mismatches).toBe(0); expect(s.random.cpuVsGpuRaw.mismatches).toBe(0);
    }
  });
  it.fails('CPU u32 `a & b`, `a | b`, `a ^ b`, `~a`, `a << b` should stay in [0, 2^32) like the GPU (e.g. (0x80000000 & 0x80000000) > 0)', () => {
    const f = (a: Any, b: Any) => { 'use gpu'; return a & b; };
    expect(f(0x80000000, 0x80000000)).toBeGreaterThan(0);
  });
  it('[TypeGPU] u32 `>>` is deprecated in favour of `>>>` (CPU `>>` is an arithmetic shift: wrong value, not only wrong range); `>>>` matches the GPU', () => {
    const dep = get('a >> b (u32, deprecated)', 'u32'), logical = get('a >>> b (u32)', 'u32');
    expect(dep.random.cpuStoredVsOracle.mismatches).toBeGreaterThan(0);
    expect(logical.grid.cpuVsGpuRaw.mismatches).toBe(0); expect(logical.random.cpuVsGpuRaw.mismatches).toBe(0);
    expect(get('a >>>= b (u32)', 'u32').random.cpuVsGpuRaw.mismatches).toBe(0);
  });
});

describe('[observation] min / max / clamp / sign are identical on CPU and GPU for all sampled ints', () => {
  for (const name of ['std.min', 'std.max', 'std.clamp', 'std.sign'])
    for (const T of ['i32', 'u32'] as const) {
      if (!S[`${name} | ${T}`]) continue;
      it(`${name} ${T}`, () => { expect(get(name, T).grid.cpuVsGpuRaw.mismatches).toBe(0); expect(get(name, T).random.cpuVsGpuRaw.mismatches).toBe(0); });
    }
  it('std.clamp with low > high: both sides give min(max(e, low), high) (WGSL: result defined for ints)', () => {
    for (const T of ['i32', 'u32'] as const) expect(get('std.clamp', T).grid.cpuVsGpuRaw.mismatches).toBe(0);
  });
});

describe('[expected difference] abs / negation of INT_MIN', () => {
  it('[WGSL] GPU: -MIN = MIN, abs(MIN) = MIN; CPU: +2147483648 (out of i32)', () => {
    for (const name of ['-a', 'std.neg', 'std.abs']) {
      const r = rowsOf(get(name, 'i32').grid).find((x) => x.row[0] === MIN)!;
      expect(r.g).toBe(MIN); expect(r.c).toBe(2147483648);
    }
  });
});

describe('evidence', () => {
  it('writes results.json (runtime sweeps)', () => {
    const out: Any = {};
    for (const [k, v] of Object.entries(S)) out[k] = { grid: strip(v.grid), random: strip(v.random) };
    saveEvidence('runtime', { sampling: 'grid = boundary lists IV/UV (+SH for shifts); random = 20000 rows, magnitude band uniform in 0..31/32 bits, seed 20260101', sweeps: out, evidence });
    for (const k of Object.keys(S)) expect(S[k]!.grid.gpuErr).toBeUndefined();
  });
});
