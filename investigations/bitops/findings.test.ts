import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { root } from '../../harness.ts';
import { dawnError, oneLine, resolveOrError, INT_MIN, UINT_MAX, type Any } from './lib.ts';

const OUT: Any = {};
afterAll(() => { mkdirSync(new URL('./raw', import.meta.url).pathname, { recursive: true }); writeFileSync(new URL('./raw/findings.json', import.meta.url).pathname, JSON.stringify(OUT, null, 1)); });

const gpuValue = async (fn: () => Any, schema: Any) => {
  const out: Any = root.createMutable(schema);
  (root.device as Any).pushErrorScope('validation');
  root.createGuardedComputePipeline(() => { 'use gpu'; out.$ = fn(); }).dispatchThreads(1);
  const err = await (root.device as Any).popErrorScope();
  const v = err ? undefined : await out.read();
  out.buffer.destroy();
  return { value: v, error: err ? String(err.message).split('\n')[0] : undefined };
};

describe('[F4] CPU scalar u32 bitwise results are not u32 values (JS int32 semantics leak through)', () => {
  const cases: [string, () => number, number][] = [
    ['u32 0x80000000 | 1', () => { 'use gpu'; return d.u32(0x80000000) | d.u32(1); }, 2147483649],
    ['u32 UINT_MAX & UINT_MAX', () => { 'use gpu'; return d.u32(0xffffffff) & d.u32(0xffffffff); }, UINT_MAX],
    ['u32 1 ^ UINT_MAX', () => { 'use gpu'; return d.u32(1) ^ d.u32(0xffffffff); }, 4294967294],
    ['~u32(0)', () => { 'use gpu'; return ~d.u32(0); }, UINT_MAX],
    ['u32 1 << 31', () => { 'use gpu'; return d.u32(1) << d.u32(31); }, 2147483648],
    ['u32 UINT_MAX >> 1 (deprecated form)', () => { 'use gpu'; return d.u32(0xffffffff) >> d.u32(1); }, 2147483647],
  ];
  for (const [name, f, want] of cases) {
    it.fails(`[PROBABLE DEFECT #4] CPU: ${name} === ${want} (GPU/WGSL result)`, () => { expect(f()).toBe(want); });
  }
  it('[observation] CPU values actually returned (raw numbers)', () => { OUT.cpuU32 = cases.map(([n, f, w]) => ({ n, cpu: f(), wgsl: w })); expect(OUT.cpuU32.length).toBe(cases.length); });
  it('[TypeGPU] u32 >>> s is correct on CPU (the recommended spelling) and i32 << / >> / & | ^ ~ are correct', () => {
    expect((() => { 'use gpu'; return d.u32(0xffffffff) >>> d.u32(1); })()).toBe(2147483647);
    expect((() => { 'use gpu'; return d.i32(1) << d.u32(31); })()).toBe(INT_MIN);
    expect((() => { 'use gpu'; return ~d.i32(0); })()).toBe(-1);
  });
});

describe('[F5] CPU vector bitwise operators other than std.bitShiftLeft/Right do not return vectors (extends known fact: & | ^ <<)', () => {
  const v = d.vec3i(1, 2, 3), w = d.vec3i(4, 5, 6), s = d.vec3u(1, 2, 3);
  const cases: [string, () => Any][] = [
    ['~vec3i', () => { 'use gpu'; return ~v; }], ['vec3i >> vec3u', () => { 'use gpu'; return v >> s; }], ['vec3u >>> vec3u', () => { 'use gpu'; return d.vec3u(8, 16, 32) >>> s; }],
    ['v & w', () => { 'use gpu'; return v & w; }],
  ];
  for (const [name, f] of cases) it.fails(`[PROBABLE DEFECT #4b] CPU: ${name} returns a vector`, () => { const r = f(); expect(typeof r).toBe('object'); });
  it('[observation] actual CPU values', () => { OUT.cpuVec = cases.map(([n, f]) => ({ n, cpu: f(), type: typeof f() })); expect(OUT.cpuVec.every((r: Any) => r.type === 'number')).toBe(true); });
  it('[TypeGPU] std.bitShiftLeft / bitShiftRight are the correct vector spellings on CPU', () => {
    expect(Array.from(std.bitShiftLeft(v, s) as Any)).toEqual([2, 8, 24]);
    expect(Array.from(std.bitShiftRight(d.vec3i(INT_MIN, -8, 8), d.vec3u(31, 1, 2)) as Any)).toEqual([-1, -4, 2]);
  });
});

describe('[F6] CPU scalar std.abs(INT_MIN)', () => {
  it('[observation, family of known scalar-int CPU fact] std.abs(i32 INT_MIN) = 2147483648 on CPU (WGSL: INT_MIN); the vec3i version wraps correctly', () => {
    expect(std.abs(INT_MIN)).toBe(2147483648);
    expect(Array.from(std.abs(d.vec3i(INT_MIN, -5, 5)) as Any)).toEqual([INT_MIN, 5, 5]);
  });
});

describe('[F1-F3, F7] operations accepted by TypeGPU code generation that produce invalid WGSL', () => {
  const hMin = (a: Any, b: Any) => { 'use gpu'; return std.min(a, b); };
  const hClamp = (a: Any, b: Any) => { 'use gpu'; return std.clamp(a, b, b); };
  const fMin = () => { 'use gpu'; return hMin(d.vec3f(1, 2, 3), d.f32(1)); };
  const fClamp = () => { 'use gpu'; return hClamp(d.vec3i(0, 2, 9), d.i32(1)); };
  it.fails('[PROBABLE DEFECT #5] std.min(vec3f, scalar) / std.max / std.clamp(vec, scalar, scalar) are rejected at resolve time (the CPU path throws "Unsupported signature"; WGSL has no scalar broadcast)', () => {
    expect(resolveOrError(fMin).error).toBeDefined();
    expect(resolveOrError(fClamp).error).toBeDefined();
  });
  it('[observation] ... currently Dawn rejects the generated WGSL: "no matching call to clamp(vec3<i32>, i32, i32)"', async () => {
    const w = resolveOrError(fClamp).wgsl!;
    OUT.clampVecScalar = { wgsl: oneLine(w), dawn: await dawnError(w) };
    expect(await dawnError(w)).toMatch(/no matching call to 'clamp/);
    const wm = resolveOrError(fMin).wgsl!;
    expect(await dawnError(wm)).toMatch(/no matching call to 'min/);
  });
  it('[observation] CPU contract for the same call: throws "Unsupported signature"', () => {
    expect(() => (std.clamp as Any)(d.vec3i(0, 2, 9), 1, 3)).toThrow(/Unsupported signature/);
  });
  it('[observation] invalid WGSL is NOT a JS exception: create + dispatch succeed, the output buffer silently keeps its old value (only a driver validation message is printed)', async () => {
    const out: Any = root.createMutable(d.f32, 7);
    const f = () => { 'use gpu'; out.$ = std.firstLeadingBit(d.f32(2)); };
    let threw = false;
    try { root.createGuardedComputePipeline(f).dispatchThreads(1); } catch { threw = true; }
    const v = await out.read();
    out.buffer.destroy();
    OUT.invalidWgslNotThrown = { threw, bufferAfter: v };
    expect(threw).toBe(false);
    expect(v).toBe(7);
  });
});

describe('[F8] WGSL const-expression strictness: CPU computes a value, the generated shader is rejected (spec-conformant, no JS exception)', () => {
  const X = (n: number) => n;
  it('[WGSL] signed shift-left overflow in const-expressions: `const x = i32(1); x << 31` is a shader-creation error; CPU gives -2147483648', async () => {
    const f = () => { 'use gpu'; const x = d.i32(1); return x << d.u32(31); };
    expect(f()).toBe(INT_MIN);
    const r = await gpuValue(f, d.i32);
    OUT.shlConst = { wgsl: oneLine(tgpu.resolve([f as Any])), r };
    expect(r.error).toMatch(/sign change|cannot be represented/);
  });
  it('[WGSL] unsigned shift-left overflow: `u32(0x80000001) << 1` rejected', async () => {
    const f = () => { 'use gpu'; const x = d.u32(0x80000001); return x << d.u32(1); };
    const r = await gpuValue(f, d.u32);
    expect(r.error).toMatch(/cannot be represented as 'u32'/);
  });
  it('[WGSL] shift amount literal >= 32 is a shader-creation error even when the shifted value is a RUNTIME value', async () => {
    const buf: Any = root.createMutable(d.u32, 5);
    const out: Any = root.createMutable(d.u32);
    const f = () => { 'use gpu'; return buf.$ << 33; };
    const r = await gpuValue(f, d.u32);
    OUT.runtimeShiftLiteral33 = { wgsl: oneLine(tgpu.resolve([f as Any])), r };
    expect(r.error).toMatch(/shift left value must be less than the bit width/);
    buf.buffer.destroy(); out.buffer.destroy();
  });
  it('[observation] same shift with a runtime shift amount is fine and wraps modulo 32 (covered in runtime-diff.test.ts)', () => { expect(X(1)).toBe(1); });
  it('[observation] std.bitShiftLeft(const vec, 33) is folded by TypeGPU on the CPU (no shader error) while the operator form `v << vec3u(33)` is rejected for the same constants', async () => {
    const viaStd = () => { 'use gpu'; return std.bitShiftLeft(d.vec3u(1, 2, 3), d.vec3u(33)); };
    const viaOp = () => { 'use gpu'; const v = d.vec3u(1, 2, 3); return v << d.vec3u(33); };
    const a = await gpuValue(viaStd, d.vec3u), b = await gpuValue(viaOp, d.vec3u);
    OUT.shiftVecConst = { viaStd: { wgsl: oneLine(tgpu.resolve([viaStd as Any])), a: a.error ?? Array.from(a.value as Any) }, viaOp: { wgsl: oneLine(tgpu.resolve([viaOp as Any])), b: b.error ?? Array.from(b.value as Any) } };
    expect(a.error).toBeUndefined(); expect(Array.from(a.value as Any)).toEqual([2, 4, 6]);
    expect(b.error).toMatch(/shift left value must be less than the bit width/);
  });
  it('[observation] std.clamp(const, lo > hi) is folded by TypeGPU (result min(max(e,lo),hi)); spec: shader-creation error for const-expressions', async () => {
    const f = () => { 'use gpu'; return std.clamp(d.i32(5), d.i32(10), d.i32(0)); };
    const r = await gpuValue(f, d.i32);
    OUT.clampLoGtHi = { wgsl: oneLine(tgpu.resolve([f as Any])), r };
    expect(f()).toBe(0);
    expect(r.value).toBe(0);
  });
});

describe('[F9] literal-only (AbstractInt) bit expressions: CPU uses JS int32 semantics, WGSL uses 64-bit abstract semantics', () => {
  const cases: [string, () => Any, Any][] = [
    ['d.u32(~0)', () => { 'use gpu'; return d.u32(~0); }, d.u32],
    ['d.u32(1 << 32)', () => { 'use gpu'; return d.u32(1 << 32); }, d.u32],
    ['d.i32(1 << 31)', () => { 'use gpu'; return d.i32(1 << 31); }, d.i32],
  ];
  for (const [name, f, S] of cases) {
    it(`[observation] ${name}: CPU returns a value, GPU shader is rejected`, async () => {
      const cpu = f();
      const r = await gpuValue(f, S);
      OUT[`literal ${name}`] = { cpu, wgsl: oneLine(tgpu.resolve([f as Any])), gpu: r.error ?? r.value };
      expect(typeof cpu).toBe('number');
      expect(r.error).toMatch(/cannot be represented/);
    });
  }
  it('[observation] d.u32(1 << 31) agrees on CPU and GPU (2147483648)', async () => {
    const f = () => { 'use gpu'; return d.u32(1 << 31); };
    expect(f()).toBe(2147483648);
    expect((await gpuValue(f, d.u32)).value).toBe(2147483648);
  });
});

describe('[F10] known INT_MIN scalar literal problem also hits integer std ops (reach extension of the known fact)', () => {
  it('[observation] scalar i32 INT_MIN as a constant input of ANY op makes the shader invalid ("value cannot be represented as i32"); vec3i with INT_MIN lanes is fine', async () => {
    const mk = (S: Any, x: Any) => () => { 'use gpu'; return std.abs(S(x)); };
    const sc = await gpuValue(mk(d.i32, INT_MIN), d.i32);
    const vc = await gpuValue(mk(d.vec3i, d.vec3i(INT_MIN, 0, 1)), d.vec3i);
    OUT.intMinAbs = { scalar: sc.error ?? sc.value, vec: vc.error ?? Array.from(vc.value as Any) };
    expect(sc.error).toMatch(/cannot be represented as 'i32'/);
    expect(Array.from(vc.value as Any)).toEqual([INT_MIN, 0, 1]);
  });
});

describe('[F11] unary minus / std.neg on u32', () => {
  it('[observation] GPU code generation rejects -u32 / std.neg(u32) (loud, at resolve time); the CPU returns a negative number for a u32', () => {
    const f = () => { 'use gpu'; return -d.u32(5); };
    expect(f()).toBe(-5);
    expect(resolveOrError(f).error).toMatch(/Unary operator - cannot be applied/);
    expect(std.neg(d.u32(5) as Any)).toBe(-5);
  });
});
