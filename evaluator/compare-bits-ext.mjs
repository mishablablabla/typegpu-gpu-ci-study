import fs from 'node:fs'; import path from 'node:path';
const ARGS = process.argv.slice(2).map((a) => (a.includes('=') ? a.replace(/=(.*)$/, (_, p) => '=' + path.resolve(p)) : path.resolve(a)));
const outP = ARGS[0]; const sets = Object.fromEntries(ARGS.slice(1).map((a) => a.split('=')));
const here = path.dirname(new URL(import.meta.url).pathname);
const { judge, dec } = await import(path.join(here, 'evaluate-ext.mjs')); const { TY } = await import(path.resolve(here, '../lib/types.ts'));
const D = Object.fromEntries(Object.entries(sets).map(([k, p]) => [k, JSON.parse(fs.readFileSync(p, 'utf8'))])); const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const flat = (d) => { const m = new Map(); for (const g of d.groups) for (const r of g.rows) m.set(r.id, { r, g }); return m; }; const F = Object.fromEntries(Object.entries(D).map(([k, d]) => [k, flat(d)]));
const same = (a, b) => Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)) || (a === 0 && b === 0);
const operandClass = (args) => (args.some(Number.isNaN) ? 'NaN operand' : args.some((v) => !Number.isFinite(v)) ? 'inf operand' : args.some((v) => v !== 0 && Math.abs(v) < 2 ** -126) ? 'subnormal operand' : 'normal/zero operands');
const out = { schema: 'ext-bits-pairs/1', pairs: {} }; const labels = Object.keys(sets);
for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) { const a = labels[i], b = labels[j];
  const P = { rows: 0, rowsInputBitsDiffer: 0, cpu: { rowsBitsDiffer: 0, lanesBitsDiffer: 0, lanesNaNSignOnly: 0 }, gpu: { lanesBitsDiffer: 0, lanesNaNSignOnlyDiffer: 0, lanesValueDiffer: 0, byOperandClass: {}, byKind: {}, categoryChanges: {} }, rowsStatusDiffer: 0, lanes: 0 };
  for (const [id, { r: ra, g }] of F[a]) { const { r: rb } = F[b].get(id); const t = TY[g.type]; P.rows++; if (JSON.stringify(ra.inputs) !== JSON.stringify(rb.inputs)) P.rowsInputBitsDiffer++; if (ra.status !== rb.status) P.rowsStatusDiffer++;
    if (JSON.stringify(ra.cpu) !== JSON.stringify(rb.cpu)) P.cpu.rowsBitsDiffer++;
    for (let l = 0; l < t.lanes; l++) { P.lanes++; const args = ra.inputs.map((x) => dec(x.length > 1 ? x[l] : x[0]));
      if (typeof ra.cpu !== 'string' && typeof rb.cpu !== 'string' && ra.cpu[l] !== rb.cpu[l]) { P.cpu.lanesBitsDiffer++; if (Number.isNaN(dec(ra.cpu[l])) && Number.isNaN(dec(rb.cpu[l]))) P.cpu.lanesNaNSignOnly++; }
      if (ra.gpu[l] !== rb.gpu[l]) { P.gpu.lanesBitsDiffer++; const x = dec(ra.gpu[l]), y = dec(rb.gpu[l]);
        if (Number.isNaN(x) && Number.isNaN(y)) P.gpu.lanesNaNSignOnlyDiffer++; else if (!same(x, y)) { P.gpu.lanesValueDiffer++; inc(P.gpu.byOperandClass, operandClass(args)); inc(P.gpu.byKind, Number.isNaN(x) || Number.isNaN(y) ? 'NaN vs non-NaN' : !Number.isFinite(x) || !Number.isFinite(y) ? 'inf vs finite' : x === 0 || y === 0 || Math.abs(x) < 2 ** -126 || Math.abs(y) < 2 ** -126 ? 'zero/subnormal involved' : 'normal finite'); }
        const ca = judge(g.op, args, x, t.elem).cat, cb = judge(g.op, args, y, t.elem).cat; if (ca !== cb) inc(P.gpu.categoryChanges, `${ca} -> ${cb}`); } } }
  out.pairs[`${a} vs ${b}`] = P; }
out.cpuNeGpu = {}; for (const k of labels) { const T = { lanesWithCpu: 0, differ: 0, byOperandClass: {}, byKind: {} }; for (const [id, { r, g }] of F[k]) { if (typeof r.cpu === 'string') continue; const t = TY[g.type]; for (let l = 0; l < t.lanes; l++) { T.lanesWithCpu++; const c = dec(r.cpu[l]), gv = dec(r.gpu[l]); if (same(c, gv)) continue; T.differ++; const args = r.inputs.map((x) => dec(x.length > 1 ? x[l] : x[0])); inc(T.byOperandClass, operandClass(args)); } } out.cpuNeGpu[k] = T; }
if (F.metal) { out.metalCpuNeGpuReproduction = {}; const keys = []; for (const [id, { r, g }] of F.metal) { if (typeof r.cpu === 'string') continue; const t = TY[g.type]; for (let l = 0; l < t.lanes; l++) if (!same(dec(r.cpu[l]), dec(r.gpu[l]))) keys.push([id, l]); }
  for (const k of labels) { if (k === 'metal') continue; let rep = 0; for (const [id, l] of keys) { const { r } = F[k].get(id); if (!same(dec(r.cpu[l]), dec(r.gpu[l]))) rep++; } out.metalCpuNeGpuReproduction[k] = { metalLanes: keys.length, reproduced: rep, notReproduced: keys.length - rep }; } }
fs.writeFileSync(outP, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
