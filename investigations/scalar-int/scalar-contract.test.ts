// The INTENDED contract and the generated WGSL text for scalar i32/u32 (what each spelling compiles to), plus mixed-type and literal forms.
// Sources read: packages/typegpu/src/std/operators.ts (binaryDivSignature restricts div/mod to f32/f16/abstractFloat; `%`, `/=`, `%=` are not routed through it),
// src/tgsl/wgslGenerator.ts (binaryOpCodeToCodegen has + - * / ** only), apis/data-schemas.mdx ("TypeGPU wraps all divisions in f32 casts implicitly"),
// eslint-plugin docs/rules/no-integer-division.md, tests/std/numeric/{div,intdiv,mod}.test.ts, src/std/numeric.ts (intdiv JSDoc).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { type Any, MAX, UMAX, cpuMap, fnWgsl, gpuMap } from './lib.ts';
import { saveEvidence } from './evidence.ts';

const warnings: string[] = [];
beforeAll(() => { vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warnings.push(a.map(String).join(' ').replace(/\s+/g, ' ')); }); });
const evidence: Any = { wgsl: {} };
const rec = (k: string, v: string) => { evidence.wgsl[k] = v; return v; };

describe('[TypeGPU] what each scalar integer spelling compiles to (generated WGSL)', () => {
  const i2: ['i32', 'i32'] = ['i32', 'i32'], u2: ['u32', 'u32'] = ['u32', 'u32'];
  it('`+ - *`, std.add/sub/mul, neg, abs, sign, min, max, clamp: plain WGSL integer operators/builtins (wrap-around is WGSL\'s)', () => {
    expect(rec('a + b', fnWgsl((a: Any, b: Any) => { 'use gpu'; return a + b; }, i2, 'i32'))).toContain('return (a + b);');
    expect(rec('std.mul', fnWgsl((a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); }, i2, 'i32'))).toContain('return (a * b);');
    expect(rec('-a', fnWgsl((a: Any) => { 'use gpu'; return -a; }, ['i32'], 'i32'))).toContain('return -(a);');
    expect(rec('std.abs', fnWgsl((a: Any) => { 'use gpu'; return std.abs(a); }, ['i32'], 'i32'))).toContain('abs(a)');
  });
  it('`a / b` and std.div on integers: i32(f32(a) / f32(b)) -- division result is f32 (documented in data-schemas.mdx)', () => {
    expect(rec('a / b -> i32', fnWgsl((a: Any, b: Any) => { 'use gpu'; return a / b; }, i2, 'i32'))).toContain('return i32((f32(a) / f32(b)));');
    expect(rec('a / b -> f32', fnWgsl((a: Any, b: Any) => { 'use gpu'; return a / b; }, i2, 'f32'))).toContain('return (f32(a) / f32(b));');
    expect(rec('std.div u32', fnWgsl((a: Any, b: Any) => { 'use gpu'; return std.div(a, b); }, u2, 'u32'))).toContain('return u32((f32(a) / f32(b)));');
  });
  it('std.mod on scalar integers: i32(f32(a) % f32(b)) (shares the f32-restricted signature of div); `a % b` is the integer `%`', () => {
    expect(rec('std.mod i32', fnWgsl((a: Any, b: Any) => { 'use gpu'; return std.mod(a, b); }, i2, 'i32'))).toContain('return i32((f32(a) % f32(b)));');
    expect(rec('a % b i32', fnWgsl((a: Any, b: Any) => { 'use gpu'; return a % b; }, i2, 'i32'))).toContain('return (a % b);');
  });
  it('std.intdiv: integer `/`; compound assignments are emitted as the same WGSL compound operator (no f32 wrapping even for `/=`)', () => {
    expect(rec('std.intdiv', fnWgsl((a: Any, b: Any) => { 'use gpu'; return std.intdiv(a, b); }, i2, 'i32'))).toContain('return (a / b);');
    const w = rec('compound', fnWgsl((a: Any, b: Any) => { 'use gpu'; let x = a; x += b; x -= 1; x *= b; x /= 2; x %= 7; return x; }, i2, 'i32'));
    for (const s of ['x += b;', 'x -= 1i;', 'x *= b;', 'x /= 2i;', 'x %= 7i;']) expect(w).toContain(s);
  });
  it('[TypeGPU] bit ops and shifts: plain WGSL; `>>` on u32 warns (deprecated, use `>>>`)', () => {
    warnings.length = 0;
    expect(rec('u32 >>', fnWgsl((a: Any, b: Any) => { 'use gpu'; return a >> b; }, u2, 'u32'))).toContain('(a >> b)');
    expect(warnings.some((w) => /deprecated/.test(w))).toBe(true);
    expect(rec('u32 >>>', fnWgsl((a: Any, b: Any) => { 'use gpu'; return a >>> b; }, u2, 'u32'))).toContain('(a >> b)');
  });
  it('std.neg(u32) is rejected by TypeGPU at resolve time (#3118), loud', () => {
    expect(() => tgpu.resolve([tgpu.fn([d.u32], d.u32)((a: Any) => { 'use gpu'; return std.neg(a); })])).toThrow(/Unary operator - cannot be applied/);
  });
});

describe('[TypeGPU] documented CPU contract for scalar ints', () => {
  it('data-schemas.mdx: d.u32(3)/d.u32(2) is 1.5 in JS (a plain number); lint rule typegpu/no-integer-division recommends d.u32(d.u32(a) / d.u32(b))', () => {
    expect(d.u32(3) / d.u32(2)).toBe(1.5);
    expect(d.u32(d.u32(3) / d.u32(2))).toBe(1);
  });
  it('CPU i32/u32 values are plain JS numbers: nothing wraps (observation, matches the earlier finding)', () => {
    const f = (a: Any, b: Any) => { 'use gpu'; return a + b; };
    expect(f(d.i32(MAX), d.i32(1))).toBe(2147483648);
    expect(f(d.u32(UMAX), d.u32(1))).toBe(4294967296);
  });
  it('std.intdiv JSDoc: equivalent to trunc(trunc(lhs) / trunc(rhs)) on the CPU; compiled to integer `/` on the GPU', () => {
    expect(std.intdiv(-7, 2)).toBe(-3); expect(std.intdiv(7, 2)).toBe(3); expect(std.intdiv(d.f32(5.5), 2)).toBe(2);
  });
});

describe('[expected difference] mixed i32/u32 operands and untyped literals', () => {
  it('i32 + u32: the u32 operand is converted with i32(u) (implicit conversion, warned); CPU adds the raw numbers', async () => {
    warnings.length = 0;
    const f = (a: Any, b: Any) => { 'use gpu'; return a + b; };
    const w = rec('i32 + u32', fnWgsl(f, ['i32', 'u32'], 'i32'));
    expect(w).toContain('return (a + i32(b));');
    expect(warnings.some((x) => /implicit-conversion/.test(x))).toBe(true);
    const g = ((await gpuMap(f, [{ k: 'i32', values: [1, 5] }, { k: 'u32', values: [UMAX, 3] }], 'i32')) as Any).out;
    const c = cpuMap(f, [{ k: 'i32', values: [1, 5] }, { k: 'u32', values: [UMAX, 3] }]);
    evidence.mixed = { gpu: g, cpu: c, inputs: [[1, UMAX], [5, 3]] };
    expect(g).toEqual([0, 8]); expect(c).toEqual([4294967296, 8]);
  });
  it('u32 + (-1) literal: CPU gives a - 1; the generated shader is rejected by Dawn (`-1` is not a u32), loud', async () => {
    const f = (a: Any) => { 'use gpu'; return a + -1; };
    const g = (await gpuMap(f, [{ k: 'u32', values: [5] }], 'u32')) as Any;
    evidence.u32NegLiteral = { wgsl: fnWgsl(f, ['u32'], 'u32'), gpu: g.error ?? g.out, cpu: cpuMap(f, [{ k: 'u32', values: [5] }]) };
    expect(g.error).toMatch(/no matching overload for 'operator - \(u32\)'/);
    expect(f(5)).toBe(4);
  });
  it('i32 + 1.5: the integer silently becomes f32 (result f32), CPU and GPU agree', async () => {
    const f = (a: Any) => { 'use gpu'; return a + 1.5; };
    expect(fnWgsl(f, ['i32'], 'f32')).toContain('f32(a)');
    expect(((await gpuMap(f, [{ k: 'i32', values: [1, 5] }], 'f32')) as Any).out).toEqual([2.5, 6.5]);
  });
});

describe('[expected difference] CPU never truncates an assignment into an integer local', () => {
  it('x = x / 2 (i32): CPU keeps 3.5, GPU stores i32(3.5) = 3 (implicit f32 -> i32 conversion, warned at resolve time)', async () => {
    const f = (a: Any, _b: Any) => { 'use gpu'; let x = a; x = x / 2; return x; };
    warnings.length = 0;
    const g = ((await gpuMap(f, [{ k: 'i32', values: [7] }, { k: 'i32', values: [0] }], 'i32')) as Any).out[0];
    evidence.assignDiv = { cpu: f(7, 0), gpu: g };
    expect(f(7, 0)).toBe(3.5); expect(g).toBe(3);
  });
});

describe('evidence', () => { it('writes results.json (contract)', () => { saveEvidence('contract', evidence); }); });
