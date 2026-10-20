import { afterAll, describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';
import { root } from '../../harness.ts';
import { cpuEval, gpuEvalSafe, kind, type Any, type In, type Logical, wgslOf } from './util.ts';
import { checkDot, flatOut, fr, gen, oracleAddSub, oracleMul } from './oracle.ts';
import { record } from './record.ts';

void root;
const nz = (x: number) => (x === 0 ? 0 : x);
const out: Record<string, Any> = { mulForms: [], addSub: [], constFold: [], ctors: [], misc: [] };
afterAll(() => record('float', out));

interface Form { name: string; lk: string; rk: string; ok: string; compound: boolean; method: boolean }
const forms = (n: number): Form[] => {
  const M = `mat${n}x${n}f`, V = `vec${n}f`;
  return [
    { name: 'mat*mat', lk: M, rk: M, ok: M, compound: true, method: true },
    { name: 'mat*vec', lk: M, rk: V, ok: V, compound: false, method: true },
    { name: 'vec*mat', lk: V, rk: M, ok: V, compound: true, method: true },
    { name: 'mat*s', lk: M, rk: 'f32', ok: M, compound: true, method: true },
    { name: 's*mat', lk: 'f32', rk: M, ok: M, compound: false, method: false },
    { name: 'vec*vec', lk: V, rk: V, ok: V, compound: true, method: true },
    { name: 'vec*s', lk: V, rk: 'f32', ok: V, compound: true, method: true },
    { name: 's*vec', lk: 'f32', rk: V, ok: V, compound: false, method: false },
  ];
};
const scalarForm: Form = { name: 's*s', lk: 'f32', rk: 'f32', ok: 'f32', compound: true, method: false };

const mkPaths = (lk: Any) => ({
  'std.mul': (a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); },
  'a*b': (a: Any, b: Any) => { 'use gpu'; return a * b; },
  'a.mul(b)': (a: Any, b: Any) => { 'use gpu'; return a.mul(b); },
  'a*=b': (a: Any, b: Any) => { 'use gpu'; let x = lk.schema(a); x *= b; return x; },
}) as Record<string, (a: Any, b: Any) => Any>;

const SETS: ('exact' | 'random' | 'cancel')[] = ['exact', 'random', 'cancel'];

describe('[TypeGPU/WGSL] f32 multiplication paths: CPU and GPU vs f64 oracle (runtime path, buffers)', () => {
  for (const n of [2, 3, 4]) for (const form of [...forms(n), ...(n === 2 ? [scalarForm] : [])]) {
    const lk = kind(form.lk), rk = kind(form.rk), ok = kind(form.ok);
    const paths = mkPaths(lk);
    for (const pathName of Object.keys(paths)) {
      if (pathName === 'a*=b' && !form.compound) continue;
      if (pathName === 'a.mul(b)' && !form.method) continue;
      it(`${n}: ${form.name} via ${pathName}`, async () => {
        const f = paths[pathName]!;
        for (const set of SETS) for (const seed of [1, 2]) {
          const a = gen(lk, set, seed * 2 - 1), b = gen(rk, set, seed * 2);
          const ora = oracleMul(lk, rk, a, b);
          const ins: In[] = [{ k: lk, v: a }, { k: rk, v: b }];
          const cpu = cpuEval(f, ins, ok), gpu = await gpuEvalSafe(f, ins, ok);
          expect(cpu.error, `CPU threw ${cpu.error}`).toBeUndefined();
          expect(gpu.error, `GPU failed ${gpu.error}`).toBeUndefined();
          const cfRaw = flatOut(ok, cpu.value!), gfRaw = flatOut(ok, gpu.value!), cf = cfRaw.map(nz), gf = gfRaw.map(nz);
          const zeroSignDiffers = cfRaw.some((x, i) => Object.is(x, -0) !== Object.is(gfRaw[i], -0));
          const cc = checkDot(cf, ora), gc = checkDot(gf, ora);
          out.mulForms.push({ n, form: form.name, path: pathName, set, seed, cpuOk: cc.ok, gpuOk: gc.ok, zeroSignDiffers, cpuWorst: cc.worstRatio, gpuWorst: gc.worstRatio });
          expect(cc.ok, `CPU outside bound ${JSON.stringify({ a, b, cf, exp: ora.map((o) => o.exact) })}`).toBe(true);
          expect(gc.ok, `GPU outside bound ${JSON.stringify({ a, b, gf, exp: ora.map((o) => o.exact) })}`).toBe(true);
          if (set === 'exact') {
            expect(cf).toEqual(ora.map((o) => nz(o.exact)));
            expect(gf).toEqual(ora.map((o) => nz(o.exact)));
          }
        }
      });
    }
  }
});

describe('[TypeGPU] + - += -= (and .add/.sub) on f32 vectors, matrices, scalars: exact data', () => {
  const cases: [string, string, string][] = [];
  for (const n of [2, 3, 4]) {
    const M = `mat${n}x${n}f`, V = `vec${n}f`;
    cases.push([M, M, M], [V, V, V], [V, 'f32', V], ['f32', V, V], ['f32', 'f32', 'f32']);
  }
  const fns = {
    'std.add': (a: Any, b: Any) => { 'use gpu'; return std.add(a, b); },
    'a+b': (a: Any, b: Any) => { 'use gpu'; return a + b; },
    'std.sub': (a: Any, b: Any) => { 'use gpu'; return std.sub(a, b); },
    'a-b': (a: Any, b: Any) => { 'use gpu'; return a - b; },
  } as Record<string, (a: Any, b: Any) => Any>;
  for (const [l, r, o] of cases) {
    it(`${l} , ${r}`, async () => {
      const lk = kind(l), rk = kind(r), ok = kind(o);
      const compFns: Record<string, (a: Any, b: Any) => Any> = (lk.name === o)
        ? {
          'a+=b': (a: Any, b: Any) => { 'use gpu'; let x = lk.schema(a); x += b; return x; },
          'a-=b': (a: Any, b: Any) => { 'use gpu'; let x = lk.schema(a); x -= b; return x; },
        } : {};
      const all = { ...fns, ...compFns };
      for (const [name, f] of Object.entries(all)) {
        const sign = name.includes('-') || name === 'std.sub' ? -1 : 1;
        for (const seed of [1, 2, 3]) {
          const a = gen(lk, 'exact', seed), b = gen(rk, 'exact', seed + 10);
          const ins: In[] = [{ k: lk, v: a }, { k: rk, v: b }];
          const cpu = cpuEval(f, ins, ok), gpu = await gpuEvalSafe(f, ins, ok);
          const exp = oracleAddSub(sign as 1 | -1, lk, rk, a, b);
          expect(cpu.error).toBeUndefined(); expect(gpu.error).toBeUndefined();
          expect(flatOut(ok, cpu.value!).map(nz), `${name} CPU`).toEqual(exp.map(nz));
          expect(flatOut(ok, gpu.value!).map(nz), `${name} GPU`).toEqual(exp.map(nz));
        }
        out.addSub.push({ l, r, op: name, ok: true });
      }
    });
  }
});

describe('[TypeGPU] *= += -= on struct fields, array elements, vector components (exact data)', () => {
  const S = d.struct({ v: d.vec3f, w: d.vec3f, s: d.f32 });
  const V3 = kind('vec3f'), F = kind('f32');
  const lv = [3, -2, 5], lw = [7, 4, -1];
  const cases: [string, (a: Any, b: Any) => Any, Logical, In[]][] = [
    ['struct.v *= struct.w', (a: Any, b: Any) => { 'use gpu'; const s = S({ v: a, w: b, s: 2 }); s.v *= s.w; return s.v; }, lv.map((x, i) => x * lw[i]!), [{ k: V3, v: lv }, { k: V3, v: lw }]],
    ['struct.v *= struct.s', (a: Any, b: Any) => { 'use gpu'; const s = S({ v: a, w: b, s: 3 }); s.v *= s.s; return s.v; }, lv.map((x) => x * 3), [{ k: V3, v: lv }, { k: V3, v: lw }]],
    ['struct.v += struct.w', (a: Any, b: Any) => { 'use gpu'; const s = S({ v: a, w: b, s: 3 }); s.v += s.w; return s.v; }, lv.map((x, i) => x + lw[i]!), [{ k: V3, v: lv }, { k: V3, v: lw }]],
    ['struct.v -= struct.w', (a: Any, b: Any) => { 'use gpu'; const s = S({ v: a, w: b, s: 3 }); s.v -= s.w; return s.v; }, lv.map((x, i) => x - lw[i]!), [{ k: V3, v: lv }, { k: V3, v: lw }]],
    ['struct.s *= 5', (a: Any, b: Any) => { 'use gpu'; const s = S({ v: a, w: b, s: 3 }); s.s *= 5; return d.vec3f(s.s); }, [15, 15, 15], [{ k: V3, v: lv }, { k: V3, v: lw }]],
    ['arr[1] *= arr[0] (distinct elements)', (a: Any, b: Any) => { 'use gpu'; const arr = d.arrayOf(d.vec3f, 2)([a, b]); arr[1] *= arr[0]; return arr[1]; }, lw.map((x, i) => x * lv[i]!), [{ k: V3, v: lv }, { k: V3, v: lw }]],
    ['arr[1] *= arr[1]', (a: Any, b: Any) => { 'use gpu'; const arr = d.arrayOf(d.vec3f, 2)([a, b]); arr[1] *= arr[1]; return arr[1]; }, lw.map((x) => x * x), [{ k: V3, v: lv }, { k: V3, v: lw }]],
    ['arr[i] *= s (dynamic i)', (a: Any, b: Any) => { 'use gpu'; const arr = d.arrayOf(d.vec3f, 2)([a, b]); const i = d.u32(b.x > 5 ? 1 : 0); arr[i] *= 3; return arr[1]; }, lw.map((x) => x * 3), [{ k: V3, v: lv }, { k: V3, v: lw }]],
    ['x.y *= s', (a: Any, b: Any) => { 'use gpu'; const x = d.vec3f(a); x.y *= 4; return x; }, [3, -8, 5], [{ k: V3, v: lv }, { k: V3, v: lw }]],
    ['x.y += s', (a: Any, b: Any) => { 'use gpu'; const x = d.vec3f(a); x.y += 4; return x; }, [3, 2, 5], [{ k: V3, v: lv }, { k: V3, v: lw }]],
    ['a *= a (self alias)', (a: Any, b: Any) => { 'use gpu'; let x = d.vec3f(a); x *= x; return x; }, lv.map((x) => x * x), [{ k: V3, v: lv }, { k: V3, v: lw }]],
    ['x = x * x', (a: Any, b: Any) => { 'use gpu'; let x = d.vec3f(a); x = x * x; return x; }, lv.map((x) => x * x), [{ k: V3, v: lv }, { k: V3, v: lw }]],
    ['x = x * y chain', (a: Any, b: Any) => { 'use gpu'; let x = d.vec3f(a); x = x * b * x; return x; }, lv.map((x, i) => x * lw[i]! * x), [{ k: V3, v: lv }, { k: V3, v: lw }]],
  ];
  for (const [name, f, exp, ins] of cases) {
    it(name, async () => {
      const cpu = cpuEval(f, ins, V3), gpu = await gpuEvalSafe(f, ins, V3);
      expect(cpu.error).toBeUndefined(); expect(gpu.error).toBeUndefined();
      expect(flatOut(V3, cpu.value!).map(nz)).toEqual((exp as number[]).map(nz)); expect(flatOut(V3, gpu.value!).map(nz)).toEqual((exp as number[]).map(nz));
      out.misc.push({ name, cpu: cpu.value, gpu: gpu.value, expected: exp });
    });
  }
  void F;
});

describe('[TypeGPU] constant-folded float products: baked WGSL value vs oracle (no `*` may remain in the shader)', () => {
  const bodies = {
    'std.mul': (X: Any, Y: Any) => () => { 'use gpu'; return std.mul(X, Y); },
    'a*b': (X: Any, Y: Any) => () => { 'use gpu'; return X * Y; },
    'a.mul(b)': (X: Any, Y: Any) => () => { 'use gpu'; return X.mul(Y); },
  } as Record<string, (X: Any, Y: Any) => () => Any>;
  for (const n of [2, 3, 4]) for (const form of forms(n)) {
    if (!form.method) continue;
    it(`${n}: ${form.name}`, async () => {
      await foldCase(n, form, bodies);
    });
  }
  for (const n of [2, 3, 4]) for (const form of forms(n)) {
    if (form.method) continue;
    it(`${n}: ${form.name} (std.mul and *)`, async () => {
      await foldCase(n, form, { 'std.mul': bodies['std.mul']!, 'a*b': bodies['a*b']! });
    });
  }
  async function foldCase(n: number, form: Form, bs: Record<string, (X: Any, Y: Any) => () => Any>) {
    const lk = kind(form.lk), rk = kind(form.rk), ok = kind(form.ok);
    for (const set of ['exact', 'random'] as const) {
      const a = gen(lk, set, 3), b = gen(rk, set, 4);
      const X = lk.mat || lk.vec ? (lk.schema as Any)(...(lk.mat ? (a as number[][]).flat() : (a as number[]))) : (a as number);
      const Y = rk.mat || rk.vec ? (rk.schema as Any)(...(rk.mat ? (b as number[][]).flat() : (b as number[]))) : (b as number);
      const ora = oracleMul(lk, rk, a, b);
      for (const [name, mk] of Object.entries(bs)) {
        const value = mk(X, Y);
        const o: Any = root.createMutable(ok.schema);
        try {
          const body = () => { 'use gpu'; o.$ = value(); };
          const wgsl = wgslOf(body);
          const folded = !/\*/.test(wgsl.replace(/\(\*/g, ''));
          const dev = root.device as Any;
          dev.pushErrorScope('validation');
          root.createGuardedComputePipeline(body).dispatchThreads(1);
          const err = await dev.popErrorScope();
          expect(err, String(err?.message)).toBeFalsy();
          const { readRawBuffer } = await import('./util.ts');
          const { decode, sizeWords } = await import('./util.ts');
          const g = decode(ok, await readRawBuffer(o, sizeWords(ok)));
          const gfRaw = flatOut(ok, g), gf = gfRaw.map(nz), chk = checkDot(gf, ora);
          const cpuRaw = flatOut(ok, cpuEval((x: Any, y: Any) => { 'use gpu'; return std.mul(x, y); }, [{ k: lk, v: a }, { k: rk, v: b }], ok).value!);
          const cpuVal = cpuRaw.map(nz);
          const signOfZeroDiffers = gfRaw.some((x, i) => Object.is(x, -0) !== Object.is(cpuRaw[i], -0));
          out.constFold.push({ n, form: form.name, path: name, set, folded, withinBound: chk.ok, bakedEqualsCpu: JSON.stringify(gf) === JSON.stringify(cpuVal), signOfZeroDiffers });
          expect(folded, `expected folding, WGSL: ${wgsl.slice(-300)}`).toBe(true);
          expect(chk.ok, `folded value outside bound ${JSON.stringify({ gf, exp: ora.map((q) => q.exact) })}`).toBe(true);
          expect(gf, 'WGSL literal round trip: baked GPU value must equal the CPU value').toEqual(cpuVal);
          if (set === 'exact') expect(gf).toEqual(ora.map((q) => nz(q.exact)));
        } finally { o.buffer.destroy(); }
      }
    }
  }
});

describe('negative controls (the criterion detects orientation and lane errors)', () => {
  for (const n of [2, 3, 4]) it(`${n}: mat*vec result is rejected for the vec*mat (transposed) answer, and a 1e-3 relative error is rejected`, async () => {
    const M = kind(`mat${n}x${n}f`), V = kind(`vec${n}f`);
    const m = gen(M, 'exact', 5), v = gen(V, 'exact', 6);
    const ora = oracleMul(M, V, m, v);
    const wrongOrientation = flatOut(V, cpuEval((a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); }, [{ k: V, v }, { k: M, v: m }], V).value!);
    const good = flatOut(V, cpuEval((a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); }, [{ k: M, v: m }, { k: V, v }], V).value!);
    expect(checkDot(good, ora).ok).toBe(true);
    expect(checkDot(wrongOrientation, ora).ok, 'transposed product must be detected').toBe(false);
    expect(checkDot(good.map((x) => x * (1 + 1e-3)), ora).ok).toBe(false);
    out.misc.push({ negativeControl: n, transposedDetected: !checkDot(wrongOrientation, ora).ok });
  });
});

describe('[TypeGPU] std.mix, std.dot, std.fma on f32', () => {
  const ts = [0, 0.25, 0.5, 0.75, 1, -0.5, 1.5].map(fr);
  for (const n of [2, 3, 4]) {
    const V = kind(`vec${n}f`), Fk = kind('f32');
    it(`${n}: mix(vec, vec, scalar t) and mix(vec, vec, vec t): exact data, exact result`, async () => {
      for (const t of ts) for (const seed of [1, 2]) {
        const x = gen(V, 'exact', seed) as number[], y = gen(V, 'exact', seed + 5) as number[];
        const exp = x.map((xi, i) => xi * (1 - t) + y[i]! * t);
        const fS = (a: Any, b: Any, c: Any) => { 'use gpu'; return std.mix(a, b, c); };
        const cpu = cpuEval(fS, [{ k: V, v: x }, { k: V, v: y }, { k: Fk, v: t }], V), g = await gpuEvalSafe(fS, [{ k: V, v: x }, { k: V, v: y }, { k: Fk, v: t }], V);
        expect(cpu.error).toBeUndefined(); expect(g.error).toBeUndefined();
        expect((cpu.value as number[]).map(nz)).toEqual(exp.map(nz)); expect((g.value as number[]).map(nz)).toEqual(exp.map(nz));
        const tv = x.map((_, i) => ts[(i + seed) % ts.length]!);
        const expV = x.map((xi, i) => xi * (1 - tv[i]!) + y[i]! * tv[i]!);
        const cpuV = cpuEval(fS, [{ k: V, v: x }, { k: V, v: y }, { k: V, v: tv }], V), gV = await gpuEvalSafe(fS, [{ k: V, v: x }, { k: V, v: y }, { k: V, v: tv }], V);
        expect((cpuV.value as number[]).map(nz)).toEqual(expV.map(nz)); expect((gV.value as number[]).map(nz)).toEqual(expV.map(nz));
      }
    });
    it(`${n}: dot(vec, vec) f32: within gamma_n bound, CPU and GPU`, async () => {
      for (const set of SETS) {
        const a = gen(V, set, 1) as number[], b = gen(V, set, 2) as number[];
        const f = (x: Any, y: Any) => { 'use gpu'; return std.dot(x, y); };
        const cpu = cpuEval(f, [{ k: V, v: a }, { k: V, v: b }], Fk), g = await gpuEvalSafe(f, [{ k: V, v: a }, { k: V, v: b }], Fk);
        const ora = [{ exact: a.reduce((s, x, i) => s + x * b[i]!, 0), absSum: a.reduce((s, x, i) => s + Math.abs(x * b[i]!), 0), n }];
        expect(checkDot([cpu.value as number], ora).ok, `CPU ${set}`).toBe(true);
        expect(checkDot([g.value as number], ora).ok, `GPU ${set}`).toBe(true);
      }
    });
  }
  it('[observation] std.fma on vectors has no CPU implementation (CPU throws MissingCpuImplError), GPU works', async () => {
    const V = kind('vec3f'), f = (a: Any, b: Any, c: Any) => { 'use gpu'; return std.fma(a, b, c); };
    const ins: In[] = [{ k: V, v: [1, 2, 3] }, { k: V, v: [4, 5, 6] }, { k: V, v: [1, 1, 1] }];
    const cpu = cpuEval(f, ins, V), g = await gpuEvalSafe(f, ins, V);
    out.misc.push({ fmaVec: { cpu, gpu: g.value } });
    expect(cpu.error).toMatch(/fma on vectors not implemented/); expect(g.value).toEqual([5, 11, 19]);
  });
});
