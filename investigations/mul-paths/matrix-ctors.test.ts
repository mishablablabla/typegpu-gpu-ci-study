import { afterAll, describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';
import { cpuEval, gpuEvalSafe, gamma, kind, type Any, type In } from './util.ts';
import { flatOut, oracleMul, fr } from './oracle.ts';
import { record } from './record.ts';

const out: Any = { ctors: [], products: [] };
afterAll(() => record('matrixCtors', out));
const M4 = kind('mat4x4f'), V3 = kind('vec3f'), F = kind('f32');

const translation = (v: number[]) => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [v[0]!, v[1]!, v[2]!, 1]];
const scaling = (v: number[]) => [[v[0]!, 0, 0, 0], [0, v[1]!, 0, 0], [0, 0, v[2]!, 0], [0, 0, 0, 1]];
const rotX = (a: number) => [[1, 0, 0, 0], [0, Math.cos(a), Math.sin(a), 0], [0, -Math.sin(a), Math.cos(a), 0], [0, 0, 0, 1]];
const rotY = (a: number) => [[Math.cos(a), 0, -Math.sin(a), 0], [0, 1, 0, 0], [Math.sin(a), 0, Math.cos(a), 0], [0, 0, 0, 1]];
const rotZ = (a: number) => [[Math.cos(a), Math.sin(a), 0, 0], [-Math.sin(a), Math.cos(a), 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
const mAsym = [[1, 2, 3, 4], [-5, 6, -7, 8], [9, -10, 11, 12], [-13, 14, 15, -16]];
const vecs = [[1, 2, 3], [-4, 0.5, 8], [0, 0, 0]];
const angles = [0, 0.5, 1, 2.5, -1.25, Math.PI / 2].map(fr);
const TRIG = 2 ** -11;

const ctorFns: Record<string, { f: (a: Any) => Any; ak: ReturnType<typeof kind>; ora: (x: Any) => number[][]; trig: boolean; args: Any[] }> = {
  translation4: { f: (a: Any) => { 'use gpu'; return d.mat4x4f.translation(a); }, ak: V3, ora: translation, trig: false, args: vecs },
  scaling4: { f: (a: Any) => { 'use gpu'; return d.mat4x4f.scaling(a); }, ak: V3, ora: scaling, trig: false, args: vecs },
  rotationX4: { f: (a: Any) => { 'use gpu'; return d.mat4x4f.rotationX(a); }, ak: F, ora: rotX, trig: true, args: angles },
  rotationY4: { f: (a: Any) => { 'use gpu'; return d.mat4x4f.rotationY(a); }, ak: F, ora: rotY, trig: true, args: angles },
  rotationZ4: { f: (a: Any) => { 'use gpu'; return d.mat4x4f.rotationZ(a); }, ak: F, ora: rotZ, trig: true, args: angles },
};
describe('[TypeGPU] matrix constructors: CPU (f64 trig) and GPU runtime vs f64 oracle', () => {
  for (const [name, c] of Object.entries(ctorFns)) it(name, async () => {
    for (const arg of c.args) {
      const ins: In[] = [{ k: c.ak, v: arg }];
      const cpu = cpuEval(c.f, ins, M4), gpu = await gpuEvalSafe(c.f, ins, M4);
      expect(cpu.error).toBeUndefined(); expect(gpu.error).toBeUndefined();
      const exp = c.ora(arg).flat(), cf = flatOut(M4, cpu.value!), gf = flatOut(M4, gpu.value!);
      cf.forEach((x, i) => expect(Math.abs(x - exp[i]!), `CPU ${name}(${arg}) [${i}]`).toBeLessThanOrEqual(2 ** -24 * Math.max(1, Math.abs(exp[i]!)) + 1e-12));
      gf.forEach((x, i) => expect(Math.abs(x - exp[i]!), `GPU ${name}(${arg}) [${i}]`).toBeLessThanOrEqual(c.trig ? TRIG : 0));
      out.ctors.push({ name, arg, maxCpuErr: Math.max(...cf.map((x, i) => Math.abs(x - exp[i]!))), maxGpuErr: Math.max(...gf.map((x, i) => Math.abs(x - exp[i]!))) });
    }
  });
});

const prodFns: Record<string, { f: (m: Any, a: Any) => Any; ak: ReturnType<typeof kind>; ctor: (x: Any) => number[][]; trig: boolean; args: Any[] }> = {
  translate4: { f: (m: Any, a: Any) => { 'use gpu'; return std.translate4(m, a); }, ak: V3, ctor: translation, trig: false, args: vecs },
  scale4: { f: (m: Any, a: Any) => { 'use gpu'; return std.scale4(m, a); }, ak: V3, ctor: scaling, trig: false, args: vecs },
  rotateX4: { f: (m: Any, a: Any) => { 'use gpu'; return std.rotateX4(m, a); }, ak: F, ctor: rotX, trig: true, args: angles },
  rotateY4: { f: (m: Any, a: Any) => { 'use gpu'; return std.rotateY4(m, a); }, ak: F, ctor: rotY, trig: true, args: angles },
  rotateZ4: { f: (m: Any, a: Any) => { 'use gpu'; return std.rotateZ4(m, a); }, ak: F, ctor: rotZ, trig: true, args: angles },
};
describe('[TypeGPU] translate4/scale4/rotate*4 = ctor(arg) * m  (asymmetric m): CPU and GPU vs f64 oracle', () => {
  for (const [name, c] of Object.entries(prodFns)) it(name, async () => {
    for (const arg of c.args) {
      const ins: In[] = [{ k: M4, v: mAsym }, { k: c.ak, v: arg }];
      const cpu = cpuEval(c.f, ins, M4), gpu = await gpuEvalSafe(c.f, ins, M4);
      expect(cpu.error).toBeUndefined(); expect(gpu.error).toBeUndefined();
      const R = c.ctor(arg), ora = oracleMul(M4, M4, R, mAsym);
      const cf = flatOut(M4, cpu.value!), gf = flatOut(M4, gpu.value!);
      ora.forEach((o, i) => {
        const col = Math.floor(i / 4), colAbs = mAsym[col]!.reduce((s, x) => s + Math.abs(x), 0);
        const base = gamma(4) * o.absSum;
        expect(Math.abs(cf[i]! - o.exact), `CPU ${name}(${arg}) [${i}]`).toBeLessThanOrEqual(base + 1e-9);
        expect(Math.abs(gf[i]! - o.exact), `GPU ${name}(${arg}) [${i}]`).toBeLessThanOrEqual(base + (c.trig ? TRIG * colAbs : 0));
      });
      out.products.push({ name, arg });
    }
  });
});
