import { create, globals } from 'webgpu'; Object.assign(globalThis, globals);
const gpu = create([]); globalThis.__gpu = gpu; const a = await gpu.requestAdapter(); const d = await a.requestDevice();
const wgsl = `
struct P { m: vec4f, c: f32, }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read_write> o: array<u32>;
@compute @workgroup_size(1) fn main() {
  let x = 16.0; // runtime-ish via uniform below
  let c = p.c;
  let d0 = x - c;               // +0
  o[0] = bitcast<u32>(d0);
  o[1] = bitcast<u32>(d0 * p.m.x);     // m = -1.5  -> -0 expected
  o[2] = bitcast<u32>(d0 * p.m.y);     // m = +1.5
  o[3] = bitcast<u32>(vec3f(d0, d0, d0).x * p.m.x);
  let v = (vec3f(16.0, 3.0, 16.0) - vec3f(c)) * p.m.x;
  o[4] = bitcast<u32>(v.x); o[5] = bitcast<u32>(v.z);
  o[6] = bitcast<u32>(-d0);            // -(+0) = -0
  o[7] = bitcast<u32>(0.0 * -1.0);     // const-folded
  o[8] = bitcast<u32>(p.m.w * 0.0);    // m.w = -0.0 -> -0 * 0 = -0? (-0*+0 = -0)
}`;
const mod = d.createShaderModule({ code: wgsl });
const U = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
d.queue.writeBuffer(U, 0, new Float32Array([-1.5, 1.5, 0, -0.0, 16.0, 0, 0, 0]));
const O = d.createBuffer({ size: 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
const S = d.createBuffer({ size: 64, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
const bgl = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }, { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }] });
const pipe = d.createComputePipeline({ layout: d.createPipelineLayout({ bindGroupLayouts: [bgl] }), compute: { module: mod, entryPoint: 'main' } });
const bg = d.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: U } }, { binding: 1, resource: { buffer: O } }] });
const enc = d.createCommandEncoder(); const pass = enc.beginComputePass(); pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(1); pass.end(); enc.copyBufferToBuffer(O, 0, S, 0, 64); d.queue.submit([enc.finish()]);
await S.mapAsync(GPUMapMode.READ); const r = new Uint32Array(S.getMappedRange().slice(0));
console.log(JSON.stringify({ adapter: a.info.description.slice(0, 60), bits: [...r].slice(0, 9).map((x) => x.toString(16).padStart(8, '0')) })); process.exit(0);
