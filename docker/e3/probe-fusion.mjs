import { create, globals } from 'webgpu';
Object.assign(globalThis, globals);
const gpu = create([]);
const adapter = await gpu.requestAdapter();
const dev = await adapter.requestDevice();
const f = Math.fround;
const pairs = [[2, f(0.1)], [2, -f(0.1)], [-2, f(0.1)], [-2, -f(0.1)], [3, f(0.1)], [3, -f(0.1)], [3, f(0.3)], [16777216, f(10.445635795593262)], [65504, f(0.1)], [65504, -f(0.1)], [1.5, f(0.1)], [1.5, -f(0.1)],
  [6, f(0.1)], [6, -f(0.1)], [6, f(0.3)], [9, f(0.1)], [9, -f(0.1)], [10, f(0.1)], [10, -f(0.1)], [691, f(0.1)], [691, -f(0.1)], [1382, f(0.1)], [1382, -f(0.1)], [2073, f(0.1)], [2073, -f(0.1)]];
const n = pairs.length, S = GPUBufferUsage.STORAGE;
const mk = (usage) => dev.createBuffer({ size: n * 4, usage });
const A = mk(S | GPUBufferUsage.COPY_DST), B = mk(S | GPUBufferUsage.COPY_DST);
dev.queue.writeBuffer(A, 0, new Float32Array(pairs.map((p) => p[0]))); dev.queue.writeBuffer(B, 0, new Float32Array(pairs.map((p) => p[1])));
const read = async (buf) => { const st = mk(GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ); const e = dev.createCommandEncoder(); e.copyBufferToBuffer(buf, 0, st, 0, n * 4); dev.queue.submit([e.finish()]); await st.mapAsync(GPUMapMode.READ); const r = Array.from(new Float32Array(st.getMappedRange().slice(0))); st.unmap(); return r; };
async function kernel(body, outputs, extraRead = {}) {
  const names = ['a', 'b', ...Object.keys(extraRead), ...outputs];
  const decl = names.map((nm, i) => `@group(0) @binding(${i}) var<storage, ${outputs.includes(nm) ? 'read_write' : 'read'}> ${nm}: array<f32>;`).join('\n');
  const m = dev.createShaderModule({ code: `${decl}\n@compute @workgroup_size(1) fn main(@builtin(global_invocation_id) g: vec3u) { let i = g.x; let x = a[i]; let y = b[i]; ${body} }` });
  const pl = dev.createComputePipeline({ layout: 'auto', compute: { module: m, entryPoint: 'main' } });
  const bufs = { a: A, b: B, ...extraRead }; for (const o of outputs) bufs[o] = mk(S | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
  const bg = dev.createBindGroup({ layout: pl.getBindGroupLayout(0), entries: names.map((nm, i) => ({ binding: i, resource: { buffer: bufs[nm] } })) });
  const enc = dev.createCommandEncoder(); const pass = enc.beginComputePass(); pass.setPipeline(pl); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(n); pass.end(); dev.queue.submit([enc.finish()]); await dev.queue.onSubmittedWorkDone();
  const res = {}; for (const o of outputs) res[o] = { buf: bufs[o], vals: await read(bufs[o]) }; return res;
}
const K1 = (await kernel('r[i] = x % y;', ['r'])).r.vals;
const K2 = (await kernel('let t = trunc(x / y); r[i] = x - y * t;', ['r'])).r.vals;
const K3 = (await kernel('let t = trunc(x / y); r[i] = fma(-y, t, x);', ['r'])).r.vals;
const P = (await kernel('p[i] = y * trunc(x / y);', ['p'])).p;
const K4 = (await kernel('r[i] = x - p[i];', ['r'], { p: P.buf })).r.vals;
const KC = await kernel('r1[i] = x % y; let t = trunc(x / y); r2[i] = x - y * t; r3[i] = fma(-y, t, x); pp[i] = y * t;', ['r1', 'r2', 'r3', 'pp']);
const U = (x, y) => { const t = Math.trunc(f(x / y)); return f(x - f(y * t)); }, F = (x, y) => { const t = Math.trunc(f(x / y)); return f(x - y * t); };
const variants = { K1_mod: K1, K2_expr: K2, K3_fma: K3, K4_twoDispatch: K4, KC_mod: KC.r1.vals, KC_expr: KC.r2.vals, KC_fma: KC.r3.vals };
const res = { adapter: adapter.info.device, pairs: n, pairsWhereUandFDiffer: 0 };
for (const k of Object.keys(variants)) res[k] = { eqU: 0, eqF: 0, neither: 0 };
pairs.forEach(([x, y], i) => { const u = U(x, y), fu = F(x, y); if (u === fu) return; res.pairsWhereUandFDiffer++; for (const [k, v] of Object.entries(variants)) { const g = v[i]; if (g === u) res[k].eqU++; else if (g === fu) res[k].eqF++; else res[k].neither++; } });
console.log(JSON.stringify(res));
process.exit(0);
