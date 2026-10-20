import { create, globals } from 'webgpu';

Object.assign(globalThis, globals);
const gpu = create([]);

const adapter = await gpu.requestAdapter();
if (!adapter) throw new Error('requestAdapter returned null');

const info = adapter.info;
console.log('adapter.info', {
  vendor: info.vendor,
  architecture: info.architecture,
  device: info.device,
  description: info.description,
  isFallbackAdapter: info.isFallbackAdapter,
});
console.log('features', [...adapter.features].sort().join(', '));
console.log('has shader-f16:', adapter.features.has('shader-f16'));

const device = await adapter.requestDevice();
device.lost.then((l) => console.log('DEVICE LOST', l.reason, l.message));

const N = 64;
const module = device.createShaderModule({
  code: `
    @group(0) @binding(0) var<storage, read_write> data: array<u32>;
    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) id: vec3u) {
      if (id.x < ${N}u) { data[id.x] = id.x * 2u; }
    }`,
});
const ci = await module.getCompilationInfo();
console.log('compilation messages:', ci.messages.length);

const storage = device.createBuffer({
  size: N * 4,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
});
const staging = device.createBuffer({
  size: N * 4,
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
});
const pipeline = device.createComputePipeline({
  layout: 'auto',
  compute: { module, entryPoint: 'main' },
});
const bg = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: storage } }],
});

const enc = device.createCommandEncoder();
const pass = enc.beginComputePass();
pass.setPipeline(pipeline);
pass.setBindGroup(0, bg);
pass.dispatchWorkgroups(1);
pass.end();
enc.copyBufferToBuffer(storage, 0, staging, 0, N * 4);
device.queue.submit([enc.finish()]);

await staging.mapAsync(GPUMapMode.READ);
const result = new Uint32Array(staging.getMappedRange().slice(0));
staging.unmap();

const ok = result.every((v, i) => v === i * 2);
console.log('first 8:', Array.from(result.slice(0, 8)));
console.log(ok ? 'PASS: readback matches i*2' : 'FAIL: readback mismatch');

device.destroy();
process.exit(ok ? 0 : 1);
