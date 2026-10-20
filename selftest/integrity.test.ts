import { afterAll, describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';
import { root, run } from '../harness.ts';
import { runGroup } from '../lib/engine.ts';
import { flush } from '../lib/report.ts';
import { OPS, type OpSpec } from '../lib/ops.ts';
import * as P from '../lib/policy.ts';
import { TY } from '../lib/types.ts';
import { fround, ulp32 } from '../lib/num.ts';

type Any = any;
afterAll(() => flush('selftest-integrity'));

describe('[harness] the GPU really executes the computation', () => {
  it('compiles to a real compute shader reading/writing storage buffers', async () => {
    const dev = root.device as Any;
    const orig = dev.createShaderModule.bind(dev);
    const code: string[] = [];
    dev.createShaderModule = (x: Any) => { code.push(x.code); return orig(x); };
    try { await run((a: Any, b: Any) => { 'use gpu'; return a + b; }, [d.vec2f(1, 2), d.vec2f(3, 4)], d.vec2f); } finally { dev.createShaderModule = orig; }
    const wgsl = code.join('\n');
    expect(wgsl).toMatch(/@compute/);
    expect(wgsl).toMatch(/var<storage, read_write>/);
    expect(wgsl).toMatch(/\(a \+ b\)/);
  });
  it('canary: a function with different semantics gives its own result (not a CPU std lookup)', async () => {
    expect(await run((a: Any) => { 'use gpu'; return a * 3 + 100; }, [7], d.f32)).toBe(121);
  });
  it('canary: a shader that ignores its input and writes a constant is read back as that constant', async () => {
    expect(await run((_a: Any) => { 'use gpu'; return d.f32(12345.5); }, [1], d.f32)).toBe(12345.5);
  });
  it('canary: consecutive dispatches never return stale data', async () => {
    expect(Array.from(await run((a: Any) => { 'use gpu'; return a + 1; }, [d.vec2f(1, 1)], d.vec2f) as Any)).toEqual([2, 2]);
    expect(Array.from(await run((a: Any) => { 'use gpu'; return a + 1; }, [d.vec2f(5, 5)], d.vec2f) as Any)).toEqual([6, 6]);
  });
});

const base = OPS.find((o) => o.name === 'add' && o.group === 'float')!;
const addPlusOne = (a: Any, b: Any) => { 'use gpu'; return std.add(a, b) + 1; };
const addSwapLanes = (a: Any, b: Any) => { 'use gpu'; const r = std.add(a, b); return d.vec2f(r.y, r.x); };
const addScaled = (a: Any, b: Any) => { 'use gpu'; return std.add(a, b) * 1.0000002; };

describe('[engine] negative controls: broken operations must fail', () => {
  it('result off by +1 is detected (scalar)', async () => {
    const g = await runGroup({ ...base, name: 'broken-add+1', fn: () => addPlusOne } as OpSpec, 'f32');
    expect(g.fail).toBeGreaterThan(g.total * 0.5);
  });
  it('swapped vector lanes are detected (lane-order sensitivity)', async () => {
    const g = await runGroup({ ...base, name: 'broken-lane-swap', fn: () => addSwapLanes } as OpSpec, 'vec2f');
    expect(g.fail).toBeGreaterThan(g.total * 0.5);
  });
  it('a ~2 ULP error is detected by the correctly-rounded policy', async () => {
    const g = await runGroup({ ...base, name: 'broken-add*1.0000002', fn: () => addScaled } as OpSpec, 'f32');
    expect(g.fail).toBeGreaterThan(0);
  });
  it('an unmodified op is NOT flagged (control for the controls)', async () => {
    const g = await runGroup(base, 'f32');
    expect(g.fail).toBe(0);
  });
  it('is deterministic: two runs give identical CPU and GPU results', async () => {
    const a = await runGroup(base, 'vec3f'); const b = await runGroup(base, 'vec3f');
    expect(a.rows.map((r) => [r.cpu, r.gpu])).toEqual(b.rows.map((r) => [r.cpu, r.gpu]));
    expect([a.pass, a.fail, a.investigate]).toEqual([b.pass, b.fail, b.investigate]);
  });
});

describe('[TypeGPU] lane order and row order are preserved', () => {
  it('vec4f non-commutative subtraction keeps lanes in place', async () => {
    const r = await run((a: Any, b: Any) => { 'use gpu'; return std.sub(a, b); }, [d.vec4f(1, 2, 3, 4), d.vec4f(10, 20, 30, 40)], d.vec4f);
    expect(Array.from(r as Any)).toEqual([-9, -18, -27, -36]);
  });
  it('vec4u right shift keeps lanes in place', async () => {
    const r = await run((a: Any, b: Any) => { 'use gpu'; return std.bitShiftRight(a, b); }, [d.vec4u(256, 256, 256, 256), d.vec4u(0, 1, 2, 3)], d.vec4u);
    expect(Array.from(r as Any)).toEqual([256, 128, 64, 32]);
  });
  it('the engine maps input row i to output row i', async () => {
    const neg = OPS.find((o) => o.name === 'neg' && o.group === 'float')!;
    const g = await runGroup({ ...neg, lists: () => [[1, 2, 3, 4, 5, 6, 7]] }, 'f32');
    expect(g.pass).toBe(7);
  });
});

const ctx = (args: number[], oracle: (a: number[]) => number) => ({ type: TY.f32!, args, oracle });
describe('[policy] unit tests', () => {
  it('ULP follows the spec definition', () => {
    expect(ulp32(1)).toBe(2 ** -24);
    expect(ulp32(1.5)).toBe(2 ** -23);
    expect(ulp32(0)).toBe(2 ** -149);
    expect(ulp32(3.4028234663852886e38)).toBe(2 ** 104);
  });
  const cr = P.correctlyRounded(fround);
  const add = (a: number[]) => a[0]! + a[1]!;
  it('correctly-rounded: accepts the rounded value, rejects 1 ULP off, accepts flush-to-zero of a subnormal result', () => {
    expect(cr.check(fround(0.1 + 0.2), 0.1 + 0.2, ctx([0.1, 0.2], add)).verdict).toBe('pass');
    expect(cr.check(fround(0.1 + 0.2) + ulp32(0.3), 0.1 + 0.2, ctx([0.1, 0.2], add)).verdict).toBe('fail');
    expect(cr.check(0, 1e-40 + 1e-40, ctx([1e-40, 1e-40], add)).verdict).toBe('pass');
    expect(cr.check(0, 1, ctx([1, 0], add)).verdict).toBe('fail');
  });
  it('correctly-rounded: zero of the other sign is an observation, inf/NaN are observations', () => {
    expect(cr.check(0, -0, ctx([0, -0], add)).verdict).toBe('investigate');
    expect(cr.check(NaN, Infinity, ctx([Infinity, 1], add)).verdict).toBe('investigate');
  });
  it('exact-integer is strict', () => {
    expect(P.exactInt.check(5, 5, ctx([], () => 0)).verdict).toBe('pass');
    expect(P.exactInt.check(5, 6, ctx([], () => 0)).verdict).toBe('fail');
  });
  it('ulpBound enforces its bound and flags out-of-domain inputs as observations', () => {
    const pol = P.ulpBound('t', 't', () => 2, { domain: ([x]) => (x! < 0 ? 'x<0' : null) });
    const want = 10; const u = ulp32(want);
    expect(pol.check(want + 2 * u, want, ctx([1], () => want)).verdict).toBe('pass');
    expect(pol.check(want + 3 * u, want, ctx([1], () => want)).verdict).toBe('fail');
    expect(pol.check(want + 99 * u, want, ctx([-1], () => want)).verdict).toBe('investigate');
  });
  it('pow derived bound accepts the observed Metal values and rejects a clearly wrong one', () => {
    const c = (x: number, y: number) => ctx([x, y], ([a, b]) => Math.pow(a!, b!));
    expect(P.powDerived.check(242.99996948242188, 243, c(3, 5)).verdict).toBe('pass');
    expect(P.powDerived.check(243.5, 243, c(3, 5)).verdict).toBe('fail');
  });
  it('float remainder: exact passes, off-by-|y| is an observation, garbage fails', () => {
    const c = (a: number, b: number) => ctx([a, b], ([x, y]) => x! % y!);
    expect(P.floatRemainder.check(1, 1, c(7, 3)).verdict).toBe('pass');
    expect(P.floatRemainder.check(691, 0, c(691, 691)).verdict).toBe('investigate');
    expect(P.floatRemainder.check(5, 1, c(7, 3)).verdict).toBe('fail');
  });
  it('integer oracles implement the WGSL rules (divisor 0 -> dividend, INT_MIN/-1, sign of remainder, shifts mod 32)', () => {
    const op = (name: string, group = 'int') => OPS.find((o) => o.name === name && o.group === group)!;
    const i32 = TY.i32!; const u32 = TY.u32!;
    expect(op('intdiv').oracle([-7, 2], i32)).toBe(-3);
    expect(op('intdiv').oracle([5, 0], i32)).toBe(5);
    expect(op('intdiv').oracle([-2147483648, -1], i32)).toBe(-2147483648);
    expect(op('remainder(%)').oracle([-7, 2], i32)).toBe(-1);
    expect(op('remainder(%)').oracle([5, 0], u32)).toBe(0);
    expect(op('remainder(%)').oracle([-2147483648, -1], i32)).toBe(0);
    expect(op('bitShiftLeft').oracle([1, 31], i32)).toBe(-2147483648);
    expect(op('bitShiftLeft').oracle([1, 33], u32)).toBe(2);
    expect(op('bitShiftRight').oracle([-8, 1], i32)).toBe(-4);
    expect(op('bitShiftRight').oracle([4294967288, 1], u32)).toBe(2147483644);
    expect(op('mul').oracle([2147483647, 2147483647], i32)).toBe(1);
    expect(op('neg').oracle([-2147483648], i32)).toBe(-2147483648);
  });
});
