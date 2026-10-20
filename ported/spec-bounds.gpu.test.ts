import { describe, expect, it } from 'vitest';
import { std } from 'typegpu';
import { mapBinary, mapUnary } from '../harness.ts';

type Any = any;
const N = 4096;

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
function nextUp(x: number) { f32[0] = x; u32[0] = x >= 0 ? u32[0]! + 1 : u32[0]! - 1; return f32[0]!; }
function nextDown(x: number) { return -nextUp(-x); }
function ulp(x: number): number {
  const r = Math.fround(x);
  if (r === x) return Math.min(nextUp(x) - x, x - nextDown(x));
  return r < x ? nextUp(r) - r : r - nextDown(r);
}

function inputs(lo: number, hi: number, seed = 7): number[] {
  let s = seed;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000);
  return Array.from({ length: N }, () => Math.fround(lo + (hi - lo) * rnd()));
}

type Row = { fn: string; range: string; metric: string; observedMax: number; bound: string; verdict: string };
const rows: Row[] = [];

function maxUlpErr(xs: number[], gpu: number[], ref: (x: number) => number): number {
  let m = 0;
  for (let i = 0; i < xs.length; i++) {
    const r = ref(xs[i]!);
    m = Math.max(m, Math.abs(gpu[i]! - r) / ulp(r));
  }
  return m;
}

describe('WGSL accuracy bounds on a real GPU (f32)', () => {
  it('sin/cos: abs error <= 2^-11 on [-pi, pi]', async () => {
    const xs = inputs(-Math.PI, Math.PI);
    for (const [name, f, ref] of [
      ['sin', (x: Any) => { 'use gpu'; return std.sin(x); }, Math.sin],
      ['cos', (x: Any) => { 'use gpu'; return std.cos(x); }, Math.cos],
    ] as const) {
      const gpu = await mapUnary(f, xs);
      const err = Math.max(...xs.map((x, i) => Math.abs(gpu[i]! - ref(x))));
      rows.push({ fn: name, range: '[-pi, pi]', metric: 'abs', observedMax: err, bound: String(2 ** -11), verdict: err <= 2 ** -11 ? 'within' : 'EXCEEDS' });
      expect(err).toBeLessThanOrEqual(2 ** -11);
    }
  });

  it('exp / exp2: <= 3 + 2|x| ULP', async () => {
    for (const [name, f, ref, lo, hi] of [
      ['exp', (x: Any) => { 'use gpu'; return std.exp(x); }, Math.exp, -10, 10],
      ['exp2', (x: Any) => { 'use gpu'; return std.exp2(x); }, (x: number) => 2 ** x, -20, 20],
    ] as const) {
      const xs = inputs(lo, hi);
      const gpu = await mapUnary(f, xs);
      let worstSlack = -Infinity, worstUlp = 0;
      xs.forEach((x, i) => {
        const r = ref(x);
        const e = Math.abs(gpu[i]! - r) / ulp(r);
        worstUlp = Math.max(worstUlp, e);
        worstSlack = Math.max(worstSlack, e - (3 + 2 * Math.abs(x)));
      });
      rows.push({ fn: name, range: `[${lo}, ${hi}]`, metric: 'ULP', observedMax: worstUlp, bound: '3 + 2|x|', verdict: worstSlack <= 0 ? 'within' : 'EXCEEDS' });
      expect(worstSlack).toBeLessThanOrEqual(0);
    }
  });

  it('log / log2: abs <= 2^-21 on [0.5, 2], otherwise 3 ULP', async () => {
    for (const [name, f, ref] of [
      ['log', (x: Any) => { 'use gpu'; return std.log(x); }, Math.log],
      ['log2', (x: Any) => { 'use gpu'; return std.log2(x); }, Math.log2],
    ] as const) {
      const xs = [...inputs(0.5, 2), ...inputs(0.001, 1000, 99)];
      const gpu = await mapUnary(f, xs);
      let worstAbs = 0, worstUlp = 0;
      xs.forEach((x, i) => {
        const r = ref(x);
        if (x >= 0.5 && x <= 2) worstAbs = Math.max(worstAbs, Math.abs(gpu[i]! - r));
        else worstUlp = Math.max(worstUlp, Math.abs(gpu[i]! - r) / ulp(r));
      });
      rows.push({ fn: name, range: '[0.5,2]', metric: 'abs', observedMax: worstAbs, bound: String(2 ** -21), verdict: worstAbs <= 2 ** -21 ? 'within' : 'EXCEEDS' });
      rows.push({ fn: name, range: 'elsewhere', metric: 'ULP', observedMax: worstUlp, bound: '3', verdict: worstUlp <= 3 ? 'within' : 'EXCEEDS' });
      expect(worstAbs).toBeLessThanOrEqual(2 ** -21);
      expect(worstUlp).toBeLessThanOrEqual(3);
    }
  });

  it('tanh: abs error <= 1e-5 (ULP is the wrong metric here)', async () => {
    const xs = inputs(-5, 5);
    const gpu = await mapUnary((x: Any) => { 'use gpu'; return std.tanh(x); }, xs);
    const abs = Math.max(...xs.map((x, i) => Math.abs(gpu[i]! - Math.tanh(x))));
    const ulpErr = maxUlpErr(xs, gpu, Math.tanh);
    rows.push({ fn: 'tanh', range: '[-5, 5]', metric: 'abs', observedMax: abs, bound: '1e-5', verdict: abs <= 1e-5 ? 'within' : 'EXCEEDS' });
    rows.push({ fn: 'tanh', range: '[-5, 5]', metric: 'ULP (informational)', observedMax: ulpErr, bound: 'n/a', verdict: 'n/a' });
    expect(abs).toBeLessThanOrEqual(1e-5);
  });

  it('inverseSqrt: <= 2 ULP', async () => {
    const xs = inputs(0.001, 1000);
    const gpu = await mapUnary((x: Any) => { 'use gpu'; return std.inverseSqrt(x); }, xs);
    const e = maxUlpErr(xs, gpu, (x) => 1 / Math.sqrt(x));
    rows.push({ fn: 'inverseSqrt', range: '[0.001, 1000]', metric: 'ULP', observedMax: e, bound: '2', verdict: e <= 2 ? 'within' : 'EXCEEDS' });
    expect(e).toBeLessThanOrEqual(2);
  });

  it('+ - *: correctly rounded; /: <= 2.5 ULP', async () => {
    const xs = inputs(-100, 100, 1);
    const ys = inputs(0.01, 100, 2);
    for (const [name, f, ref] of [
      ['add', (a: Any, b: Any) => { 'use gpu'; return a + b; }, (a: number, b: number) => a + b],
      ['sub', (a: Any, b: Any) => { 'use gpu'; return a - b; }, (a: number, b: number) => a - b],
      ['mul', (a: Any, b: Any) => { 'use gpu'; return a * b; }, (a: number, b: number) => a * b],
    ] as const) {
      const gpu = await mapBinary(f, xs, ys);
      const mismatches = xs.filter((x, i) => gpu[i] !== Math.fround(ref(x, ys[i]!))).length;
      rows.push({ fn: name, range: 'x[-100,100] y[0.01,100]', metric: 'mismatches vs correctly rounded', observedMax: mismatches, bound: '0', verdict: mismatches === 0 ? 'within' : 'EXCEEDS' });
      expect(mismatches).toBe(0);
    }
    const gpu = await mapBinary((a: Any, b: Any) => { 'use gpu'; return a / b; }, xs, ys);
    let e = 0;
    xs.forEach((x, i) => { const r = x / ys[i]!; if (r !== 0) e = Math.max(e, Math.abs(gpu[i]! - r) / ulp(r)); });
    rows.push({ fn: 'div', range: 'x[-100,100] y[0.01,100]', metric: 'ULP', observedMax: e, bound: '2.5', verdict: e <= 2.5 ? 'within' : 'EXCEEDS' });
    expect(e).toBeLessThanOrEqual(2.5);
  });

  it('sqrt and pow: reported only (inherited bounds)', async () => {
    const xs = inputs(0.001, 1000);
    const sq = await mapUnary((x: Any) => { 'use gpu'; return std.sqrt(x); }, xs);
    rows.push({ fn: 'sqrt', range: '[0.001, 1000]', metric: 'ULP', observedMax: maxUlpErr(xs, sq, Math.sqrt), bound: 'inherited', verdict: 'n/a' });
    const bs = inputs(0.5, 8, 5), es = inputs(-3, 3, 6);
    const pw = await mapBinary((a: Any, b: Any) => { 'use gpu'; return std.pow(a, b); }, bs, es);
    let e = 0;
    bs.forEach((b, i) => { const r = b ** es[i]!; e = Math.max(e, Math.abs(pw[i]! - r) / ulp(r)); });
    rows.push({ fn: 'pow', range: 'x[0.5,8] y[-3,3]', metric: 'ULP', observedMax: e, bound: 'inherited exp2(y*log2(x))', verdict: 'n/a' });
  });

  it('prints the table', () => {
    console.table(rows.map((r) => ({ ...r, observedMax: Number(r.observedMax.toPrecision(4)) })));
  });
});
