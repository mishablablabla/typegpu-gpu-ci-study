import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { root } from '../../harness.ts';
import { cpuMap, gpuMap, td, INT_MAX, INT_MIN, UINT_MAX, oneLine, I32_VALUES, U32_VALUES, O, type Any } from './lib.ts';

const OUT: Any = {};
afterAll(() => { mkdirSync(new URL('./raw', import.meta.url).pathname, { recursive: true }); writeFileSync(new URL('./raw/extras.json', import.meta.url).pathname, JSON.stringify(OUT, null, 1)); });

describe('[CPU support] integer builtins without a CPU implementation throw a clear "not implemented" error (direct call AND inside a use-gpu function)', () => {
  const calls: [string, () => unknown][] = [
    ['std.countOneBits', () => std.countOneBits(5)], ['std.reverseBits', () => std.reverseBits(5)], ['std.countLeadingZeros', () => std.countLeadingZeros(5)],
    ['std.countTrailingZeros', () => std.countTrailingZeros(5)], ['std.firstLeadingBit', () => std.firstLeadingBit(5)], ['std.firstTrailingBit', () => std.firstTrailingBit(5)],
    ['std.extractBits', () => std.extractBits(5, 0, 1)], ['std.insertBits', () => std.insertBits(5, 1, 0, 1)],
    ['std.dot4U8Packed', () => std.dot4U8Packed(5, 5)], ['std.dot4I8Packed', () => std.dot4I8Packed(5, 5)],
    ['std.countOneBits(vec3u)', () => std.countOneBits(d.vec3u(1, 2, 3))], ['std.extractBits(vec3i)', () => std.extractBits(d.vec3i(1, 2, 3), 0, 1)],
  ];
  const info: Any[] = [];
  for (const [name, call] of calls) {
    it(`${name}(...) throws MissingCpuImplError-style error`, () => {
      let err: Any;
      try { call(); } catch (e) { err = e; }
      expect(err, `${name} did not throw: it has a CPU implementation after all`).toBeDefined();
      info.push({ name, cls: err.constructor.name, message: String(err.message).slice(0, 90) });
      expect(String(err.message)).toMatch(/not implemented/i);
    });
  }
  it('[observation] error class / message recorded', () => { OUT.cpuMissing = info; expect(info.length).toBe(calls.length); });
  it('[observation] CPU-implemented neighbours for contrast: abs, sign, min, max, clamp, select, bitcast, pack4xI8 / unpack4xI8 compute a value', () => {
    expect(std.abs(-5)).toBe(5); expect(std.sign(-5)).toBe(-1); expect(std.min(1, 2)).toBe(1); expect(std.max(1, 2)).toBe(2); expect(std.clamp(5, 0, 3)).toBe(3);
    expect(std.select(1, 2, true)).toBe(2); expect(std.bitcast(d.i32, d.u32)(-1)).toBe(UINT_MAX); expect(std.pack4xI8(d.vec4i(1, 2, 3, 4))).toBe(0x04030201);
  });
});

describe('[bitcast] std.bitcast(from, to)(x) and deprecated bitcastU32toI32 / U32toF32 / F32toU32', () => {
  const f32buf = new DataView(new ArrayBuffer(4));
  const toF = (u: number) => { f32buf.setUint32(0, u >>> 0); return f32buf.getFloat32(0); };
  const toU = (f: number) => { f32buf.setFloat32(0, f); return f32buf.getUint32(0); };
  const isFiniteBits = (u: number) => ((u >>> 23) & 0xff) !== 0xff;
  const mk = (S: Any, D: Any) => (a: Any) => { 'use gpu'; return std.bitcast(S, D)(a); };
  const F32_VALUES = [0, 1, -1, 1.5, -2.5, 3.4028234663852886e38, -3.4028234663852886e38, 1.1754943508222875e-38, 123.456, 16777216, 0.1].map(Math.fround);
  const pairs: [string, string, 'i32' | 'u32' | 'f32', 'i32' | 'u32' | 'f32'][] = [
    ['i32', 'u32', 'i32', 'u32'], ['u32', 'i32', 'u32', 'i32'], ['i32', 'f32', 'i32', 'f32'], ['u32', 'f32', 'u32', 'f32'], ['f32', 'i32', 'f32', 'i32'], ['f32', 'u32', 'f32', 'u32'],
    ['vec3i', 'vec3u', 'i32', 'u32'], ['vec3u', 'vec3i', 'u32', 'i32'], ['vec3i', 'vec3f', 'i32', 'f32'], ['vec3u', 'vec3f', 'u32', 'f32'], ['vec3f', 'vec3i', 'f32', 'i32'], ['vec3f', 'vec3u', 'f32', 'u32'],
  ];
  const info: Any[] = [];
  for (const [from, to, fe, te] of pairs) {
    it(`bitcast ${from} -> ${to}: GPU runtime / CPU runtime / BigInt-free oracle (DataView)`, async () => {
      const A = (d as Any)[from], B = (d as Any)[to], tFrom = td(from), tTo = td(to);
      const fn = mk(A, B);
      let vals = fe === 'i32' ? I32_VALUES : fe === 'u32' ? U32_VALUES : F32_VALUES;
      if (te === 'f32') vals = vals.filter((v) => isFiniteBits(fe === 'i32' ? v >>> 0 : v));
      const lanes = tFrom.lanes;
      const cases = vals.map((_, i) => [Array.from({ length: lanes }, (_, l) => vals[(i + l * 3) % vals.length]!)]);
      const bitsOf = (v: number) => (fe === 'f32' ? toU(v) : v >>> 0);
      const conv = (b: number) => (te === 'f32' ? toF(b) : te === 'i32' ? b | 0 : b >>> 0);
      const want = cases.map((c) => c[0]!.map((v) => conv(bitsOf(v))));
      const gpu = await gpuMap(fn, [tFrom], cases, tTo);
      const gpuBad = gpu.filter((g, i) => g.some((v, k) => !Object.is(v, want[i]![k]) && !(v === 0 && want[i]![k] === 0)));
      const cpu = cpuMap(fn, [tFrom], cases, tTo.lanes);
      const cpuBad = cpu.filter((r, i) => r.threw || r.lanes!.some((v, k) => !Object.is(v, want[i]![k]) && !(v === 0 && want[i]![k] === 0)));
      info.push({ from, to, cases: cases.length, gpuMismatch: gpuBad.length, cpuMismatch: cpuBad.length, cpuFirst: cpuBad.slice(0, 2).map((r) => r.threw ?? r.lanes), gpuFirst: gpuBad.slice(0, 2) });
      expect(gpuBad.length, JSON.stringify(gpuBad.slice(0, 2))).toBe(0);
      expect(cpuBad.length, JSON.stringify(cpuBad.slice(0, 2))).toBe(0);
    });
  }
  it('[constants] bitcast folded on the CPU gives the same bits as the runtime path (u32 -> i32, i32 -> u32, f32 -> u32, u32 -> f32, 7 values each)', async () => {
    const run = async (S: Any, D: Any, x: number, fe: string, te: string) => {
      const X = S === d.f32 ? x : x;
      const out: Any = root.createMutable(D);
      const body = () => { 'use gpu'; return std.bitcast(S, D)(S(X)); };
      let wgsl = ''; try { wgsl = oneLine(tgpu.resolve([(() => { 'use gpu'; out.$ = body(); }) as Any])); } catch (e) { out.buffer.destroy(); return { error: String((e as Error).message).split('\n')[0] }; }
      (root.device as Any).pushErrorScope('validation');
      root.createGuardedComputePipeline(() => { 'use gpu'; out.$ = body(); }).dispatchThreads(1);
      const err = await (root.device as Any).popErrorScope();
      const v = err ? undefined : Number(await out.read());
      out.buffer.destroy();
      return { v, err: err ? String(err.message).split('\n')[0] : undefined, wgsl: wgsl.slice(-60) };
    };
    const bad: Any[] = [], intMinRejected: Any[] = [];
    for (const [S, D, fe, te, vals] of [[d.u32, d.i32, 'u32', 'i32', [0, 1, UINT_MAX, 2147483648, 2147483647, 0xdeadbeef, 0x80000001]], [d.i32, d.u32, 'i32', 'u32', [0, 1, -1, INT_MAX, -2147483647, 0x12345678, -0x12345678]],
      [d.f32, d.u32, 'f32', 'u32', [0, 1, -1, 1.5, 3.4028234663852886e38, 1.1754943508222875e-38, 123.456]], [d.u32, d.f32, 'u32', 'f32', [0, 0x3f800000, 0xbf800000, 0x3fc00000, 0x7f7fffff, 0x00800000, 0x42f6e979]]] as Any[]) {
      for (const x of vals as number[]) {
        const r: Any = await run(S, D, x, fe, te);
        const inBits = fe === 'f32' ? toU(Math.fround(x)) : x >>> 0;
        const want = te === 'f32' ? toF(inBits) : te === 'i32' ? inBits | 0 : inBits >>> 0;
        if (r.error || r.err || !Object.is(r.v, want)) (want === INT_MIN && te === 'i32' ? intMinRejected : bad).push({ fe, te, x, got: r.v, want, err: r.error ?? r.err, wgsl: r.wgsl });
      }
    }
    OUT.bitcastConst = { bad, intMinRejected };
    expect(intMinRejected.length).toBeGreaterThan(0);
    expect(bad, JSON.stringify(bad.slice(0, 3))).toEqual([]);
  });
  it('[observation] deprecated bitcastU32toI32 / bitcastU32toF32 / bitcastF32toU32: CPU result vs oracle', () => {
    expect(std.bitcastU32toI32(UINT_MAX)).toBe(-1);
    expect(std.bitcastU32toI32(2147483648)).toBe(INT_MIN);
    expect(std.bitcastU32toF32(0x3f800000)).toBe(1);
    expect(std.bitcastF32toU32(1)).toBe(0x3f800000);
    expect(Array.from(std.bitcastU32toI32(d.vec2u(UINT_MAX, 2147483648)) as Any)).toEqual([-1, INT_MIN]);
  });
  it('[TypeGPU] bitcast between unsupported pairs throws a clear error (i32 -> vec3u)', () => {
    expect(() => (std.bitcast as Any)(d.i32, d.vec3u)).toThrow(/Incorrect bitcast/);
  });
  it('[observation] results', () => { OUT.bitcast = info; expect(info.length).toBe(pairs.length); });
});

describe('[observation] shift amount given as i32 / f32 and Math.clz32 on floats: CPU (JS ToUint32/ToInt32) vs GPU (WGSL conversion)', () => {
  const shlTyped = (a: Any, s: Any) => { 'use gpu'; return a << s; };
  const clz = (a: Any) => { 'use gpu'; return Math.clz32(a); };
  it('x << (i32 s): negative s: GPU u32(s) reinterprets bits == JS ToUint32, so CPU == GPU', async () => {
    const S = [-1, -2, -31, -32, -33, INT_MIN, 5, 33];
    const cases = S.map((s) => [[1], [s]]);
    const gpu = await gpuMap(shlTyped, [td('u32'), td('i32')], cases, td('u32'));
    const cpu = cpuMap(shlTyped, [td('u32'), td('i32')], cases, 1);
    const want = S.map((s) => O.shl('u32', [1, Number(BigInt.asUintN(32, BigInt(s)))]));
    OUT.shiftI32 = { S, gpu: gpu.map((g) => g[0]), cpu: cpu.map((c) => c.lanes?.[0]), want };
    expect(gpu.map((g) => g[0])).toEqual(want);
  });
  it('x << (f32 s) with s outside [0, 2^32): GPU saturates (WGSL f32->u32), JS wraps (ToUint32): CPU != GPU (low impact)', async () => {
    const S = [0, 1, 3.7, 31.9, 32, 33.5, -1, -1.5, -33, 1e10, 3e9, 4294967296, 1e20].map(Math.fround);
    const cases = S.map((s) => [[1], [s]]);
    const gpu = await gpuMap(shlTyped, [td('i32'), td('f32')], cases, td('i32'));
    const cpu = cpuMap(shlTyped, [td('i32'), td('f32')], cases, 1);
    const sat = (f: number) => Math.min(Math.max(Math.trunc(f), 0), 4294967040);
    const want = S.map((s) => O.shl('i32', [1, sat(s)]));
    const rows = S.map((s, i) => ({ s, gpu: gpu[i]![0], cpu: cpu[i]!.lanes?.[0], oracle: want[i], cpuEqGpu: gpu[i]![0] === cpu[i]!.lanes?.[0] }));
    OUT.shiftF32 = rows;
    expect(gpu.map((g) => g[0])).toEqual(want);
    OUT.shiftF32Diff = rows.filter((r) => !r.cpuEqGpu).map((r) => r.s);
    expect(OUT.shiftF32Diff.length).toBeGreaterThan(0);
  });
  it('Math.clz32(f32 x): GPU = countLeadingZeros(i32(x)) (saturating), JS = ToUint32(x) (wrapping)', async () => {
    const X = [0, 1, 3.7, -1.5, 255.9, 2147483648, 3e9, 5e9, -5e9, 4294967295].map(Math.fround);
    const cases = X.map((x) => [[x]]);
    const gpu = await gpuMap(clz, [td('f32')], cases, td('i32'));
    const cpu = cpuMap(clz, [td('f32')], cases, 1);
    const sat32 = (f: number) => Math.min(Math.max(Math.trunc(f), INT_MIN), 2147483520);
    const want = X.map((x) => O.countLeadingZeros('i32', [sat32(x)]));
    const rows = X.map((x, i) => ({ x, gpu: gpu[i]![0], cpu: cpu[i]!.lanes?.[0], oracle: want[i] }));
    OUT.clz32Float = rows;
    expect(gpu.map((g) => g[0])).toEqual(want);
    OUT.clz32FloatDiff = rows.filter((r) => r.gpu !== r.cpu).map((r) => r.x);
  });
});

describe('[select] std.select with boolean-vector condition on integer vectors', () => {
  const sel3 = (f: Any, t: Any, c: Any) => { 'use gpu'; return std.select(f, t, d.vec3b(c.x !== 0, c.y !== 0, c.z !== 0)); };
  for (const tn of ['vec3i', 'vec3u']) {
    it(`select(${tn}, ${tn}, vec3b) CPU == GPU == oracle`, async () => {
      const vals = tn === 'vec3i' ? I32_VALUES : U32_VALUES, t = td(tn);
      const cases: number[][][] = [];
      for (let i = 0; i < 24; i++) cases.push([[vals[i % vals.length]!, vals[(i + 1) % vals.length]!, vals[(i + 2) % vals.length]!], [vals[(i + 5) % vals.length]!, vals[(i + 7) % vals.length]!, vals[(i + 9) % vals.length]!], [i & 1, (i >> 1) & 1, (i >> 2) & 1]]);
      const want = cases.map(([f, tt, c]) => f!.map((_, k) => (c![k] ? tt![k]! : f![k]!)));
      const gpu = await gpuMap(sel3, [t, t, td('vec3u')], cases, t);
      const cpu = cpuMap(sel3, [t, t, td('vec3u')], cases, 3);
      expect(gpu).toEqual(want);
      expect(cpu.map((r) => r.threw ?? r.lanes)).toEqual(want);
    });
  }
});

describe('[JS literal arguments] ops called with plain JS numbers inside a use-gpu body', () => {
  it('[observation] std.countOneBits(0xFFFFFFFF) (literal > INT_MAX) is typed i32 and emitted as `4294967295i` -> Dawn rejects (shader invalid, no JS exception)', async () => {
    const body = () => { 'use gpu'; return std.countOneBits(0xffffffff); };
    const w = tgpu.resolve([body as Any]);
    OUT.literalU32Max = { wgsl: oneLine(w) };
    expect(w).toMatch(/4294967295i/);
  });
  it('[observation] std.countOneBits(d.u32(0xFFFFFFFF)) is the working spelling', async () => {
    const body = () => { 'use gpu'; return std.countOneBits(d.u32(0xffffffff)); };
    expect(oneLine(tgpu.resolve([body as Any]))).toMatch(/countOneBits\(4294967295u\)/);
  });
});
export { INT_MAX };
