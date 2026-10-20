import { create, globals } from 'webgpu';
Object.assign(globalThis, globals);
const gpu = create([]);
const adapter = await gpu.requestAdapter();
const hasF16 = adapter.features.has('shader-f16');
const dev = await adapter.requestDevice({ requiredFeatures: hasF16 ? ['shader-f16'] : [] });
async function run(body, input, nOut, f16 = false) {
  const code = `${f16 ? 'enable f16;' : ''}
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read_write> o: array<f32>;
@compute @workgroup_size(1) fn main() { ${body} }`;
  const mod = dev.createShaderModule({ code });
  const ib = dev.createBuffer({ size: input.length * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  dev.queue.writeBuffer(ib, 0, new Float32Array(input));
  const ob = dev.createBuffer({ size: nOut * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const st = dev.createBuffer({ size: nOut * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const pl = dev.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });
  const bg = dev.createBindGroup({ layout: pl.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ib } }, { binding: 1, resource: { buffer: ob } }] });
  const enc = dev.createCommandEncoder(); const p = enc.beginComputePass(); p.setPipeline(pl); p.setBindGroup(0, bg); p.dispatchWorkgroups(1); p.end();
  enc.copyBufferToBuffer(ob, 0, st, 0, nOut * 4); dev.queue.submit([enc.finish()]);
  await st.mapAsync(GPUMapMode.READ); const r = Array.from(new Float32Array(st.getMappedRange().slice(0))); st.unmap(); return r;
}
const res = { adapter: adapter.info.device };
const v = [-1, 4, -1];
res['normalize(v)'] = await run('let v = vec3f(a[0], a[1], a[2]); let r = normalize(v); o[0]=r.x; o[1]=r.y; o[2]=r.z;', v, 3);
res['v / length(v)'] = await run('let v = vec3f(a[0], a[1], a[2]); let r = v / length(v); o[0]=r.x; o[1]=r.y; o[2]=r.z;', v, 3);
res['v * inverseSqrt(dot(v,v))'] = await run('let v = vec3f(a[0], a[1], a[2]); let r = v * inverseSqrt(dot(v,v)); o[0]=r.x; o[1]=r.y; o[2]=r.z;', v, 3);
res['length(v)'] = await run('let v = vec3f(a[0], a[1], a[2]); o[0] = length(v); o[1] = sqrt(dot(v,v));', v, 2);
res['pow(7f,1f)'] = await run('o[0] = pow(a[0], a[1]);', [7, 1], 1);
res['exp2(1*log2(7))'] = await run('o[0] = exp2(a[1] * log2(a[0]));', [7, 1], 1);
if (hasF16) {
  res['pow(vec4h(2,3,4,5), vec4h(2,3,0,1))'] = await run('let x = vec4h(vec4f(a[0],a[1],a[2],a[3])); let y = vec4h(vec4f(a[4],a[5],a[6],a[7])); let r = vec4f(pow(x, y)); o[0]=r.x; o[1]=r.y; o[2]=r.z; o[3]=r.w;', [2, 3, 4, 5, 2, 3, 0, 1], 4, true);
  res['pow(3h,3h)'] = await run('let r = f32(pow(f16(a[0]), f16(a[1]))); o[0] = r;', [3, 3], 1, true);
  res['exp2(3*log2(3)) in f16'] = await run('let r = f32(exp2(f16(a[1]) * log2(f16(a[0])))); o[0] = r;', [3, 3], 1, true);
}
console.log(JSON.stringify(res));
process.exit(0);
