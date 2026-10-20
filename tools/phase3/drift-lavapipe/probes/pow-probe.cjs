const path = require('node:path'); const w = require('/work/webgpu-poc/node_modules/webgpu'); Object.assign(globalThis, w.globals);
(async () => {
  globalThis.__gpu = w.create([]); const adapter = await globalThis.__gpu.requestAdapter(); const device = await adapter.requestDevice(); const N = 4096;
  const inp = new Float32Array(N); let s = 12345; for (let i = 0; i < N; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; inp[i] = (s >>> 8) / 16777216; }
  const code = `@group(0) @binding(0) var<storage, read> xs: array<f32>; @group(0) @binding(1) var<storage, read_write> out: array<vec4f>; @group(0) @binding(2) var<uniform> e: f32;
  @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) { let i = id.x; if (i >= ${N}u) { return; } let u = xs[i]; let n = normalize(vec3f(u, 1.0 - u, 0.5 * u)); out[i] = vec4f(pow(u, 0.33), pow(u, e), exp2(0.33 * log2(u)), n.x); }`;
  const mk = (size, usage, data) => { const b = device.createBuffer({ size, usage }); if (data) device.queue.writeBuffer(b, 0, data); return b; };
  const xs = mk(N * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, inp), out = mk(N * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC), un = mk(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, new Float32Array([0.33, 0, 0, 0])), rd = mk(N * 16, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
  const pipe = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code }), entryPoint: 'main' } });
  const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: xs } }, { binding: 1, resource: { buffer: out } }, { binding: 2, resource: { buffer: un } }] });
  const enc = device.createCommandEncoder(); const pass = enc.beginComputePass(); pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(N / 64); pass.end(); enc.copyBufferToBuffer(out, 0, rd, 0, N * 16); device.queue.submit([enc.finish()]);
  await rd.mapAsync(GPUMapMode.READ); const r = new Uint32Array(rd.getMappedRange().slice(0)); const hex = (x) => x.toString(16).padStart(8, '0');
  const cols = { p_const: [], p_rt: [], p_exp2: [], nrm: [] }; for (let i = 0; i < N; i++) { cols.p_const.push(hex(r[i * 4])); cols.p_rt.push(hex(r[i * 4 + 1])); cols.p_exp2.push(hex(r[i * 4 + 2])); cols.nrm.push(hex(r[i * 4 + 3])); }
  require('node:fs').writeSync(1, JSON.stringify({ adapter: adapter.info.description, N, inputs: Array.from(new Uint32Array(inp.buffer)).map(hex), ...cols }) + '\n'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
