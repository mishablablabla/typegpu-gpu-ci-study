import fs from 'node:fs'; import path from 'node:path';
const ARGS = process.argv.slice(2).map((a) => (a.includes('=') ? a.replace(/=(.*)$/, (_, p) => '=' + path.resolve(p)) : path.resolve(a))); const outP = ARGS[0]; const sets = Object.fromEntries(ARGS.slice(1).map((a) => a.split('=')));
const here = path.dirname(new URL(import.meta.url).pathname);
const { judge, dec } = await import(path.join(here, 'evaluate-ext.mjs')); const { TY } = await import(path.resolve(here, '../lib/types.ts'));
const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; }; const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const ulp = (x) => { f32[0] = Math.abs(x); const e = (u32[0] >>> 23) & 255; return e === 0 ? 2 ** -149 : 2 ** (e - 127 - 23); };
const same = (a, b) => Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)) || (a === 0 && b === 0);
const out = { schema: 'groupC-analysis/1', datasets: {} };
for (const [label, p] of Object.entries(sets)) { const D = JSON.parse(fs.readFileSync(p, 'utf8')); const O = {};
  for (const g of D.groups) { const t = TY[g.type]; const o = (O[g.op] ??= { lanesWithCpu: 0, cpuNeGpu: 0, ulpHistogram: {}, maxUlp: 0, maxAbsDiff: 0, categoryPairs: {}, otherKinds: {}, unboundedReasons: {}, unboundedByInput: {} });
    for (const r of g.rows) for (let l = 0; l < t.lanes; l++) { const args = r.inputs.map((a) => dec(a.length > 1 ? a[l] : a[0])); const gv = dec(r.gpu[l]); const jg = judge(g.op, args, gv);
      if (jg.cat === 'indeterminate') { inc(o.unboundedReasons, jg.reason); if (jg.reason.startsWith('unbounded interval, finite')) { const x = args[0]; inc(o.unboundedByInput, x === 0 ? 'x = 0' : x < 0 && g.op === 'inverseSqrt' ? 'x < 0' : Math.abs(x) < 2 ** -126 ? 'subnormal x' : (g.op === 'sin' || g.op === 'cos') && Math.abs(x) > Math.PI + 1e-6 ? '|x| > pi' : 'other (overflow/underflow edge)'); } }
      if (typeof r.cpu === 'string') continue; o.lanesWithCpu++; const c = dec(r.cpu[l]); if (same(c, gv)) continue; o.cpuNeGpu++; const jc = judge(g.op, args, c); inc(o.categoryPairs, `cpu ${jc.cat} / gpu ${jg.cat}`);
      if (Number.isFinite(c) && Number.isFinite(gv) && c !== 0 && gv !== 0 && Math.abs(c) >= 2 ** -126 && Math.abs(gv) >= 2 ** -126) { const u = Math.abs(c - gv) / ulp(Math.max(Math.abs(c), Math.abs(gv))); o.maxUlp = Math.max(o.maxUlp, u); o.maxAbsDiff = Math.max(o.maxAbsDiff, Math.abs(c - gv)); inc(o.ulpHistogram, u <= 1 ? '<=1' : u <= 2 ? '<=2' : u <= 4 ? '<=4' : u <= 16 ? '<=16' : u <= 256 ? '<=256' : '>256'); } else inc(o.otherKinds, Number.isNaN(c) || Number.isNaN(gv) ? 'NaN involved' : !Number.isFinite(c) || !Number.isFinite(gv) ? 'inf involved' : 'zero/subnormal involved'); } }
  out.datasets[label] = O; }
fs.writeFileSync(outP, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
