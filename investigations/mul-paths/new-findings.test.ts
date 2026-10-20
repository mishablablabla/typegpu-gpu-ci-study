import { afterAll, describe, expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { gpu as gpuInstance, root } from '../../harness.ts';
import { cpuEval, errText, gpuEvalSafe, kind, type Any, type In } from './util.ts';
import { record } from './record.ts';

void root;
const out: Record<string, Any> = {};
afterAll(() => record('newFindings', out));
const V2f = kind('vec2f'), V3f = kind('vec3f'), V4f = kind('vec4f'), V2i = kind('vec2i'), V3i = kind('vec3i'), V2u = kind('vec2u'), F = kind('f32'), I = kind('i32'), U = kind('u32'), M3 = kind('mat3x3f'), M4 = kind('mat4x4f');

describe('N1: compound assignment with a side-effecting left-hand side (arr[bump()] OP= x)', () => {
  const bump = (c: d.ref<number>) => { 'use gpu'; c.$ += 1; return c.$ - 1; };
  const mk = {
    '*=': (a: Any, b: Any) => { 'use gpu'; const n = d.ref(d.f32(0)); const arr = d.arrayOf(d.f32, 4)([a.x, a.y, b.x, b.y]); arr[bump(n)] *= 10; return d.vec4f(arr[0], arr[1], arr[2], n.$); },
    '+=': (a: Any, b: Any) => { 'use gpu'; const n = d.ref(d.f32(0)); const arr = d.arrayOf(d.f32, 4)([a.x, a.y, b.x, b.y]); arr[bump(n)] += 10; return d.vec4f(arr[0], arr[1], arr[2], n.$); },
    '-=': (a: Any, b: Any) => { 'use gpu'; const n = d.ref(d.f32(0)); const arr = d.arrayOf(d.f32, 4)([a.x, a.y, b.x, b.y]); arr[bump(n)] -= 10; return d.vec4f(arr[0], arr[1], arr[2], n.$); },
    '/=': (a: Any, b: Any) => { 'use gpu'; const n = d.ref(d.f32(0)); const arr = d.arrayOf(d.f32, 4)([a.x, a.y, b.x, b.y]); arr[bump(n)] /= 2; return d.vec4f(arr[0], arr[1], arr[2], n.$); },
  } as Record<string, (a: Any, b: Any) => Any>;
  const ref = (op: string) => { let n = 0; const bumpJs = () => n++; const arr = [3, 5, 7, 11]; const i = bumpJs();
    if (op === '*=') arr[i]! *= 10; else if (op === '+=') arr[i]! += 10; else if (op === '-=') arr[i]! -= 10; else arr[i]! /= 2;
    return arr; };
  void ref;
  const plainJs = (op: string): number[] => {
    let n = 0; const bumpJs = () => n++; const arr = [3, 5, 7, 11];
    if (op === '*=') arr[bumpJs()]! *= 10; else if (op === '+=') arr[bumpJs()]! += 10; else if (op === '-=') arr[bumpJs()]! -= 10; else arr[bumpJs()]! /= 2;
    return [arr[0]!, arr[1]!, arr[2]!, n];
  };
  for (const op of Object.keys(mk)) {
    const ins: In[] = [{ k: V2f, v: [3, 5] }, { k: V2f, v: [7, 11] }];
    it(`[WGSL/JS] arr[bump()] ${op} x: GPU equals plain-JS semantics (lhs evaluated once)`, async () => {
      const g = await gpuEvalSafe(mk[op]!, ins, V4f);
      expect(g.error).toBeUndefined();
      expect(g.value).toEqual(plainJs(op));
      out[`N1 ${op}`] = { plainJs: plainJs(op), gpu: g.value, cpu: cpuEval(mk[op]!, ins, V4f).value };
    });
    it.fails(`[CONFIRMED DEFECT] arr[bump()] ${op} x: CPU ('use gpu' function run as JS) equals plain-JS semantics`, () => {
      const c = cpuEval(mk[op]!, ins, V4f);
      expect(c.error).toBeUndefined();
      expect(c.value).toEqual(plainJs(op));
    });
  }
  it('[observation] unplugin source rewrite is `lhs = fn(lhs, rhs)` (lhs text duplicated): shown by running the compiled function', () => {
    const c = cpuEval(mk['*=']!, [{ k: V2f, v: [3, 5] }, { k: V2f, v: [7, 11] }], V4f);
    expect(c.value).toEqual([50, 5, 7, 2]);
  });
});

describe('N2: iN/uN vector * f32 scalar: GPU truncates the scalar first (a * i32(b)), CPU multiplies by the float then truncates per lane', () => {
  type C = { name: string; vk: ReturnType<typeof kind>; v: number[]; s: number };
  const cases: C[] = [
    { name: 'vec2i [10,3] * 1.9', vk: V2i, v: [10, 3], s: 1.9 }, { name: 'vec2i [10,3] * 1.5', vk: V2i, v: [10, 3], s: 1.5 },
    { name: 'vec2i [10,3] * -0.5', vk: V2i, v: [10, 3], s: -0.5 }, { name: 'vec2u [10,3] * 2.5', vk: V2u, v: [10, 3], s: 2.5 },
    { name: 'vec3i [7,-7,100] * 0.5', vk: V3i, v: [7, -7, 100], s: 0.5 },
  ].map((c) => ({ ...c, s: Math.fround(c.s) }));
  const fns = {
    'std.mul': (a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); },
    'a*b': (a: Any, b: Any) => { 'use gpu'; return a * b; },
    'a.mul(b)': (a: Any, b: Any) => { 'use gpu'; return a.mul(b); },
    'b*a': (a: Any, b: Any) => { 'use gpu'; return b * a; },
  } as Record<string, (a: Any, b: Any) => Any>;
  const warnsDuring = async (f: () => Promise<Any>) => { const w: string[] = []; const o = console.warn; console.warn = (...x: Any[]) => w.push(x.join(' ')); try { return { r: await f(), warns: w }; } finally { console.warn = o; } };
  for (const c of cases) for (const [fname, f] of Object.entries(fns)) {
    const ins: In[] = fname === 'b*a' ? [{ k: kind('f32'), v: c.s }, { k: c.vk, v: c.v }] : [{ k: c.vk, v: c.v }, { k: kind('f32'), v: c.s }];
    const lane = (x: number, trunc: boolean) => { const r = trunc ? x * (c.vk.elem === 'u32' ? Math.max(0, Math.trunc(c.s)) : Math.trunc(c.s)) : Math.trunc(x * c.s); return c.vk.elem === 'u32' ? r >>> 0 : r | 0; };
    const gpuModel = c.v.map((x) => lane(x, true)), cpuModel = c.v.map((x) => lane(x, false));
    const f2 = fname === 'b*a' ? (a: Any, b: Any) => { 'use gpu'; return a * b; } : f;
    it(`[observation] ${c.name} via ${fname === 'b*a' ? 's*v' : fname}: CPU = trunc(x*s), GPU = x*trunc(s), plus an implicit-conversion warning`, async () => {
      const cpu = cpuEval(f2, ins, c.vk);
      const { r: g, warns } = await warnsDuring(() => gpuEvalSafe(f2, ins, c.vk));
      expect(cpu.error).toBeUndefined(); expect(g.error).toBeUndefined();
      expect(cpu.value, 'CPU model').toEqual(cpuModel);
      expect(g.value, 'GPU model').toEqual(gpuModel);
      out[`N2 ${c.name} ${fname}`] = { cpu: cpu.value, gpu: g.value, implicitConversionWarned: warns.some((w) => w.includes('implicit-conversion')), wgsl: (g as Any).wgsl?.slice(0, 120) };
      expect(warns.some((w) => w.includes('implicit-conversion')), 'TypeGPU itself warns about this conversion').toBe(true);
    });
    if (fname === 'std.mul' && JSON.stringify(cpuModel) !== JSON.stringify(gpuModel))
      it.fails(`[PROBABLE DEFECT] ${c.name}: CPU result equals GPU result`, async () => {
        const cpu = cpuEval(f2, ins, c.vk), g = await gpuEvalSafe(f2, ins, c.vk);
        expect(cpu.value).toEqual(g.value);
      });
  }
  it('[observation] literal: `v * 1.5` (vec2i) is emitted as `v * 1i` (the abstract-float literal is truncated in the shader), CPU multiplies by 1.5', async () => {
    const f = (a: Any, b: Any) => { 'use gpu'; return a * 1.5; };
    const ins: In[] = [{ k: V2i, v: [10, 3] }, { k: F, v: 0 }];
    const cpu = cpuEval(f, ins, V2i), g = await gpuEvalSafe(f, ins, V2i);
    expect(cpu.value).toEqual([15, 4]); expect(g.value).toEqual([10, 3]);
    expect(g.wgsl).toContain('* 1i');
    out['N2 literal 1.5'] = { cpu: cpu.value, gpu: g.value };
  });
  it('[observation] constant-folded `X * F(1.9)` (vec2i X) is folded with the CONVERTED scalar: equals GPU runtime, not CPU runtime', async () => {
    const X = d.vec2i(10, 3), Fl = d.f32;
    const value = () => { 'use gpu'; return std.mul(X, Fl(1.9)); };
    const o: Any = root.createMutable(d.vec2i);
    try {
      const body = () => { 'use gpu'; o.$ = value(); };
      const { wgslOf, readRawBuffer, decode, sizeWords } = await import('./util.ts');
      const w = wgslOf(body);
      const dev = root.device as Any; dev.pushErrorScope('validation');
      root.createGuardedComputePipeline(body).dispatchThreads(1); const err = await dev.popErrorScope(); expect(err).toBeFalsy();
      const g = decode(V2i, await readRawBuffer(o, sizeWords(V2i)));
      out['N2 folded'] = { baked: g, wgsl: w.slice(-140) };
      expect(g).toEqual([10, 3]);
      expect(cpuEval((a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); }, [{ k: V2i, v: [10, 3] }, { k: F, v: Math.fround(1.9) }], V2i).value).toEqual([18, 5]);
    } finally { o.buffer.destroy(); }
  });
});

describe('N3: `v OP= scalar-of-another-type`: GPU shader is rejected (vectors) / scalar converted (scalars); binary OP works', () => {
  const vecCases: [string, Any, Any, Any, number[], Any][] = [
    ['vec2f *= i32', V2f, I, (a: Any, b: Any) => { 'use gpu'; let x = d.vec2f(a); x *= b; return x; }, [6, 9], [2, 3]],
    ['vec2f *= u32', V2f, U, (a: Any, b: Any) => { 'use gpu'; let x = d.vec2f(a); x *= b; return x; }, [6, 9], [2, 3]],
    ['vec2f += i32', V2f, I, (a: Any, b: Any) => { 'use gpu'; let x = d.vec2f(a); x += b; return x; }, [5, 6], [2, 3]],
    ['vec2i *= u32', V2i, U, (a: Any, b: Any) => { 'use gpu'; let x = d.vec2i(a); x *= b; return x; }, [6, 9], [2, 3]],
    ['vec2u *= i32', V2u, I, (a: Any, b: Any) => { 'use gpu'; let x = d.vec2u(a); x *= b; return x; }, [6, 9], [2, 3]],
    ['vec2i *= f32', V2i, F, (a: Any, b: Any) => { 'use gpu'; let x = d.vec2i(a); x *= b; return x; }, [2, 3], [2, 3]],
  ];
  const binary: Record<string, (a: Any, b: Any) => Any> = {
    'vec2f *= i32': (a: Any, b: Any) => { 'use gpu'; return a * b; }, 'vec2f *= u32': (a: Any, b: Any) => { 'use gpu'; return a * b; },
    'vec2f += i32': (a: Any, b: Any) => { 'use gpu'; return a + b; }, 'vec2i *= u32': (a: Any, b: Any) => { 'use gpu'; return a * b; },
    'vec2u *= i32': (a: Any, b: Any) => { 'use gpu'; return a * b; }, 'vec2i *= f32': (a: Any, b: Any) => { 'use gpu'; return a * b; },
  };
  for (const [name, vk, sk, f, , v] of vecCases) {
    const sv = sk === F ? 1.5 : 3;
    const ins: In[] = [{ k: vk, v }, { k: sk, v: sv }];
    it(`[observation] ${name}: CPU computes, GPU shader rejected at pipeline creation; the binary form of the same operation works`, async () => {
      const cpu = cpuEval(f, ins, vk), g = await gpuEvalSafe(f, ins, vk), bg = await gpuEvalSafe(binary[name]!, ins, vk);
      expect(cpu.error).toBeUndefined();
      expect(g.error, 'compound form must be rejected (current behaviour)').toMatch(/VALIDATION: .*no matching overload for 'operator [*+]= /);
      expect(bg.error, 'binary form compiles').toBeUndefined();
      out[`N3 ${name}`] = { cpu: cpu.value, compoundGpu: g.error, binaryGpu: bg.value };
    });
    it.fails(`[PROBABLE DEFECT] ${name}: compound form compiles and equals the binary form on the GPU`, async () => {
      const g = await gpuEvalSafe(f, ins, vk), bg = await gpuEvalSafe(binary[name]!, ins, vk);
      expect(g.error).toBeUndefined();
      expect(g.value).toEqual(bg.value);
    });
  }
  it('[observation] scalar `i32 *= f32` IS converted (x *= i32(b)): GPU 2, CPU 3 (same N2 family)', async () => {
    const f = (a: Any, b: Any) => { 'use gpu'; let x = d.i32(a); x *= b; return x; };
    const ins: In[] = [{ k: I, v: 2 }, { k: F, v: 1.5 }];
    const cpu = cpuEval(f, ins, I), g = await gpuEvalSafe(f, ins, I);
    expect(cpu.value).toBe(3); expect(g.value).toBe(2); expect(g.wgsl).toContain('x *= i32(b)');
    out['N3 i32 *= f32'] = { cpu: cpu.value, gpu: g.value };
  });
});

describe('N4: implicit conversions on scalar paths that the CPU cannot see (expected differences: plain JS numbers carry no type)', () => {
  it('[observation] std.fma on i32 operands: GPU converts to f32 (fma(f32(a), f32(b), ...)), CPU is exact: fma(16777217,1,0)', async () => {
    const f = (a: Any, b: Any) => { 'use gpu'; return std.fma(a, b, d.i32(0)); };
    const ins: In[] = [{ k: I, v: 16777217 }, { k: I, v: 1 }];
    const cpu = cpuEval(f, ins, I), g = await gpuEvalSafe(f, ins, I);
    expect(cpu.value).toBe(16777217); expect(g.value).toBe(16777216);
    out['N4 fma i32'] = { cpu: cpu.value, gpu: g.value, wgsl: g.wgsl?.slice(0, 100) };
  });
  it('[observation] u32 * i32 scalars: GPU emits i32(a) * b (u32 4294967295 becomes -1); CPU product 8589934590', async () => {
    const f = (a: Any, b: Any) => { 'use gpu'; return a * b; };
    const ins: In[] = [{ k: U, v: 4294967295 }, { k: I, v: 2 }];
    const cpu = cpuEval(f, ins, I), g = await gpuEvalSafe(f, ins, I);
    expect(cpu.value).toBe(8589934590); expect(g.value).toBe(-2); expect(g.wgsl).toContain('i32(a) * b');
    out['N4 u32*i32'] = { cpu: cpu.value, gpu: g.value };
  });
  it('[observation] vec2f * i32 / u32 scalar: converted to f32 on the GPU (exact for small values) and equal to the CPU', async () => {
    const f = (a: Any, b: Any) => { 'use gpu'; return a * b; };
    for (const sk of [I, U]) {
      const ins: In[] = [{ k: V2f, v: [2, 3] }, { k: sk, v: 3 }];
      expect(cpuEval(f, ins, V2f).value).toEqual([6, 9]);
      expect((await gpuEvalSafe(f, ins, V2f)).value).toEqual([6, 9]);
    }
  });
});

describe('N5: swizzle compound assignment `v.xy *= s`', () => {
  it('[observation] CPU throws (swizzle is a getter), GPU works (WGSL language feature swizzle_assignment)', async () => {
    const f = (a: Any, b: Any) => { 'use gpu'; const x = d.vec2f(a); x.xy *= b; return x; };
    const ins: In[] = [{ k: V2f, v: [2, 3] }, { k: F, v: 5 }];
    const cpu = cpuEval(f, ins, V2f), g = await gpuEvalSafe(f, ins, V2f);
    const feature = (gpuInstance as Any).wgslLanguageFeatures?.has?.('swizzle_assignment');
    out['N5'] = { cpu, gpu: g.value ?? g.error, wgslLanguageFeatureSwizzleAssignment: feature };
    expect(cpu.error).toMatch(/only a getter/);
    expect(g.value).toEqual([10, 15]);
  });
});
describe('N6: CPU is more permissive than the GPU for mutation of parameters / aliases (GPU rejects at resolve: loud)', () => {
  it('[observation] `a *= b` on a parameter and `let x = a; x.x *= 2`: CPU runs (and the alias mutates the CALLER\'s vector), GPU resolution error', async () => {
    const f1 = (a: Any, b: Any) => { 'use gpu'; a *= b; return a; };
    const f2 = (a: Any, b: Any) => { 'use gpu'; let x = a; x.x *= 2; return x; };
    const ins: In[] = [{ k: V2f, v: [2, 3] }, { k: F, v: 5 }];
    const g1 = await gpuEvalSafe(f1, ins, V2f), g2 = await gpuEvalSafe(f2, ins, V2f);
    const caller = d.vec2f(2, 3); const r2 = f2(caller, 5);
    const caller1 = d.vec2f(2, 3); f1(caller1, 5);
    out['N6'] = { f1Cpu: cpuEval(f1, ins, V2f).value, f1Gpu: g1.error?.slice(0, 200), f2Gpu: g2.error?.slice(0, 200), callerAfterF2: Array.from(caller), callerAfterF1: Array.from(caller1) };
    expect(g1.error).toContain('non-pointer arguments cannot be mutated');
    expect(g2.error).toContain("references cannot be assigned to 'let'");
    expect(Array.from(caller)).toEqual([4, 3]);
    expect(Array.from(caller1)).toEqual([2, 3]);
    void r2;
  });
});
describe('N7: invalid operand combinations: both sides fail loudly, but the GPU failure is a Dawn validation error, not a TypeGPU error', () => {
  const cases: [string, Any, Any, In[], Any][] = [
    ['mat3 * vec4', (a: Any, b: Any) => { 'use gpu'; return a * b; }, V4f, [{ k: M3, v: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] }, { k: V4f, v: [1, 2, 3, 4] }], V4f],
    ['vec3i * mat3', (a: Any, b: Any) => { 'use gpu'; return a * b; }, V3i, [{ k: V3i, v: [1, 2, 3] }, { k: M3, v: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] }], V3i],
    ['mat3 *= vec3', (a: Any, b: Any) => { 'use gpu'; let x = d.mat3x3f(a); x *= b; return x; }, V3f, [{ k: M3, v: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] }, { k: V3f, v: [1, 2, 3] }], V3f],
    ['mix(vec2i, vec2i, 0.5)', (a: Any, b: Any) => { 'use gpu'; return std.mix(a, a, 0.5); }, V2i, [{ k: V2i, v: [2, 3] }, { k: I, v: 2 }], V2i],
  ];
  for (const [name, f, , ins, ok] of cases) it(`[observation] ${name}`, async () => {
    const cpu = cpuEval(f, ins, ok), g = await gpuEvalSafe(f, ins, ok);
    out[`N7 ${name}`] = { cpu, gpu: g.error?.slice(0, 160) ?? g.value };
    if (name === 'mat3 *= vec3') expect(cpu.value, 'CPU silently re-types the variable (mat -> vec)').toEqual([30, 36, 42]);
    else expect(cpu.error).toBeTruthy();
    expect(g.error).toBeTruthy();
  });
});
describe('N8: f32 intermediate overflow in a sum of products (expected: CPU sums in f64)', () => {
  it('[observation] mat3 * vec3 with row (3e38, 3e38, -3e38) . (1,1,1): exact 3e38, CPU finite, GPU intermediate overflow', async () => {
    const f = (a: Any, b: Any) => { 'use gpu'; return a * b; };
    const big = Math.fround(3e38);
    const ins: In[] = [{ k: M3, v: [[big, 0, 0], [big, 0, 0], [-big, 0, 0]] }, { k: V3f, v: [1, 1, 1] }];
    const cpu = cpuEval(f, ins, V3f), g = await gpuEvalSafe(f, ins, V3f);
    out['N8'] = { cpu: cpu.value, gpu: g.value };
    expect(Number.isFinite((cpu.value as number[])[0]!)).toBe(true);
    expect(Number.isFinite((g.value as number[])[0]!), 'GPU: first component is inf/NaN (observation)').toBe(false);
  });
});
describe('N9: outside `use gpu`', () => {
  it('[observation] plain JS `a * b` on vectors is NaN (no operator overloading outside use-gpu code), `a.mul(b)` works and equals std.mul', () => {
    const plain = (a: Any, b: Any) => a * b;
    const r = plain(d.vec2f(2, 3), d.vec2f(5, 7));
    expect(Number.isNaN(r)).toBe(true);
    expect(Array.from(d.vec2f(2, 3).mul(d.vec2f(5, 7)))).toEqual([10, 21]);
    expect(Array.from(d.mat2x2f(1, 2, 3, 4).mul(d.vec2f(5, 7)))).toEqual([26, 38]);
  });
});
void tgpu; void errText; void M4;
