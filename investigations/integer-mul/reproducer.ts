import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { create, globals } from 'webgpu';
import { d, std, tgpu } from 'typegpu';
import { expect, it } from 'vitest';

Object.assign(globalThis, globals);
const gpu = create([]); // keep a strong reference for the whole process (dawn.node tears Dawn down on GC)
const INT_MAX = 2147483647;
type Any = any;

const version = (pkg: string) => JSON.parse(readFileSync(createRequire(import.meta.url).resolve(`${pkg}/package.json`), 'utf8')).version;

async function rawWgslMul(device: Any, a: number[], b: number[]): Promise<number[]> {
  const mk = (usage: number) => device.createBuffer({ size: 8, usage });
  const [A, B, O] = [mk(GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST), mk(GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST), mk(GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC)];
  device.queue.writeBuffer(A, 0, new Int32Array(a));
  device.queue.writeBuffer(B, 0, new Int32Array(b));
  const module = device.createShaderModule({ code: `
    @group(0) @binding(0) var<storage, read> a: vec2<i32>;
    @group(0) @binding(1) var<storage, read> b: vec2<i32>;
    @group(0) @binding(2) var<storage, read_write> o: vec2<i32>;
    @compute @workgroup_size(1) fn main() { o = a * b; }` });
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
  const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [A, B, O].map((buffer, binding) => ({ binding, resource: { buffer } })) });
  const staging = device.createBuffer({ size: 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(1); pass.end();
  enc.copyBufferToBuffer(O, 0, staging, 0, 8);
  device.queue.submit([enc.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const out = Array.from(new Int32Array(staging.getMappedRange().slice(0)));
  staging.unmap();
  return out;
}

it('REPRODUCER: std.mul(vec2i(INT_MAX), vec2i(INT_MAX)) differs between CPU and GPU', async () => {
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error('no WebGPU adapter');
  const device = await adapter.requestDevice();
  const root = tgpu.initFromDevice({ device });

  const wgsl: string[] = [];
  const orig = (device as Any).createShaderModule.bind(device);
  (device as Any).createShaderModule = (x: Any) => { wgsl.push(x.code); return orig(x); };

  const a = d.vec2i(INT_MAX, INT_MAX);
  const b = d.vec2i(INT_MAX, INT_MAX);
  const cpu = Array.from(std.mul(a, b) as Any as number[]);

  const A = root.createMutable(d.vec2i, a);
  const B = root.createMutable(d.vec2i, b);
  const O = root.createMutable(d.vec2i);
  root.createGuardedComputePipeline(() => { 'use gpu'; O.$ = std.mul(A.$, B.$); }).dispatchThreads();
  const gpuTypegpu = Array.from((await O.read()) as Any as number[]);

  const gpuRawWgsl = await rawWgslMul(device, [INT_MAX, INT_MAX], [INT_MAX, INT_MAX]);

  const exact = BigInt(INT_MAX) * BigInt(INT_MAX);
  const expected = Number(BigInt.asIntN(32, exact));

  const f64Product = INT_MAX * INT_MAX;
  const trace = { exactProduct: exact.toString(), f64Product: BigInt(f64Product).toString(), f64ProductIsExact: BigInt(f64Product) === exact, 'f64Product | 0 (i32 cast used by vec2i)': f64Product | 0 };

  const out = {
    versions: { typegpu: version('typegpu'), 'unplugin-typegpu': version('unplugin-typegpu'), webgpu: version('webgpu'), vitest: version('vitest'), node: process.version },
    adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, isFallbackAdapter: adapter.info.isFallbackAdapter },
    operation: 'std.mul(vec2i, vec2i)', inputs: { a: Array.from(a), b: Array.from(b) },
    expectedBigInt: [expected, expected], cpu, gpuTypegpu, gpuRawWgsl, cpuTrace: trace,
    generatedWgslShaderCount: wgsl.length,
    generatedWgsl: wgsl.find((w) => w.includes('var<storage')) ?? null,
    discrepancyReproduced: cpu[0] !== expected && gpuTypegpu[0] === expected,
  };
  mkdirSync(fileURLToPath(new URL('.', import.meta.url)), { recursive: true });
  writeFileSync(fileURLToPath(new URL('./reproducer-output.json', import.meta.url)), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));

  expect(gpuTypegpu).toEqual([expected, expected]);
  expect(gpuRawWgsl).toEqual([expected, expected]);
});
