import { create, globals } from 'webgpu';
Object.assign(globalThis, globals);
const gpu = create([]); // keep referenced
const adapter = await gpu.requestAdapter();
const device = await adapter.requestDevice();
const cases = [[0, 0], [-0, 0], [0, -0], [-0, -0], [1, 0], [1, -0], [-1, 0], [-1, -0], [0, 1], [-0, 1], [0, -1], [-0, -1], [1, 1e-40], [1, -1e-40]];
const inp = new Float32Array(cases.flat());
const mk = (size, usage) => device.createBuffer({ size, usage });
const bin = mk(inp.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST), bout = mk(cases.length * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
const stg = mk(cases.length * 4, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
device.queue.writeBuffer(bin, 0, inp);
const module = device.createShaderModule({ code: `
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read_write> o: array<f32>;
@compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id: vec3u) { let i = id.x; o[i] = atan2(a[2u*i], a[2u*i+1u]); }` });
const pipe = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bin } }, { binding: 1, resource: { buffer: bout } }] });
const enc = device.createCommandEncoder(); const p = enc.beginComputePass(); p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(cases.length); p.end();
enc.copyBufferToBuffer(bout, 0, stg, 0, cases.length * 4); device.queue.submit([enc.finish()]);
await stg.mapAsync(GPUMapMode.READ);
const res = new Float32Array(stg.getMappedRange().slice(0));
const f = (v) => (Object.is(v, -0) ? '-0' : String(v));
for (const [i, [y, x]] of cases.entries()) console.log(`atan2(${f(y)}, ${f(x)}) gpu=${f(res[i])}  js=${f(Math.atan2(y, x))}`);
