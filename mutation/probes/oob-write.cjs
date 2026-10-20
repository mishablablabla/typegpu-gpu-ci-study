const { create, globals } = require('webgpu'); Object.assign(globalThis, globals);
(async () => { const gpu = create([]); globalThis.__gpu = gpu; const a = await gpu.requestAdapter(); const dev = await a.requestDevice();
  const N = 64; const buf = dev.createBuffer({ size: N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }); const rb = dev.createBuffer({ size: N * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const mk = (cmp) => dev.createComputePipeline({ layout: 'auto', compute: { module: dev.createShaderModule({ code: `@group(0) @binding(0) var<storage, read_write> d: array<u32, ${N}>; @compute @workgroup_size(128) fn main(@builtin(global_invocation_id) g: vec3u) { if (g.x ${cmp} ${N}u) { return; } d[g.x] = g.x * 2u + 1000u; }` }), entryPoint: 'main' } });
  const out = {}; for (const cmp of ['>=', '>']) { dev.queue.writeBuffer(buf, 0, new Uint32Array(N).fill(7)); const p = mk(cmp); const bg = dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }] });
    const e = dev.createCommandEncoder(); const c = e.beginComputePass(); c.setPipeline(p); c.setBindGroup(0, bg); c.dispatchWorkgroups(1); c.end(); e.copyBufferToBuffer(buf, 0, rb, 0, N * 4); dev.queue.submit([e.finish()]);
    await rb.mapAsync(GPUMapMode.READ); const v = new Uint32Array(rb.getMappedRange().slice(0)); rb.unmap(); out[cmp] = { last3: Array.from(v.slice(N - 3)), expectLast: (N - 1) * 2 + 1000 }; }
  console.log(JSON.stringify({ adapter: a.info.description, ...out })); process.exit(0); })();
