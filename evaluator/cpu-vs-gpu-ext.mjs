import fs from 'node:fs'; import path from 'node:path';
const ARGS = process.argv.slice(2).map((a) => path.resolve(a));
const { judge, dec, dec64 } = await import('./evaluate-ext.mjs'); const { TY } = await import(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../lib/types.ts'));
const D = JSON.parse(fs.readFileSync(ARGS[0], 'utf8')); const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const ulpOf = (x) => { f32[0] = Math.abs(x); const e = (u32[0] >>> 23) & 255; return e === 0 ? 2 ** -149 : 2 ** (e - 127 - 23); };
const out = { schema: 'cpu-vs-gpu-ext/1', lanesBothAvailable: 0, differ: 0, byOp: {}, categoryPairs: {}, kinds: {}, maxUlp: 0, examples: [] };
const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
for (const g of D.groups) { const t = TY[g.type]; for (const r of g.rows) { if (typeof r.cpu === 'string') continue;
  for (let l = 0; l < t.lanes; l++) { out.lanesBothAvailable++; const args = r.inputs.map((a) => dec(a.length > 1 ? a[l] : a[0])); const c = dec(r.cpu[l]), gv = dec(r.gpu[l]);
    const same = Object.is(c, gv) || (Number.isNaN(c) && Number.isNaN(gv)) || (c === 0 && gv === 0); if (same) continue; out.differ++; inc(out.byOp, g.op);
    const jc = judge(g.op, args, c, t.elem), jg = judge(g.op, args, gv, t.elem); inc(out.categoryPairs, `cpu ${jc.cat} / gpu ${jg.cat}`);
    const kind = Number.isNaN(c) || Number.isNaN(gv) ? 'NaN involved' : !Number.isFinite(c) || !Number.isFinite(gv) ? 'inf involved' : (Math.abs(c) < 2 ** -126 || Math.abs(gv) < 2 ** -126 || c === 0 || gv === 0) ? 'zero/subnormal involved' : 'normal finite'; inc(out.kinds, kind);
    if (kind === 'normal finite') out.maxUlp = Math.max(out.maxUlp, Math.abs(c - gv) / ulpOf(Math.max(Math.abs(c), Math.abs(gv))));
    if (out.examples.length < 12 && !(`${jc.cat}/${jg.cat}` === 'indeterminate/indeterminate')) out.examples.push({ id: r.id, lane: l, op: g.op, args, cpu: c, gpu: gv, cpuCat: jc.cat, gpuCat: jg.cat }); } } }
fs.writeFileSync(ARGS[1], JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v), 1));
