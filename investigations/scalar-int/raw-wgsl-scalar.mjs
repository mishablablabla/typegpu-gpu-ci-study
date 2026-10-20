import { writeFileSync } from 'node:fs';
import { create, globals } from 'webgpu';
Object.assign(globalThis, globals);
const gpu = create([]); // keep referenced
const adapter = await gpu.requestAdapter(); const device = await adapter.requestDevice();
const f32b = new Float32Array(1), u32b = new Uint32Array(f32b.buffer);
const fbits = (x) => { f32b[0] = x; return u32b[0]; };
const bitsf = (b) => { u32b[0] = b >>> 0; return f32b[0]; };
const results = [];
const view = { i32: (w) => w | 0, u32: (w) => w >>> 0, f32: (w) => bitsf(w) };
async function rt(name, body, inWords, types) {
  const code = `@group(0) @binding(0) var<storage, read> inp: array<u32, 4>;\n@group(0) @binding(1) var<storage, read_write> o: array<u32, 4>;\n@compute @workgroup_size(1) fn main() { ${body} }`;
  device.pushErrorScope('validation');
  const m = device.createShaderModule({ code });
  const info = await m.getCompilationInfo();
  const errs = info.messages.filter((x) => x.type === 'error').map((x) => x.message.split('\n')[0]);
  await device.popErrorScope();
  if (errs.length) { console.log(`${name.padEnd(46)} REJECTED: ${errs[0]}`); results.push({ name, rejected: errs[0] }); return; }
  const ib = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(ib, 0, new Uint32Array([...inWords, 0, 0, 0, 0].slice(0, 4)));
  const ob = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const stg = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const bgl = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }] });
  const p = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }), compute: { module: m, entryPoint: 'main' } });
  const bg = device.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: { buffer: ib } }, { binding: 1, resource: { buffer: ob } }] });
  const enc = device.createCommandEncoder(); const pass = enc.beginComputePass(); pass.setPipeline(p); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(1); pass.end();
  enc.copyBufferToBuffer(ob, 0, stg, 0, 16); device.queue.submit([enc.finish()]); await stg.mapAsync(GPUMapMode.READ);
  const w = new Uint32Array(stg.getMappedRange().slice(0));
  const vals = types.map((t, i) => view[t](w[i]));
  console.log(`${name.padEnd(46)} accepted -> ${vals.join(', ')}`);
  results.push({ name, values: vals });
  stg.unmap();
}
const I = (...xs) => xs.map((x) => x >>> 0), F = (...xs) => xs.map(fbits);
const MIN = -2147483648, MAX = 2147483647, UMAX = 4294967295;
for (const x of [-1, -1.5, 1.7, 2147483520, 2147483648, 3e9, -3e9, 4294967040, 4294967296, 5e9, 1e20, -1e20, 3.4028235e38, Infinity, NaN])
  await rt(`runtime i32(f32 ${x}), u32(f32 ${x})`, 'let f = bitcast<f32>(inp[0]); o[0] = bitcast<u32>(i32(f)); o[1] = u32(f);', F(x), ['i32', 'u32']);
for (const [n, e, t] of [['u32(-1f) const', 'u32(-1f)', 'u32'], ['u32(-1.5f) const', 'u32(-1.5f)', 'u32'], ['i32(3e9f) const', 'i32(3e9f)', 'i32'], ['u32(5e9f) const', 'u32(5e9f)', 'u32'], ['i32(2147483648f) const', 'i32(2147483648f)', 'i32'], ['u32(4294967296f) const', 'u32(4294967296f)', 'u32']])
  await rt(n, `const c = ${e}; o[0] = ${t === 'i32' ? 'bitcast<u32>(c)' : 'c'};`, [], [t]);
await rt('i32 MIN / -1, MIN % -1, MIN / 0, 7 % 0', 'let a = bitcast<i32>(inp[0]); let b = bitcast<i32>(inp[1]); let z = bitcast<i32>(inp[2]); o[0] = bitcast<u32>(a / b); o[1] = bitcast<u32>(a % b); o[2] = bitcast<u32>(a / z); o[3] = bitcast<u32>(7i % z);', I(MIN, -1, 0), ['i32', 'i32', 'i32', 'i32']);
await rt('u32 7 / 0, 7 % 0, UMAX / 3', 'let a = inp[0]; let z = inp[1]; o[0] = a / z; o[1] = a % z; o[2] = inp[2] / 3u;', I(7, 0, UMAX), ['u32', 'u32', 'u32']);
await rt('i32 abs(MIN), -MIN, MIN-1, MAX+1, MIN*MIN, sign(MIN)', 'let a = bitcast<i32>(inp[0]); o[0] = bitcast<u32>(abs(a)); o[1] = bitcast<u32>(-a); o[2] = bitcast<u32>(a - bitcast<i32>(inp[1])); o[3] = bitcast<u32>(bitcast<i32>(inp[2]) + bitcast<i32>(inp[1]));', I(MIN, 1, MAX), ['i32', 'i32', 'i32', 'i32']);
await rt('u32 shifts: 1<<31, 1<<32(rt), 0x80000000>>1, ~0, UMAX&UMAX', 'let a = inp[0]; let s = inp[1]; o[0] = a << 31u; o[1] = a << s; o[2] = 0x80000000u >> 1u; o[3] = ~inp[2];', I(1, 32, 0), ['u32', 'u32', 'u32', 'u32']);
await rt('i32(f32(47)/f32(47)), i32(f32(47)%f32(47)), f32 47/47', 'let a = bitcast<i32>(inp[0]); let b = bitcast<i32>(inp[1]); let q = f32(a) / f32(b); o[0] = bitcast<u32>(i32(q)); o[1] = bitcast<u32>(i32(f32(a) % f32(b))); o[2] = bitcast<u32>(q);', I(47, 47), ['i32', 'i32', 'f32']);
await rt('i32(f32(MAX)/f32(3)), i32(f32(MAX)%f32(3))', 'let a = bitcast<i32>(inp[0]); let b = bitcast<i32>(inp[1]); o[0] = bitcast<u32>(i32(f32(a) / f32(b))); o[1] = bitcast<u32>(i32(f32(a) % f32(b)));', I(MAX, 3), ['i32', 'i32']);
await rt('i32 hand integer 47/47, MAX/3, MAX%3', 'let a = bitcast<i32>(inp[0]); let b = bitcast<i32>(inp[1]); o[0] = bitcast<u32>(a / b); o[1] = bitcast<u32>(bitcast<i32>(inp[2]) / 3); o[2] = bitcast<u32>(bitcast<i32>(inp[2]) % 3);', I(47, 47, MAX), ['i32', 'i32', 'i32']);
writeFileSync(new URL('./raw-wgsl.json', import.meta.url), JSON.stringify(results, null, 1));
process.exit(0);
