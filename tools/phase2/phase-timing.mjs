// usage: node phase-timing.mjs [N=30000] [K=30] [kernel=add]; one kernel per process: a second pipeline in the same process crashed/hung dawn.node
import { createRequire } from 'node:module'; const require = createRequire('/work/webgpu-poc/'); const w = require('/work/webgpu-poc/node_modules/webgpu'); Object.assign(globalThis, w.globals);
const N = +(process.argv[2] ?? 30000), K = +(process.argv[3] ?? 30); const now = () => performance.now(); const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const KERNELS = { add: 'x + y', pow: 'pow(x, y * 0.25)', sin: 'sin(x * 0.001 + y)', exp2: 'exp2(x * 0.01 - y * 0.01)' };
const out = { schema: 'phase-timing/1', N, K }; const t0 = now(); const gpu = w.create([]);
const a = await gpu.requestAdapter(); out.adapter = { vendor: a.info.vendor, architecture: a.info.architecture, device: a.info.device }; out.requestAdapter_ms = now() - t0;
const t1 = now(); const device = await a.requestDevice(); out.requestDevice_ms = now() - t1;
const x = new Float32Array(N), y = new Float32Array(N); for (let i = 0; i < N; i++) { x[i] = (i % 1000) * 0.01 + 0.5; y[i] = ((i * 7) % 997) * 0.01 + 0.25; }
const mk = (data, usage) => { const b = device.createBuffer({ size: N * 4, usage }); if (data) device.queue.writeBuffer(b, 0, data); return b; };
const bx = mk(x, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST), by = mk(y, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST), bo = mk(null, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC), st = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
out.kernels = {};
const ONLY = process.argv[4] ?? 'add'; for (const [name, expr] of Object.entries(KERNELS).filter(([k]) => k === ONLY)) { const R = {}; const c0 = now();
  const code = `@group(0) @binding(0) var<storage,read> X: array<f32>; @group(0) @binding(1) var<storage,read> Y: array<f32>; @group(0) @binding(2) var<storage,read_write> O: array<f32>;
    @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) { let i = id.x; if (i < ${N}u) { let x = X[i]; let y = Y[i]; O[i] = ${expr}; } }`;
  const module = device.createShaderModule({ code }); const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } }); R.compile_ms = now() - c0;
  const bg = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bx } }, { binding: 1, resource: { buffer: by } }, { binding: 2, resource: { buffer: bo } }] });
  const run = async () => { const s = now(); const e = device.createCommandEncoder(); const p = e.beginComputePass(); p.setPipeline(pipeline); p.setBindGroup(0, bg); p.dispatchWorkgroups(Math.ceil(N / 64)); p.end(); device.queue.submit([e.finish()]); await device.queue.onSubmittedWorkDone(); return now() - s; };
  R.first_submit_ms = await run(); const rep = []; for (let k = 0; k < K; k++) rep.push(await run()); R.steady_median_ms = med(rep); R.steady_min_ms = Math.min(...rep); R.steady_max_ms = Math.max(...rep);
  if (process.env.PT_NO_READBACK) { out.kernels[name] = R; continue; }
  const r0 = now(); const e = device.createCommandEncoder(); e.copyBufferToBuffer(bo, 0, st, 0, N * 4); device.queue.submit([e.finish()]); await st.mapAsync(GPUMapMode.READ); const res = new Float32Array(st.getMappedRange().slice(0)); st.unmap(); R.readback_ms = now() - r0;
  R.sanity = { finite: res.every(Number.isFinite), sample: [res[0], res[1], res[N - 1]] }; out.kernels[name] = R; }
out.maxRSS_kb = process.resourceUsage().maxRSS; out.process_uptime_ms = process.uptime() * 1000; console.log(JSON.stringify(out)); device.destroy(); process.exit(0);
