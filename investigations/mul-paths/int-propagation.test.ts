import { afterAll, describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';
import { root } from '../../harness.ts';
import { cpuEval, decode, gpuEvalSafe, kind, readRawBuffer, sizeWords, type Any, type In, wgslOf } from './util.ts';
import { record } from './record.ts';

const MAX = 2147483647, UMAX = 4294967295;
const wrapI = (x: bigint) => Number(BigInt.asIntN(32, x)), wrapU = (x: bigint) => Number(BigInt.asUintN(32, x));
const A_I = [MAX, 94906267, 46341, -65536], B_I = [MAX, 94906267, 46341, 65536], S_I = MAX;
const A_U = [UMAX, 94906267, 46341, 3037000500], B_U = [UMAX, 94906267, 46341, 65536], S_U = UMAX;
const rows: Any[] = [];
afterAll(() => record('intPropagation', rows));

type Elem = 'i' | 'u';
const wrap = (e: Elem, x: bigint) => (e === 'i' ? wrapI(x) : wrapU(x));
interface Path { name: string; shape: 'vv' | 'vs' | 'sv'; fn: (lk: Any) => Any; defective: boolean; method?: boolean }
const PATHS: Path[] = [
  { name: 'std.mul(v,v)', shape: 'vv', fn: () => (a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); }, defective: true },
  { name: 'v*v', shape: 'vv', fn: () => (a: Any, b: Any) => { 'use gpu'; return a * b; }, defective: true },
  { name: 'v.mul(v)', shape: 'vv', fn: () => (a: Any, b: Any) => { 'use gpu'; return a.mul(b); }, defective: true },
  { name: 'v*=v', shape: 'vv', fn: (lk) => (a: Any, b: Any) => { 'use gpu'; let x = lk.schema(a); x *= b; return x; }, defective: true },
  { name: 'std.mul(v,s)', shape: 'vs', fn: () => (a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); }, defective: true },
  { name: 'v*s', shape: 'vs', fn: () => (a: Any, b: Any) => { 'use gpu'; return a * b; }, defective: true },
  { name: 'v.mul(s)', shape: 'vs', fn: () => (a: Any, b: Any) => { 'use gpu'; return a.mul(b); }, defective: true },
  { name: 'v*=s', shape: 'vs', fn: (lk) => (a: Any, b: Any) => { 'use gpu'; let x = lk.schema(a); x *= b; return x; }, defective: true },
  { name: 'std.mul(s,v)', shape: 'sv', fn: () => (a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); }, defective: true },
  { name: 's*v', shape: 'sv', fn: () => (a: Any, b: Any) => { 'use gpu'; return a * b; }, defective: true },
];
const sum = (e: Elem, x: bigint, y: bigint) => wrap(e, x + y);

describe('[CONFIRMED DEFECT #1 propagation] runtime paths: GPU == BigInt (WGSL), CPU wrong where exact product > 2^53', () => {
  for (const e of ['i', 'u'] as Elem[]) for (const n of [2, 3, 4]) for (const p of PATHS) {
    const vk = kind(`vec${n}${e}`), sk = kind(e === 'i' ? 'i32' : 'u32');
    const A = (e === 'i' ? A_I : A_U).slice(0, n), B = (e === 'i' ? B_I : B_U).slice(0, n), S = e === 'i' ? S_I : S_U;
    const [lk, rk] = p.shape === 'vv' ? [vk, vk] : p.shape === 'vs' ? [vk, sk] : [sk, vk];
    const aV = p.shape === 'sv' ? S : A, bV = p.shape === 'vv' ? B : p.shape === 'vs' ? S : A;
    const ins: In[] = [{ k: lk, v: aV as Any }, { k: rk, v: bV as Any }];
    const expected = A.map((x, i) => wrap(e, BigInt(x) * BigInt(p.shape === 'vv' ? B[i]! : S)));
    const label = `vec${n}${e} ${p.name}`;
    const state: Any = {};
    it(`[WGSL] ${label}: GPU equals BigInt wrap`, async () => {
      const gpu = await gpuEvalSafe(p.fn(vk), ins, vk);
      expect(gpu.error).toBeUndefined();
      state.gpu = gpu.value;
      expect(gpu.value).toEqual(expected);
    });
    const cpuCheck = () => {
      const cpu = cpuEval(p.fn(vk), ins, vk);
      expect(cpu.error).toBeUndefined();
      rows.push({ path: label, kind: 'runtime', expected, cpu: cpu.value, gpu: state.gpu, cpuMatchesExpected: JSON.stringify(cpu.value) === JSON.stringify(expected) });
      expect(cpu.value).toEqual(expected);
    };
    if (p.defective) it.fails(`[CONFIRMED DEFECT #1] ${label}: CPU equals BigInt wrap`, cpuCheck);
    else it(`${label}: CPU equals BigInt wrap`, cpuCheck);
  }
});

describe('[CONFIRMED DEFECT #1 propagation] constant-folded paths (op called directly in the traced body)', () => {
  const bodies: Record<string, { shape: 'vv' | 'vs'; mk: (X: Any, Y: Any, S: Any) => () => Any; folds: boolean }> = {
    'std.mul(X,Y)': { shape: 'vv', mk: (X, Y) => () => { 'use gpu'; return std.mul(X, Y); }, folds: true },
    'X*Y': { shape: 'vv', mk: (X, Y) => () => { 'use gpu'; return X * Y; }, folds: true },
    'X.mul(Y)': { shape: 'vv', mk: (X, Y) => () => { 'use gpu'; return X.mul(Y); }, folds: true },
    'std.mul(X,S(s))': { shape: 'vs', mk: (X, Y, S) => () => { 'use gpu'; return std.mul(X, S(Y)); }, folds: true },
    'X*S(s)': { shape: 'vs', mk: (X, Y, S) => () => { 'use gpu'; return X * S(Y); }, folds: true },
    'std.mul(S(s),X)': { shape: 'vs', mk: (X, Y, S) => () => { 'use gpu'; return std.mul(S(Y), X); }, folds: true },
    'vecN(X) *= Y (runtime var)': { shape: 'vv', mk: (X, Y) => () => { 'use gpu'; let x = d.vec2i(X); x *= Y; return x; }, folds: false },
  };
  for (const e of ['i', 'u'] as Elem[]) for (const [name0, b] of Object.entries(bodies)) {
    const n = 2, vk = kind(`vec${n}${e}`), sk = kind(e === 'i' ? 'i32' : 'u32');
    const A = (e === 'i' ? A_I : A_U).slice(0, n), B = (e === 'i' ? B_I : B_U).slice(0, n), S = e === 'i' ? S_I : S_U;
    const expected = A.map((x, i) => wrap(e, BigInt(x) * BigInt(b.shape === 'vv' ? B[i]! : S)));
    const name = name0.startsWith('vecN') ? name0.replace('vecN', e === 'i' ? 'vec2i' : 'vec2u') : name0;
    const label = `vec2${e} ${name}`;
    const run = async () => {
      const X = (vk.schema as Any)(...A), Y = b.shape === 'vv' ? (vk.schema as Any)(...B) : S;
      const mk = name0.startsWith('vecN') && e === 'u'
        ? (XX: Any, YY: Any) => () => { 'use gpu'; let x = d.vec2u(XX); x *= YY; return x; }
        : b.mk;
      const value = mk(X, Y, sk.schema);
      const o: Any = root.createMutable(vk.schema);
      try {
        const body = () => { 'use gpu'; o.$ = value(); };
        const wgsl = wgslOf(body);
        const kept = /\*/.test(wgsl.replace(/\(\*/g, ''));
        const dev = root.device as Any;
        dev.pushErrorScope('validation');
        root.createGuardedComputePipeline(body).dispatchThreads(1);
        const err = await dev.popErrorScope();
        expect(err, String(err?.message)).toBeFalsy();
        const got = decode(vk, await readRawBuffer(o, sizeWords(vk)));
        rows.push({ path: label, kind: 'const', operatorKeptInWgsl: kept, expected, baked: got, matches: JSON.stringify(got) === JSON.stringify(expected), wgslTail: wgsl.slice(-160) });
        expect(kept, 'operator presence in generated WGSL').toBe(!b.folds);
        expect(got).toEqual(expected);
      } finally { o.buffer.destroy(); }
    };
    if (b.folds) it.fails(`[CONFIRMED DEFECT #1] ${label}: baked constant equals BigInt wrap (value computed by the CPU during codegen)`, run);
    else it(`[WGSL] ${label}: operator stays in the shader (not folded), GPU equals BigInt wrap`, run);
  }
});

describe('std.sub / std.add / std.neg share cpuMul(-1, x) / generalizeFn but are NOT affected (control rows)', () => {
  const V = { i: [-2147483648, MAX, 0, -1, 1, 65536], u: [0, 1, UMAX, 2147483648, 65536, 7] };
  for (const e of ['i', 'u'] as Elem[]) it(`vec2${e}: std.sub/std.add/std.neg CPU == BigInt wrap on extreme pairs`, () => {
    const vk = kind(`vec2${e}`);
    let bad = 0, n = 0;
    for (const x of V[e]) for (const y of V[e]) {
      const a = (vk.schema as Any)(x, y), b = (vk.schema as Any)(y, x);
      const sub = Array.from(std.sub(a, b) as Any), add = Array.from(std.add(a, b) as Any);
      const expSub = [wrap(e, BigInt(x) - BigInt(y)), wrap(e, BigInt(y) - BigInt(x))], expAdd = [sum(e, BigInt(x), BigInt(y)), sum(e, BigInt(y), BigInt(x))];
      n++;
      if (JSON.stringify(sub) !== JSON.stringify(expSub) || JSON.stringify(add) !== JSON.stringify(expAdd)) bad++;
      if (e === 'i') { const neg = Array.from(std.neg(a) as Any); expect(neg).toEqual([wrap(e, -BigInt(x)), wrap(e, -BigInt(y))]); }
    }
    rows.push({ path: `vec2${e} std.sub/add (control)`, kind: 'control', pairs: n, mismatches: bad });
    expect(bad).toBe(0);
  });
});

describe('std.dot on integer vectors: same f64-then-wrap root cause, different surface', () => {
  const D = (e: Elem, a: number[], b: number[]) => wrap(e, a.reduce((s, x, i) => s + BigInt(x) * BigInt(b[i]!), 0n));
  for (const e of ['i', 'u'] as Elem[]) {
    const vk = kind(`vec2${e}`), sk = kind(e === 'i' ? 'i32' : 'u32');
    const a = e === 'i' ? [MAX, 94906267] : [UMAX, 94906267], b = a;
    const f = (x: Any, y: Any) => { 'use gpu'; return std.dot(x, y); };
    const cast = e === 'i' ? (x: Any, y: Any) => { 'use gpu'; return d.i32(std.dot(x, y)); } : (x: Any, y: Any) => { 'use gpu'; return d.u32(std.dot(x, y)); };
    it(`[WGSL] vec2${e} dot: GPU equals BigInt wrap`, async () => {
      const gpu = await gpuEvalSafe(f, [{ k: vk, v: a }, { k: vk, v: b }], sk);
      expect(gpu.error).toBeUndefined(); expect(gpu.value).toBe(D(e, a, b));
    });
    it(`[observation] vec2${e} dot: CPU returns an out-of-range JS number (scalar results are not wrapped: known class), CPU value is not even exact`, () => {
      const cpu = cpuEval(f, [{ k: vk, v: a }, { k: vk, v: b }], sk);
      const exact = a.reduce((s, x, i) => s + BigInt(x) * BigInt(b[i]!), 0n);
      rows.push({ path: `vec2${e} std.dot`, kind: 'dot', cpu: cpu.value, exactBigInt: exact.toString(), wrapped: D(e, a, b), cpuIsExact: BigInt(cpu.value as number) === exact });
      expect(Number(cpu.value)).toBeGreaterThan(UMAX);
    });
    it.fails(`[CONFIRMED DEFECT #1 family] vec2${e} d.${e === 'i' ? 'i32' : 'u32'}(std.dot(a,b)): CPU equals BigInt wrap (cast of the inexact f64 sum)`, () => {
      const cpu = cpuEval(cast, [{ k: vk, v: a }, { k: vk, v: b }], sk);
      rows.push({ path: `vec2${e} d.cast(std.dot)`, kind: 'dotCast', cpu: cpu.value, expected: D(e, a, b) });
      expect(cpu.value).toBe(D(e, a, b));
    });
  }
});

describe('compound += and -= on integer vectors (control: no defect; wrap-around identical on CPU and GPU)', () => {
  const V = { i: [-2147483648, MAX, 0, -1, 1, 65536], u: [0, 1, UMAX, 2147483648, 65536, 7] };
  for (const e of ['i', 'u'] as Elem[]) it(`vec2${e}: v += w and v -= w, CPU and GPU == BigInt wrap (36 pairs)`, async () => {
    const vk = kind(`vec2${e}`);
    const add = (a: Any, b: Any) => { 'use gpu'; let x = vk.schema(a); x += b; return x; };
    const sub = (a: Any, b: Any) => { 'use gpu'; let x = vk.schema(a); x -= b; return x; };
    let n = 0;
    for (const x of V[e]) for (const y of V[e]) {
      const ins: In[] = [{ k: vk, v: [x, y] }, { k: vk, v: [y, x] }];
      const eAdd = [wrap(e, BigInt(x) + BigInt(y)), wrap(e, BigInt(y) + BigInt(x))], eSub = [wrap(e, BigInt(x) - BigInt(y)), wrap(e, BigInt(y) - BigInt(x))];
      expect(cpuEval(add, ins, vk).value).toEqual(eAdd); expect(cpuEval(sub, ins, vk).value).toEqual(eSub);
      expect((await gpuEvalSafe(add, ins, vk)).value).toEqual(eAdd); expect((await gpuEvalSafe(sub, ins, vk)).value).toEqual(eSub);
      n++;
    }
    rows.push({ path: `vec2${e} += / -= (control)`, kind: 'control', pairs: n, mismatches: 0 });
  });
});
