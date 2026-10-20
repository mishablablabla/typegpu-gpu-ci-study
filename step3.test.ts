import { create, globals } from 'webgpu';
import { tgpu, d, std } from 'typegpu';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

Object.assign(globalThis, globals);

// Keep a strong reference for the whole process: dawn.node tears down Dawn when this is GC'd.
const gpu = create([]);

const N = 4096;

let device: GPUDevice;
let root: ReturnType<typeof tgpu.initFromDevice>;
const captured: { label: string; code: string; module: GPUShaderModule }[] = [];
let currentLabel = '';

beforeAll(async () => {
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error('requestAdapter returned null');
  device = await adapter.requestDevice();

  const orig = device.createShaderModule.bind(device);
  device.createShaderModule = (desc: GPUShaderModuleDescriptor) => {
    const module = orig(desc);
    captured.push({ label: currentLabel, code: desc.code, module });
    return module;
  };
  root = tgpu.initFromDevice({ device });
});

afterAll(() => {
  root.destroy();
  device.destroy();
});

async function assertCompilesClean() {
  let total = 0;
  for (const c of captured) {
    const info = await c.module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === 'error');
    total += 1;
    if (errors.length > 0) {
      throw new Error(`[${c.label}] WGSL errors: ${errors.map((e) => e.message).join('; ')}\n${c.code}`);
    }
  }
  return total;
}

describe('E3: generated WGSL compiles on the real compiler', () => {
  it('struct + vec3f math + branching + loop', async () => {
    currentLabel = 'struct-vec-loop';
    const Particle = d.struct({ pos: d.vec3f, vel: d.vec3f, mass: d.f32 });
    const particles = root.createMutable(d.arrayOf(Particle, 16));
    const sums = root.createMutable(d.arrayOf(d.f32, 16));
    device.pushErrorScope('validation');
    root
      .createGuardedComputePipeline((i) => {
        'use gpu';
        const p = Particle({ pos: d.vec3f(i, 1, 2), vel: d.vec3f(0.5, 0.25, 0.125), mass: 2 });
        let acc = d.f32(0);
        for (let k = 0; k < 4; k++) {
          acc += std.length(p.pos.add(p.vel.mul(k))) * p.mass;
        }
        if (acc > 10) {
          acc = std.sqrt(acc);
        }
        particles.$[i] = Particle(p);
        sums.$[i] = acc;
      })
      .dispatchThreads(16);
    const out = await sums.read();
    const err = await device.popErrorScope();
    expect(err?.message).toBeUndefined();
    expect(out.length).toBe(16);
    expect(out.every((v) => Number.isFinite(v))).toBe(true);
    const n = await assertCompilesClean();
    console.log('compiled shaders so far:', n);
  });

  it('every captured shader is clean', async () => {
    const n = await assertCompilesClean();
    console.log('total shaders compiled clean:', n);
    expect(n).toBeGreaterThan(0);
  });
});

const f32buf = new Float32Array(1);
const u32buf = new Uint32Array(f32buf.buffer);
function ordered(f: number) {
  f32buf[0] = f;
  const u = u32buf[0]!;
  return u & 0x80000000 ? 0x80000000 - (u & 0x7fffffff) : u + 0x80000000;
}
function ulpDist(a: number, b: number) {
  return Math.abs(ordered(a) - ordered(b));
}

function makeInputs(lo: number, hi: number) {
  let s = 12345;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000);
  return Array.from({ length: N }, () => Math.fround(lo + (hi - lo) * rnd()));
}

type Row = { fn: string; range: string; maxAbs: number; maxRel: number; maxUlp: number };
const rows: Row[] = [];

async function runUnary(
  name: string,
  range: [number, number],
  build: (inp: any, out: any) => { dispatchThreads: (n: number) => void },
  ref: (x: number) => number,
) {
  currentLabel = `E4-${name}`;
  const xs = makeInputs(range[0], range[1]);
  const inp = root.createMutable(d.arrayOf(d.f32, N), xs);
  const out = root.createMutable(d.arrayOf(d.f32, N));
  build(inp, out).dispatchThreads(N);
  const gpu = await out.read();
  let maxAbs = 0,
    maxRel = 0,
    maxUlp = 0;
  for (let i = 0; i < N; i++) {
    const r = ref(xs[i]!);
    const rf = Math.fround(r);
    const abs = Math.abs(gpu[i]! - r);
    maxAbs = Math.max(maxAbs, abs);
    if (Math.abs(r) > 1e-30) maxRel = Math.max(maxRel, abs / Math.abs(r));
    maxUlp = Math.max(maxUlp, ulpDist(gpu[i]!, rf));
  }
  rows.push({ fn: name, range: `[${range[0]}, ${range[1]}]`, maxAbs, maxRel, maxUlp });
}

describe('E4: CPU vs GPU parity (Metal here)', () => {
  it('sin', () => runUnary('sin', [-Math.PI, Math.PI], (i, o) => root.createGuardedComputePipeline((x) => { 'use gpu'; o.$[x] = std.sin(i.$[x]); }), Math.sin));
  it('cos', () => runUnary('cos', [-Math.PI, Math.PI], (i, o) => root.createGuardedComputePipeline((x) => { 'use gpu'; o.$[x] = std.cos(i.$[x]); }), Math.cos));
  it('exp', () => runUnary('exp', [-10, 10], (i, o) => root.createGuardedComputePipeline((x) => { 'use gpu'; o.$[x] = std.exp(i.$[x]); }), Math.exp));
  it('log', () => runUnary('log', [0.001, 1000], (i, o) => root.createGuardedComputePipeline((x) => { 'use gpu'; o.$[x] = std.log(i.$[x]); }), Math.log));
  it('sqrt', () => runUnary('sqrt', [0, 1000], (i, o) => root.createGuardedComputePipeline((x) => { 'use gpu'; o.$[x] = std.sqrt(i.$[x]); }), Math.sqrt));
  it('tanh', () => runUnary('tanh', [-5, 5], (i, o) => root.createGuardedComputePipeline((x) => { 'use gpu'; o.$[x] = std.tanh(i.$[x]); }), Math.tanh));
  it('mul (x*x)', () => runUnary('mul x*x', [-100, 100], (i, o) => root.createGuardedComputePipeline((x) => { 'use gpu'; o.$[x] = i.$[x] * i.$[x]; }), (v) => v * v));

  it('report + shaders clean', async () => {
    console.table(rows);
    const n = await assertCompilesClean();
    console.log('total shaders compiled clean:', n);
    for (const r of rows) expect(Number.isFinite(r.maxAbs)).toBe(true);
  });
});
