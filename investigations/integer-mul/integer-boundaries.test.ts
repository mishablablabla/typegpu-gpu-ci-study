import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';
import { root, run, T } from '../../harness.ts';

type Any = any;
const MAX = 2147483647, MIN = -2147483648, UMAX = 4294967295;
const POW53 = 2n ** 53n;

const wrapI = (x: bigint) => Number(BigInt.asIntN(32, x));
const wrapU = (x: bigint) => Number(BigInt.asUintN(32, x));
const expectedOf = (elem: 'i32' | 'u32', a: number, b: number, op: 'mul' | 'add' | 'sub') => {
  const A = BigInt(a), B = BigInt(b);
  const exact = op === 'mul' ? A * B : op === 'add' ? A + B : A - B;
  return { exact, expected: elem === 'i32' ? wrapI(exact) : wrapU(exact) };
};
const cpuModelMul = (elem: 'i32' | 'u32', a: number, b: number) => (elem === 'i32' ? (a * b) | 0 : ((a * b) & 0xffffffff) >>> 0);

interface TD { name: string; lanes: number; elem: 'i32' | 'u32'; schema: Any }
const td = (name: string): TD => ({ name, lanes: name.startsWith('vec') ? Number(name[3]) : 1, elem: name.includes('u') ? 'u32' : 'i32', schema: (d as Any)[name] });
const VEC_TYPES = ['vec2i', 'vec3i', 'vec4i', 'vec2u', 'vec3u', 'vec4u'];

const I_VALUES = [MAX, MIN, -1, 0, 1, 2, 65535, 65536, 46341, -46341, 94906265, 94906266, 94906267, 134217727, 67108865, -2147483647, 3, -3, 1073741824, 7];
const U_VALUES = [UMAX, 4294967294, 2147483648, 2147483647, 0, 1, 2, 65535, 65536, 4294967291, 94906265, 94906266, 94906267, 134217727, 67108865, 3, 7, 1073741824, 3037000499, 2654435761];

function pairRows(values: number[], lanes: number) {
  const n = values.length, a: number[][] = [], b: number[][] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    a.push(Array.from({ length: lanes }, (_, l) => values[(i + l * 3) % n]!));
    b.push(Array.from({ length: lanes }, (_, l) => values[(j + l * 5) % n]!));
  }
  return { a, b };
}

const strideOf = (t: TD) => (t.lanes === 3 ? 4 : t.lanes);
function pack(t: TD, rows: number[][]) {
  const Arr = t.elem === 'i32' ? Int32Array : Uint32Array, stride = strideOf(t), arr = new Arr(rows.length * stride);
  rows.forEach((r, i) => r.forEach((v, k) => { arr[i * stride + k] = v; }));
  return arr;
}
async function gpuMap(fn: Any, inputs: { t: TD; rows: number[][] }[], outT: TD): Promise<number[][]> {
  const dev = root.device as Any, n = inputs[0]!.rows.length;
  const bufs = inputs.map(({ t, rows }) => { const b: Any = root.createMutable(d.arrayOf(t.schema, n)); dev.queue.writeBuffer((root as Any).unwrap(b), 0, pack(t, rows)); return b; });
  const out: Any = root.createMutable(d.arrayOf(outT.schema, n));
  const [x, y] = bufs;
  try {
    (inputs.length === 1
      ? root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(x.$[i]); })
      : root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(x.$[i], y.$[i]); })).dispatchThreads(n);
    const src = (root as Any).unwrap(out) as GPUBuffer;
    const stg = dev.createBuffer({ size: src.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = dev.createCommandEncoder(); enc.copyBufferToBuffer(src, 0, stg, 0, src.size); dev.queue.submit([enc.finish()]);
    await stg.mapAsync(GPUMapMode.READ);
    const arr = new (outT.elem === 'i32' ? Int32Array : Uint32Array)(stg.getMappedRange().slice(0)); stg.unmap(); stg.destroy();
    return Array.from({ length: n }, (_, i) => Array.from({ length: outT.lanes }, (_, k) => arr[i * strideOf(outT) + k]!));
  } finally { for (const b of [...bufs, out]) b.buffer.destroy(); }
}
const make = (t: TD, lanes: number[]) => (t.lanes === 1 ? lanes[0]! : (d as Any)[t.name](...lanes));
function cpuMap(fn: Any, inputs: { t: TD; rows: number[][] }[], outT: TD): (number[] | string)[] {
  return inputs[0]!.rows.map((_, i) => {
    try { const v = fn(...inputs.map(({ t, rows }) => make(t, rows[i]!))); return outT.lanes === 1 ? [Number(v)] : Array.from(v as ArrayLike<number>); }
    catch (e) { return `threw: ${(e as Error).message.split('\n')[0]}`; }
  });
}

const mulFn = (a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); };
const opMulFn = (a: Any, b: Any) => { 'use gpu'; return a * b; };
const addFn = (a: Any, b: Any) => { 'use gpu'; return std.add(a, b); };
const subFn = (a: Any, b: Any) => { 'use gpu'; return std.sub(a, b); };
const negFn = (a: Any) => { 'use gpu'; return std.neg(a); };
const brokenMulFn = (a: Any, b: Any) => { 'use gpu'; return std.add(std.mul(a, b), 1); };

interface Lane { op: string; type: string; row: number; lane: number; a: number; b: number; expected: number; cpu: number | null; gpu: number | null; exactProduct: string; f64ProductExact: boolean; above2pow53: boolean; cpuError?: string }
const mismatches = (lanes: Lane[], who: 'cpu' | 'gpu') => lanes.filter((l) => l[who] !== null && l[who] !== l.expected);

async function evalBinary(op: 'mul' | 'add' | 'sub', fn: Any, typeName: string, values: number[], opName = op): Promise<Lane[]> {
  const t = td(typeName), { a, b } = pairRows(values, t.lanes), ins = [{ t, rows: a }, { t, rows: b }];
  const gpu = await gpuMap(fn, ins, t), cpu = cpuMap(fn, ins, t), lanes: Lane[] = [];
  if (opName === 'mul') gpuMatrix[typeName] = { a, b, gpu };
  a.forEach((ra, r) => ra.forEach((av, l) => {
    const bv = b[r]![l]!, { exact, expected } = expectedOf(t.elem, av, bv, op), c = cpu[r]!;
    lanes.push({ op: opName, type: typeName, row: r, lane: l, a: av, b: bv, expected, cpu: typeof c === 'string' ? null : c[l]!, gpu: gpu[r]![l]!, exactProduct: exact.toString(),
      f64ProductExact: BigInt(Math.trunc(Number(av) * Number(bv))) === exact || op !== 'mul', above2pow53: (exact < 0n ? -exact : exact) > POW53, ...(typeof c === 'string' ? { cpuError: c } : {}) });
  }));
  return lanes;
}

const gpuMatrix: Record<string, { a: number[][]; b: number[][]; gpu: number[][] }> = {};
const evidence: Record<string, Any> = { mulMatrix: {}, related: {}, fractions: {}, named: [], negativeControls: {}, scalarAndMixed: {}, intdiv: {}, divMod: {} };
afterAll(() => {
  const dir = fileURLToPath(new URL('./raw/', import.meta.url)); mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}evidence.json`, JSON.stringify(evidence, null, 1));
  writeFileSync(`${dir}gpu-matrix.json`, JSON.stringify(gpuMatrix));
});

const stats = (lanes: Lane[]) => ({
  lanes: lanes.length, lanesAbove2pow53: lanes.filter((l) => l.above2pow53).length,
  cpuMismatches: mismatches(lanes, 'cpu').length, gpuMismatches: mismatches(lanes, 'gpu').length, cpuThrew: lanes.filter((l) => l.cpuError).length,
  cpuMismatchesWhereF64ProductWasExact: mismatches(lanes, 'cpu').filter((l) => l.f64ProductExact).length,
  cpuMismatchesBelow2pow53: mismatches(lanes, 'cpu').filter((l) => !l.above2pow53).length,
});
const sample = (lanes: Lane[], who: 'cpu' | 'gpu', n = 5) => mismatches(lanes, who).slice(0, n).map(({ a, b, expected, cpu, gpu, exactProduct, type, lane }) => ({ type, lane, a, b, expected, cpu, gpu, exactProduct }));

describe('[reproduction] the reported case, through the PRE-EXISTING harness helpers', () => {
  it('std.mul(vec2i(INT_MAX), vec2i(INT_MAX)): CPU 0, GPU 1, expected 1', async () => {
    const a = d.vec2i(MAX, MAX), cpu = Array.from(std.mul(a, a) as Any);
    const gpu = Array.from((await run(mulFn, [a, a], d.vec2i)) as Any);
    evidence.reported = { inputs: [Array.from(a), Array.from(a)], expected: [wrapI(BigInt(MAX) ** 2n), wrapI(BigInt(MAX) ** 2n)], cpu, gpu, viaHarness: 'harness.ts run()' };
    expect(gpu).toEqual([1, 1]);
    expect(wrapI(BigInt(MAX) ** 2n)).toBe(1);
  });
});

describe('[semantics] what the correct answer is (independent of TypeGPU)', () => {
  it('vec2i components are signed 32-bit; (2^31-1)^2 wraps to 1; INT_MIN*INT_MIN wraps to 0; INT_MIN*-1 wraps to INT_MIN', () => {
    expect(wrapI(BigInt(MAX) * BigInt(MAX))).toBe(1);
    expect(wrapI(BigInt(MIN) * BigInt(MIN))).toBe(0);
    expect(wrapI(BigInt(MIN) * -1n)).toBe(MIN);
    expect(wrapU(BigInt(UMAX) * BigInt(UMAX))).toBe(1);
    expect(BigInt(MAX * MAX)).toBe(4611686014132420608n);
    expect(BigInt(MAX * MAX) === BigInt(MAX) ** 2n).toBe(false);
  });
});

describe.each(VEC_TYPES)('[WGSL semantics] GPU std.mul(%s) conforms; [CPU] characterised', (typeName) => {
  const values = typeName.endsWith('i') ? I_VALUES : U_VALUES;
  let lanes: Lane[];
  it('collect', async () => {
    lanes = await evalBinary('mul', mulFn, typeName, values);
    evidence.mulMatrix[typeName] = { ...stats(lanes), cpuMismatchSamples: sample(lanes, 'cpu'), gpuMismatchSamples: sample(lanes, 'gpu') };
  });
  it('GPU equals the BigInt expectation (32-bit wrap-around) for every lane', () => {
    expect(mismatches(lanes, 'gpu')).toEqual([]);
  });
  it('CPU is always either correct or explained by the hypothesis "ToInt32/ToUint32 of the f64 product"', () => {
    const elem = td(typeName).elem;
    const unexplained = lanes.filter((l) => l.cpu !== null && l.cpu !== l.expected && l.cpu !== cpuModelMul(elem, l.a, l.b));
    expect(unexplained).toEqual([]);
    const explainedAll = lanes.filter((l) => l.cpu !== null).every((l) => l.cpu === cpuModelMul(elem, l.a, l.b));
    evidence.mulMatrix[typeName].cpuEqualsModelForEveryLane = explainedAll;
    expect(explainedAll).toBe(true);
  });
  it('CPU is exact whenever the exact product fits in 2^53 (no defect in that region)', () => {
    expect(lanes.filter((l) => !l.above2pow53 && l.cpu !== l.expected)).toEqual([]);
    expect(lanes.filter((l) => !l.above2pow53).length).toBeGreaterThan(50);
  });
  it('CPU is wrong only where the f64 product was inexact', () => {
    expect(mismatches(lanes, 'cpu').filter((l) => l.f64ProductExact)).toEqual([]);
  });
  it.fails(`[CONFIRMED DEFECT #1] CPU std.mul(${typeName}) equals the 32-bit wrapped product for every lane`, () => {
    expect(mismatches(lanes, 'cpu')).toEqual([]);
  });
});

describe('[CONFIRMED DEFECT #1 — scope] other CPU paths that multiply through f64', () => {
  it('operator `a * b` inside a \'use gpu\' function called on the CPU', async () => {
    const lanes = await evalBinary('mul', opMulFn, 'vec2i', I_VALUES, 'operator*');
    evidence.scalarAndMixed.operatorMulVec2i = { ...stats(lanes), cpuMismatchSamples: sample(lanes, 'cpu', 3) };
    expect(mismatches(lanes, 'gpu')).toEqual([]);
  });
  it.fails('[CONFIRMED DEFECT #1] operator `a * b` (vec2i) on the CPU equals the 32-bit wrapped product', async () => {
    const lanes = await evalBinary('mul', opMulFn, 'vec2i', I_VALUES, 'operator*');
    expect(mismatches(lanes, 'cpu')).toEqual([]);
  });
  const scalarCases: [string, number, number][] = [['i32', MAX, MAX], ['u32', UMAX, UMAX], ['i32', MIN, MIN], ['u32', 2654435761, 747796405]];
  it.each(scalarCases)('explicit cast of a scalar product: %s(std.mul(%d, %d)) — GPU conforms', async (type, a, b) => {
    const cast = type === 'i32' ? (x: Any, y: Any) => { 'use gpu'; return d.i32(std.mul(x, y)); } : (x: Any, y: Any) => { 'use gpu'; return d.u32(std.mul(x, y)); };
    const t = td(type), expected = expectedOf(t.elem, a, b, 'mul').expected;
    const gpu = (await gpuMap(cast, [{ t, rows: [[a]] }, { t, rows: [[b]] }], t))[0]![0]!;
    const cpu = Number(type === 'i32' ? d.i32(std.mul(a, b)) : d.u32(std.mul(a, b)));
    (evidence.scalarAndMixed.explicitCast ??= []).push({ type, a, b, expected, cpu, gpu });
    expect(gpu).toBe(expected);
  });
  it.fails('[CONFIRMED DEFECT #1] CPU d.i32(std.mul(INT_MAX, INT_MAX)) equals the 32-bit wrapped product', () => {
    expect(Number(d.i32(std.mul(MAX, MAX)))).toBe(wrapI(BigInt(MAX) ** 2n));
  });
  it('vector × scalar and scalar × vector: GPU conforms, CPU recorded', async () => {
    const rows: [string, number, number[]][] = [['vec2i', MAX, [MAX, 7]], ['vec2u', UMAX, [UMAX, 7]]];
    for (const [vt, s, v] of rows) {
      const t = td(vt), st = td(vt.endsWith('i') ? 'i32' : 'u32');
      const exp = v.map((x) => expectedOf(t.elem, x, s, 'mul').expected);
      const gpu = (await gpuMap(mulFn, [{ t, rows: [v] }, { t: st, rows: [[s]] }], t))[0]!;
      const cpuVS = Array.from(std.mul(make(t, v), s) as Any), cpuSV = Array.from(std.mul(s, make(t, v)) as Any);
      (evidence.scalarAndMixed.mixed ??= []).push({ type: vt, scalar: s, vector: v, expected: exp, gpu, cpuVectorTimesScalar: cpuVS, cpuScalarTimesVector: cpuSV });
      expect(gpu).toEqual(exp);
    }
  });
});

describe('[related operations] traced separately — no shared defect expected for add / sub / neg', () => {
  const vals = (t: string) => (t.endsWith('i') ? I_VALUES : U_VALUES);
  it.each([['add', addFn], ['sub', subFn]] as const)('%s on all vector types: CPU == GPU == BigInt expectation', async (op, fn) => {
    for (const typeName of VEC_TYPES) {
      const lanes = await evalBinary(op, fn, typeName, vals(typeName));
      evidence.related[`${op}:${typeName}`] = stats(lanes);
      expect(mismatches(lanes, 'cpu'), `${op} ${typeName} cpu`).toEqual([]);
      expect(mismatches(lanes, 'gpu'), `${op} ${typeName} gpu`).toEqual([]);
    }
  });
  it('neg on signed vectors incl. INT_MIN: CPU == GPU == BigInt expectation', async () => {
    for (const typeName of ['vec2i', 'vec3i', 'vec4i']) {
      const t = td(typeName), rows = I_VALUES.map((_, i) => Array.from({ length: t.lanes }, (_, l) => I_VALUES[(i + l * 3) % I_VALUES.length]!));
      const gpu = await gpuMap(negFn, [{ t, rows }], t), cpu = cpuMap(negFn, [{ t, rows }], t);
      const exp = rows.map((r) => r.map((x) => wrapI(-BigInt(x))));
      (evidence.related[`neg:${typeName}`] = { rows: rows.length, cpuEqual: JSON.stringify(cpu) === JSON.stringify(exp), gpuEqual: JSON.stringify(gpu) === JSON.stringify(exp) });
      expect(gpu).toEqual(exp); expect(cpu).toEqual(exp);
    }
  });
});

describe('[expected specification difference] intdiv: scalar-only API; documented CPU formula vs WGSL integer division', () => {
  const cases: [number, number][] = [[7, 2], [-7, 2], [MAX, 1], [MIN, 1], [5, 0], [0, 0], [MIN, -1]];
  it('CPU follows its documented formula trunc(trunc(a)/trunc(b)); GPU follows WGSL (divisor 0 -> dividend, INT_MIN/-1 -> INT_MIN)', async () => {
    const t = td('i32'), rows = cases.map(([a, b]) => ({ a, b }));
    const gpu = await gpuMap((x: Any, y: Any) => { 'use gpu'; return std.intdiv(x, y); }, [{ t, rows: rows.map((r) => [r.a]) }, { t, rows: rows.map((r) => [r.b]) }], t);
    const out = rows.map((r, i) => {
      const cpu = std.intdiv(r.a, r.b);
      const wgsl = r.b === 0 ? r.a : r.a === MIN && r.b === -1 ? MIN : Number(BigInt(r.a) / BigInt(r.b));
      return { a: r.a, b: r.b, cpu: Number.isFinite(cpu) ? cpu : String(cpu) , gpu: gpu[i]![0]!, wgslExpected: wgsl, cpuMatchesDocumentedFormula: cpu === Math.trunc(Math.trunc(r.a) / Math.trunc(r.b)) || Number.isNaN(cpu), cpuEqualsWgsl: cpu === wgsl };
    });
    evidence.intdiv = out;
    for (const r of out) { expect(r.gpu, `gpu ${r.a}/${r.b}`).toBe(r.wgslExpected); expect(r.cpuMatchesDocumentedFormula).toBe(true); }
    expect(out.filter((r) => !r.cpuEqualsWgsl).map((r) => [r.a, r.b])).toEqual([[5, 0], [0, 0], [MIN, -1]]);
  });
  it('intdiv is not available for vectors (signature rejects them) — unsupported, not a defect', async () => {
    let msg = '';
    try { await gpuMap((x: Any, y: Any) => { 'use gpu'; return std.intdiv(x, y); }, [{ t: td('vec2i'), rows: [[1, 1]] }, { t: td('vec2i'), rows: [[1, 1]] }], td('vec2i')); } catch (e) { msg = (e as Error).message.split('\n').slice(0, 3).join(' | '); }
    evidence.intdiv_vectorUnsupported = msg;
    expect(msg).not.toBe('');
  });
});

describe('[div / mod] integer std.div and std.mod: SCALARS compile to f32 operations, VECTORS to integer operations', () => {
  const wgslOf = async (fn: Any, t: TD, a: number[], b: number[]) => {
    const dev = root.device as Any, orig = dev.createShaderModule.bind(dev), code: string[] = [];
    dev.createShaderModule = (x: Any) => { code.push(x.code); return orig(x); };
    try { await gpuMap(fn, [{ t, rows: [a] }, { t, rows: [b] }], t); } finally { dev.createShaderModule = orig; }
    return code.join('\n').split('\n').map((l) => l.trim()).filter((l) => /^return \(/.test(l));
  };
  const divFn = (a: Any, b: Any) => { 'use gpu'; return std.div(a, b); };
  const modFn = (a: Any, b: Any) => { 'use gpu'; return std.mod(a, b); };

  it('records the WGSL that is emitted (scalar i32 vs vec2i)', async () => {
    const scalar = await wgslOf(divFn, td('i32'), [7], [2]), vec = await wgslOf(divFn, td('vec2i'), [7, 7], [2, 2]);
    const vecMod = await wgslOf(modFn, td('vec2i'), [7, 7], [2, 2]);
    evidence.divMod.emittedWgsl = { 'std.div(i32,i32)': scalar, 'std.div(vec2i,vec2i)': vec, 'std.mod(vec2i,vec2i)': vecMod };
    expect(scalar.join(' ')).toMatch(/f32\(/);
    expect(vec.join(' ')).toMatch(/\(a \/ b/);
    expect(vec.join(' ')).not.toMatch(/f32\(/);
  });

  const wgslDiv = (elem: string, a: number, b: number) => (b === 0 || (elem === 'i32' && a === MIN && b === -1) ? a : Number(BigInt(a) / BigInt(b)));
  const wgslMod = (elem: string, a: number, b: number) => (b === 0 || (elem === 'i32' && a === MIN && b === -1) ? 0 : (a % b) + 0);
  for (const [name, fn, oracle] of [['div', divFn, wgslDiv], ['mod', modFn, wgslMod]] as const) {
    describe.each(VEC_TYPES)(`std.${name} on %s`, (typeName) => {
      const t = td(typeName), values = typeName.endsWith('i') ? I_VALUES : U_VALUES;
      it('GPU follows the WGSL integer rules for every lane (incl. divisor 0 and INT_MIN / -1)', async () => {
        const { a, b } = pairRows(values, t.lanes), ins = [{ t, rows: a }, { t, rows: b }];
        const gpu = await gpuMap(fn, ins, t), cpu = cpuMap(fn, ins, t);
        let gpuBad = 0, cpuBad = 0, cpuThrewRows = 0, cpuBadSamples: Any[] = [], lanes = 0;
        a.forEach((ra, r) => ra.forEach((av, l) => {
          const bv = b[r]![l]!, exp = oracle(t.elem, av, bv); lanes++;
          if (gpu[r]![l] !== exp) gpuBad++;
          const c = cpu[r]!; if (typeof c === 'string') return;
          if (c[l] !== exp) { cpuBad++; if (cpuBadSamples.length < 5) cpuBadSamples.push({ a: av, b: bv, expected: exp, cpu: c[l], gpu: gpu[r]![l] }); }
        }));
        cpuThrewRows = cpu.filter((c) => typeof c === 'string').length;
        const threwMsg = cpu.find((c) => typeof c === 'string');
        (evidence.divMod[`${name}:${typeName}`] = { lanes, gpuMismatches: gpuBad, cpuMismatchesInRowsThatDidNotThrow: cpuBad, cpuThrewRows, cpuThrewMessage: threwMsg ?? null, cpuBadSamples });
        expect(gpuBad).toBe(0);
        expect(cpuBad, 'CPU lanes in rows that did not throw').toBe(0);
      });
    });
  }
});

describe('[impact] how much of the input space is affected? (real CPU std.mul vs BigInt, 4000 deterministic samples each)', () => {
  let s = 12345;
  const rnd = (lo: number, hi: number) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return Math.floor(lo + (hi - lo + 1) * (s / 0x100000000)); };
  const probe = (name: string, unsigned: boolean, gen: () => [number, number]) => {
    const n = 4000; let bad = 0, predicted = 0;
    for (let i = 0; i < n; i++) {
      const [a, b] = gen(), elem = unsigned ? 'u32' : 'i32', exp = expectedOf(elem, a, b, 'mul').expected;
      const cpu = Array.from((unsigned ? std.mul(d.vec2u(a, a), d.vec2u(b, b)) : std.mul(d.vec2i(a, a), d.vec2i(b, b))) as Any)[0] as number;
      if (cpu !== exp) bad++;
      if (cpuModelMul(elem, a, b) !== exp) predicted++;
    }
    evidence.fractions[name] = { samples: n, cpuWrong: bad, modelPredictsWrong: predicted, percentWrong: Number((100 * bad / n).toFixed(1)) };
    return { bad, predicted };
  };
  it('both operands within 94906265 (= floor(sqrt(2^53))): no sample is wrong', () => {
    expect(probe('i32 |a|,|b| <= 94906265', false, () => [rnd(-94906265, 94906265), rnd(-94906265, 94906265)]).bad).toBe(0);
    expect(probe('u32 a,b <= 94906265', true, () => [rnd(0, 94906265), rnd(0, 94906265)]).bad).toBe(0);
  });
  it('full-range operands: the large majority of samples are wrong, and the f64 model predicts exactly the wrong ones', () => {
    for (const [name, unsigned, gen] of [
      ['i32 full-range pairs', false, () => [rnd(MIN, MAX), rnd(MIN, MAX)]],
      ['u32 full-range pairs', true, () => [rnd(0, UMAX), rnd(0, UMAX)]],
      ['u32 state * 747796405 (PCG multiplier)', true, () => [rnd(0, UMAX), 747796405]],
      ['u32 state * 2654435761 (Knuth multiplicative hash)', true, () => [rnd(0, UMAX), 2654435761]],
    ] as [string, boolean, () => [number, number]][]) {
      const r = probe(name, unsigned, gen);
      expect(r.bad).toBeGreaterThan(0.5 * 4000);
      expect(r.predicted).toBe(r.bad);
    }
  });
  it('a multiplier that keeps u32 products below 2^53 is NOT affected: state * 1664525 (Numerical Recipes LCG)', () => {
    expect(probe('u32 state * 1664525 (NR LCG)', true, () => [rnd(0, UMAX), 1664525]).bad).toBe(0);
  });
});

describe('[negative controls] the comparison and the test setup can detect wrong results', () => {
  it('a deliberately wrong CPU value (expected+1) is reported as a mismatch', async () => {
    const lanes = (await evalBinary('mul', mulFn, 'vec2i', I_VALUES)).map((l) => ({ ...l, cpu: l.cpu === null ? null : wrapI(BigInt(l.expected) + 1n) }));
    expect(mismatches(lanes, 'cpu').length).toBe(lanes.length);
    evidence.negativeControls.wrongCpuDetected = true;
  });
  it('a deliberately wrong GPU function (std.mul(a,b)+1) is reported as a GPU mismatch', async () => {
    const lanes = await evalBinary('mul', brokenMulFn, 'vec2i', I_VALUES, 'broken');
    const bad = mismatches(lanes, 'gpu').length;
    evidence.negativeControls.brokenGpuMismatches = bad;
    expect(bad).toBe(lanes.length);
  });
  it('the oracle agrees with a hand-computed value, not just with itself', () => {
    expect(expectedOf('i32', 65536, 65536, 'mul').expected).toBe(0);
    expect(expectedOf('i32', 46341, 46341, 'mul').expected).toBe(-2147479015);
    expect(expectedOf('u32', UMAX, 2, 'mul').expected).toBe(4294967294);
  });
  it('the regression condition is satisfiable: a Math.imul-based CPU multiply passes the same comparison on every type', async () => {
    for (const typeName of VEC_TYPES) {
      const t = td(typeName), lanes = await evalBinary('mul', mulFn, typeName, typeName.endsWith('i') ? I_VALUES : U_VALUES);
      const fixed = lanes.map((l) => ({ ...l, cpu: t.elem === 'i32' ? Math.imul(l.a, l.b) : Math.imul(l.a, l.b) >>> 0 }));
      expect(mismatches(fixed, 'cpu'), typeName).toEqual([]);
      expect(mismatches(lanes, 'cpu').length, `${typeName}: unfixed CPU must still differ`).toBeGreaterThan(0);
    }
    evidence.negativeControls.imulFixPassesRegressionCondition = true;
  });
  it('named boundary cases (recorded for results.json)', async () => {
    const named: [string, string, number, number][] = [
      ['INT_MAX*INT_MAX', 'vec2i', MAX, MAX], ['INT_MAX*INT_MIN', 'vec2i', MAX, MIN], ['INT_MIN*INT_MIN', 'vec2i', MIN, MIN], ['INT_MIN*-1', 'vec2i', MIN, -1], ['-1*-1', 'vec2i', -1, -1],
      ['0*INT_MAX', 'vec2i', 0, MAX], ['2*INT_MAX', 'vec2i', 2, MAX], ['65536*65536', 'vec2i', 65536, 65536], ['46341*46341', 'vec2i', 46341, 46341],
      ['94906265*94906265 (< 2^53)', 'vec2i', 94906265, 94906265], ['94906267*94906267 (> 2^53, odd)', 'vec2i', 94906267, 94906267],
      ['UMAX*UMAX', 'vec2u', UMAX, UMAX], ['UMAX*2', 'vec2u', UMAX, 2], ['2^31*2', 'vec2u', 2147483648, 2], ['3037000499*3037000499', 'vec2u', 3037000499, 3037000499],
    ];
    for (const [id, type, a, b] of named) {
      const t = td(type), second = type.endsWith('i') ? [7, -7] : [7, 9];
      const ra = [[a, second[0]!]], rb = [[b, second[1]!]], ins = [{ t, rows: ra }, { t, rows: rb }];
      const gpu = (await gpuMap(mulFn, ins, t))[0]!, cpu = cpuMap(mulFn, ins, t)[0] as number[];
      const { exact, expected } = expectedOf(t.elem, a, b, 'mul');
      evidence.named.push({ id, type, a, b, exactProduct: exact.toString(), above2pow53: (exact < 0n ? -exact : exact) > POW53, expected, cpu: cpu[0], gpu: gpu[0], cpuCorrect: cpu[0] === expected, gpuCorrect: gpu[0] === expected, secondLane: { a: second[0], b: second[1], expected: expectedOf(t.elem, second[0]!, second[1]!, 'mul').expected, cpu: cpu[1], gpu: gpu[1] } });
      expect(gpu[0]).toBe(expected);
    }
  });
});
