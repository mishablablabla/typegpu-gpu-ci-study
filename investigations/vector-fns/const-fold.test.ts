import { afterAll, describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';
import { root } from '../../harness.ts';
import { CBS, CBV, RT } from './bodies.ts';
import { constArgs, constRun, cpuEval, fr, gpuBatch, ulpDist, type Any } from './common.ts';
import { EDGE, INTS, genRows } from './engine.ts';
import { SPECS } from './specs.ts';
import { saveSection } from './store.ts';

const fmt = (v: number) => (Number.isNaN(v) ? 'NaN' : !Number.isFinite(v) ? String(v) : Object.is(v, -0) ? '-0' : String(v));
const sections: Any = { generic: [], targeted: {} };
const wgslName = (n: string) => n;

describe('constant-folded vs runtime: sampled rows of every function', () => {
  for (const spec of SPECS) for (const dim of [0, 2, 3, 4].filter((x) => spec.dims.includes(x))) {
    const type = dim === 0 ? 'f32' : `vec${dim}f`;
    const body = spec.body ?? spec.name;
    it(`${spec.name}${spec.shapes[2] === 'S' && spec.name === 'mix' ? '_s' : ''} ${type}`, async () => {
      const lists = Array.isArray(spec.list) ? [{ tag: 'edge' as const, L: spec.list }] : [{ tag: 'edge' as const, L: EDGE }, { tag: 'int' as const, L: INTS }];
      const rows = genRows(spec, dim, lists, spec.shapes.length);
      const picks: number[] = [];
      const step = Math.max(1, Math.floor(rows.tags.length / (dim === 3 || dim === 0 ? 14 : 5)));
      for (let i = 0; i < rows.tags.length; i += step) picks.push(i);
      const argDims = spec.shapes.map((s) => (s === 'S' ? 0 : dim)), outDim = spec.out === 'S' ? 0 : dim;
      const sub = rows.argRows.map((a) => picks.map((i) => a[i]!));
      const gpu = await gpuBatch(RT[body]!, argDims, outDim, sub);
      const stat = { fn: spec.name + (spec.shapes[2] === 'S' && spec.name === 'mix' ? '_s' : ''), type, rows: picks.length, folded: 0, notFolded: 0, errors: {} as Record<string, number>, constEqualsCpu: 0, constNotCpu: 0, constEqualsRuntime: 0, constVsRuntimeUlp1to4: 0, constVsRuntimeGt4: 0, examples: [] as Any[], cpuMismatch: [] as Any[] };
      for (let k = 0; k < picks.length; k++) {
        const args = sub.map((a) => a[k]!);
        const vals = constArgs(spec.shapes, dim, args);
        const value = dim === 0 ? CBS[body]!(vals[0], vals[1], vals[2], d.f32) : CBV[body]!(vals[0], vals[1], vals[2]);
        const r = await constRun(value, outDim, wgslName(spec.name));
        if (r.error) { const key = r.error.replace(/\d+(\.\d+)?(e[+-]?\d+)?/g, '#').slice(0, 90); stat.errors[key] = (stat.errors[key] ?? 0) + 1; if (stat.examples.length < 4) stat.examples.push({ args: args.map((a) => a.map(fmt)), error: r.error }); continue; }
        r.folded ? stat.folded++ : stat.notFolded++;
        const cpu = cpuEval(RT[body]!, argDims, outDim, args), g = gpu[k]!;
        if (cpu.ok) { if (cpu.lanes.every((v, l) => ulpDist(v, r.lanes![l]!) === 0)) stat.constEqualsCpu++; else { stat.constNotCpu++; stat.cpuMismatch.push({ args: args.map((a) => a.map(fmt)), const: r.lanes!.map(fmt), cpu: cpu.lanes.map(fmt), cpuRaw: cpu.raw.map(fmt), folded: r.folded, wgsl: r.wgsl.slice(-160) }); } }
        const ulps = r.lanes!.map((v, l) => ulpDist(v, g[l]!));
        if (ulps.every((u) => u === 0)) stat.constEqualsRuntime++;
        else if (ulps.every((u) => typeof u === 'number' && u <= 4)) stat.constVsRuntimeUlp1to4++;
        else { stat.constVsRuntimeGt4++; if (stat.examples.length < 6) stat.examples.push({ args: args.map((a) => a.map(fmt)), const: r.lanes!.map(fmt), runtime: g.map(fmt), cpu: cpu.ok ? cpu.lanes.map(fmt) : 'threw', folded: r.folded }); }
      }
      sections.generic.push(stat);
      expect(stat.constNotCpu, `folded constant differs from CPU result: ${JSON.stringify(stat.cpuMismatch[0])}`).toBe(0);
    });
  }
});

describe('targeted constant-expression cases', () => {
  const run = async (name: string, dim: number, shapes: ('V' | 'S')[], args: number[][], body = name) => {
    const vals = constArgs(shapes, dim, args);
    const value = dim === 0 ? CBS[body]!(vals[0], vals[1], vals[2], d.f32) : CBV[body]!(vals[0], vals[1], vals[2]);
    const outDim = ['length', 'dot', 'distance'].includes(name) ? 0 : dim;
    const c = await constRun(value, outDim, name);
    const fn = RT[body]!, argDims = shapes.map((s) => (s === 'S' ? 0 : dim));
    const rt = (await gpuBatch(fn, argDims, outDim, argDims.map((_, j) => [args[j]!])))[0]!;
    const cpu = cpuEval(fn, argDims, outDim, args);
    return { const: c, runtime: rt, cpu };
  };
  const rec = (k: string, v: Any) => { sections.targeted[k] = v; };
  const show = (r: Any) => ({ constGpu: r.const.error ? `ERROR ${r.const.error}` : r.const.lanes.map(fmt), folded: r.const.folded, runtime: r.runtime.map(fmt), cpu: r.cpu.ok ? r.cpu.lanes.map(fmt) : `threw: ${r.cpu.error}` });

  it('[observation] length/normalize of ordinary-looking vectors: the baked constant is the mathematical value, the runtime GPU overflows/underflows (const != runtime)', async () => {
    const a = await run('length', 3, ['V'], [[1e20, 1e20, 1e20]]), b = await run('normalize', 3, ['V'], [[1e-30, 1e-30, 1e-30]]), c = await run('length', 3, ['V'], [[1e-20, 0, 0]]);
    rec('lengthBaked_1e20', show(a)); rec('normalizeBaked_1e-30', show(b)); rec('lengthBaked_1e-20', show(c));
    expect(a.const.folded && b.const.folded && c.const.folded).toBe(true);
    expect(a.const.lanes![0]).toBeGreaterThan(1.7e20); expect(a.runtime[0]).toBe(Infinity);
    expect(b.const.lanes![0]).toBeCloseTo(0.57735, 4); expect(b.runtime[0]).toBe(Infinity);
    expect(c.const.lanes![0]).toBeGreaterThan(9e-21); expect(c.runtime[0]).toBe(0);
  });
  it('[WGSL] constant overflow is a shader-creation error: length(vec3f(3e38)) = 5.2e38 baked from the f64 CPU value is rejected loudly (not silently inf)', async () => {
    const r = await run('length', 3, ['V'], [[3e38, 3e38, 3e38]]); rec('lengthOverflowBaked', show(r));
    expect(r.const.error).toBeTruthy();
    expect(r.runtime[0]).toBe(Infinity);
    const d1 = await run('dot', 3, ['V', 'V'], [[1e30, 0, 0], [1e30, 0, 0]]); rec('dotOverflowBaked', show(d1));
    expect(d1.const.error).toBeTruthy();
  });
  it('[TypeGPU] normalize(vec3f(0)) as a constant: loud resolve error (CPU would produce NaN); runtime GPU gives NaN', async () => {
    const r = await run('normalize', 3, ['V'], [[0, 0, 0]]); rec('normalizeZeroConst', show(r));
    expect(r.const.error).toMatch(/resolve/);
    expect(r.runtime.every(Number.isNaN)).toBe(true);
  });
  it('[observation] atan2(y, x) constants at x=-0 / origin: baked IEEE value vs the runtime GPU quirk', async () => {
    const a = await run('atan2', 0, ['S', 'S'], [[1], [-0]]), b = await run('atan2', 0, ['S', 'S'], [[0], [0]]);
    rec('atan2_1_m0', show(a)); rec('atan2_0_0', show(b));
    expect(a.const.lanes![0]).toBeCloseTo(Math.PI / 2, 6); expect(a.runtime[0]).toBeCloseTo(-Math.PI / 2, 6);
    expect(b.const.lanes![0]).toBe(0); expect(Number.isNaN(b.runtime[0]!)).toBe(true);
  });
  it('[observation] clamp(e, low, high) with low > high as constants: WGSL says shader-creation error for const-expressions; TypeGPU folds it to min(max(e,low),high) and Dawn accepts', async () => {
    const r = await run('clamp', 0, ['S', 'S', 'S'], [[5], [10], [0]]); rec('clampLowGtHighConst', show(r));
    expect(r.const.error).toBeFalsy(); expect(r.const.lanes![0]).toBe(0); expect(r.const.folded).toBe(true);
  });
  it('[observation] smoothstep(e, e, x) as constants: TypeGPU bakes 0 (no shader-creation error as the raw WGSL rule would give)', async () => {
    const r = await run('smoothstep', 0, ['S', 'S', 'S'], [[1], [1], [2]]); rec('smoothstepEqualConst', show(r));
    expect(r.const.error).toBeFalsy(); expect(r.const.lanes![0]).toBe(0); expect(r.const.folded).toBe(true);
  });
  it('[API limitation] round(vec) / trunc / faceForward / refract with constant arguments are NOT folded (emitted as WGSL calls) and still compute correctly', async () => {
    const r1 = await run('round', 3, ['V'], [[0.5, 2.5, -2.5]]), r2 = await run('faceForward', 3, ['V', 'V', 'V'], [[1, 2, 3], [0, 0, 1], [0, 0, 1]]), r3 = await run('refract', 3, ['V', 'V', 'S'], [[0, -1, 0], [0, 1, 0], [1.5]]), r4 = await run('trunc', 3, ['V'], [[-1.5, 0.5, 2.5]]);
    rec('notFolded', { round: show(r1), faceForward: show(r2), refract: show(r3), trunc: show(r4) });
    for (const r of [r1, r2, r3, r4]) { expect(r.const.folded).toBe(false); expect(r.const.error).toBeFalsy(); expect(r.cpu.ok).toBe(false); }
    expect(r1.const.lanes).toEqual([0, 2, -2]); expect(r2.const.lanes).toEqual([-1, -2, -3]); expect(r4.const.lanes).toEqual([-1, 0, 2]);
  });
  it('[WGSL] partially constant calls: clamp(x, 10, 0) / smoothstep(1, 1, x) with runtime x and constant bounds are rejected by Dawn (shader-creation error), while the fully constant forms above are folded and accepted', async () => {
    const dev = root.device as Any, xb: Any = root.createMutable(d.f32, 5), ob: Any = root.createMutable(d.f32);
    const tryIt = async (mk: () => Any) => { dev.pushErrorScope('validation'); try { mk().dispatchThreads(1); } catch (e) { await dev.popErrorScope(); return `exception: ${String((e as Error).message).slice(0, 120)}`; } const err = await dev.popErrorScope(); return err ? String(err.message).split('\n').slice(0, 1).join(' ').slice(0, 200) : 'accepted'; };
    const c = await tryIt(() => root.createGuardedComputePipeline(() => { 'use gpu'; ob.$ = std.clamp(xb.$, 10, 0); }));
    const s = await tryIt(() => root.createGuardedComputePipeline(() => { 'use gpu'; ob.$ = std.smoothstep(1, 1, xb.$); }));
    rec('partiallyConstInvalid', { 'clamp(x,10,0)': c, 'smoothstep(1,1,x)': s });
    expect(c).toMatch(/clamp called with 'low'.*greater than 'high'/);
    expect(s).toMatch(/smoothstep called with 'low'.*equal to 'high'/);
    for (const b of [xb, ob]) b.buffer.destroy();
  });
  it('[observation] round(2.5)/round(-2.5) folded scalar constants use ties-to-even like the GPU', async () => {
    const a = await run('round', 0, ['S'], [[2.5]]), b = await run('round', 0, ['S'], [[-2.5]]), c = await run('round', 0, ['S'], [[0.5]]);
    rec('roundConst', { a: show(a), b: show(b), c: show(c) });
    expect([a.const.lanes![0], b.const.lanes![0], c.const.lanes![0]]).toEqual([2, -2, 0]);
    expect(a.const.folded).toBe(true);
  });
});

afterAll(() => saveSection('constFold', sections));
