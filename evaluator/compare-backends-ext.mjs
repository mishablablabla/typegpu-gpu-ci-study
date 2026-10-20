import fs from 'node:fs'; import path from 'node:path';
const A = process.argv.slice(2).map((a) => path.resolve(a)); const [mD, mE, lD, lE, outP] = A;
const here = path.dirname(new URL(import.meta.url).pathname);
const { judge, dec } = await import(path.join(here, 'evaluate-ext.mjs')); const { TY } = await import(path.resolve(here, '../lib/types.ts'));
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8')); const M = J(mD), L = J(lD), ME = J(mE), LE = J(lE);
const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const flat = (d) => { const m = new Map(); for (const g of d.groups) for (const r of g.rows) m.set(r.id, { r, g }); return m; };
const FM = flat(M), FL = flat(L);
const out = { schema: 'metal-vs-lavapipe-ext/1', rowIdsEqual: FM.size === FL.size && [...FM.keys()].every((k) => FL.has(k)), rows: FM.size, inputs: { rowsWithDifferentInputBits: 0 }, cpuColumn: { rowsWithDifferentBits: 0, lanesDifferent: 0 }, cpuRecompute: {}, categories: { metal: ME.groups, lavapipe: LE.groups }, laneCategoryChanges: { gpu: {}, cpu: {} }, gpuValueDifferences: { lanes: 0, byKind: {} }, oldRecompute: { metal: ME.oldRecompute, lavapipe: LE.oldRecompute }, cpuVsGpuRepro: {}, cpuThrows: {} };
const tot = (E, t) => { const x = {}; for (const g of Object.values(E.groups)) for (const [c, n] of Object.entries(g[t])) inc(x, c, n); return x; };
out.totals = { metal: { gpu: tot(ME, 'gpu'), cpu: tot(ME, 'cpu'), rowsAfter: ME.rowsAfter, rowsBefore: ME.rowsBefore }, lavapipe: { gpu: tot(LE, 'gpu'), cpu: tot(LE, 'cpu'), rowsAfter: LE.rowsAfter, rowsBefore: LE.rowsBefore } };
out.cpuRecompute = { metal: M.groups.map((g) => g.cpuRecompute).reduce((a, c) => ({ compared: a.compared + c.compared, threw: a.threw + c.threw, mismatches: a.mismatches + c.mismatches }), { compared: 0, threw: 0, mismatches: 0 }), lavapipe: L.groups.map((g) => g.cpuRecompute).reduce((a, c) => ({ compared: a.compared + c.compared, threw: a.threw + c.threw, mismatches: a.mismatches + c.mismatches }), { compared: 0, threw: 0, mismatches: 0 }) };
const same = (c, g) => Object.is(c, g) || (Number.isNaN(c) && Number.isNaN(g)) || (c === 0 && g === 0);
const kindOf = (c, g) => (Number.isNaN(c) || Number.isNaN(g) ? 'NaN involved' : !Number.isFinite(c) || !Number.isFinite(g) ? 'inf involved' : c === 0 || g === 0 || Math.abs(c) < 2 ** -126 || Math.abs(g) < 2 ** -126 ? 'zero/subnormal involved' : 'normal finite');
const repro = { metalDiffLanes: 0, reproducedSameGpuBits: 0, reproducedDifferentGpuBits: 0, notReproduced: 0, byKind: {}, lavapipeOnlyDiffLanes: 0, lavapipeOnlyByKind: {}, notReproducedExamples: [], differentGpuExamples: [] };
const thr = { rows: 0, lanes: 0, byOpType: {}, byMessageValue: {}, sameRowSetOnBothBackends: true, throwRowsWithoutNonFiniteInput: 0, vectorRowsWithNonFiniteInput: 0, vectorRowsWithNonFiniteInputThatDidNotThrow: 0, scalarRowsWithNonFiniteInput: 0, scalarRowsThatThrew: 0, firstNonFiniteMatchesMessage: 0, firstNonFiniteMismatchesMessage: 0, mismatchExamples: [] };
for (const [id, { r: rm, g }] of FM) { const { r: rl } = FL.get(id); const t = TY[g.type]; const lanes = t.lanes;
  if (JSON.stringify(rm.inputs) !== JSON.stringify(rl.inputs)) out.inputs.rowsWithDifferentInputBits++;
  if (JSON.stringify(rm.cpu) !== JSON.stringify(rl.cpu)) { out.cpuColumn.rowsWithDifferentBits++; }
  const mthrew = typeof rm.cpu === 'string', lthrew = typeof rl.cpu === 'string'; if (mthrew !== lthrew) thr.sameRowSetOnBothBackends = false;
  const flatIn = rm.inputs.flatMap((a) => (a.length > 1 || lanes === 1 ? a : Array(lanes).fill(a[0]))).map(dec);
  const nonFin = rm.inputs.flatMap((a) => a).map(dec).filter((v) => !Number.isFinite(v));
  if (lanes > 1) { if (nonFin.length) { thr.vectorRowsWithNonFiniteInput++; if (!mthrew) thr.vectorRowsWithNonFiniteInputThatDidNotThrow++; } } else if (nonFin.length) { thr.scalarRowsWithNonFiniteInput++; if (mthrew) thr.scalarRowsThatThrew++; }
  if (mthrew) { thr.rows++; thr.lanes += lanes; inc(thr.byOpType, `${g.op}/${g.type}`); const mm = rm.cpu.match(/value '([^']+)'/); inc(thr.byMessageValue, mm ? mm[1] : rm.cpu);
    if (!nonFin.length) thr.throwRowsWithoutNonFiniteInput++; const first = rm.inputs.flatMap((a) => a).map(dec).find((v) => !Number.isFinite(v)); const label = Number.isNaN(first) ? 'NaN' : first === Infinity ? 'Infinity' : first === -Infinity ? '-Infinity' : String(first);
    if (mm && mm[1] === label) thr.firstNonFiniteMatchesMessage++; else { thr.firstNonFiniteMismatchesMessage++; if (thr.mismatchExamples.length < 5) thr.mismatchExamples.push({ id, msg: rm.cpu, firstNonFinite: label }); } }
  for (let l = 0; l < lanes; l++) { const args = rm.inputs.map((a) => dec(a.length > 1 ? a[l] : a[0])); const gm = dec(rm.gpu[l]), gl = dec(rl.gpu[l]);
    if (!same(gm, gl)) { out.gpuValueDifferences.lanes++; inc(out.gpuValueDifferences.byKind, kindOf(gm, gl)); }
    for (const [tgt, gv_m, gv_l] of [['gpu', gm, gl]]) { const cm = judge(g.op, args, gv_m, t.elem).cat, cl = judge(g.op, args, gv_l, t.elem).cat; if (cm !== cl) inc(out.laneCategoryChanges[tgt], `${cm} -> ${cl}`); }
    if (typeof rm.cpu !== 'string') { const c = dec(rm.cpu[l]); if (typeof rl.cpu !== 'string' && !Object.is(rm.cpu[l], rl.cpu[l])) out.cpuColumn.lanesDifferent++;
      const mDiff = !same(c, gm), lDiff = !same(c, gl);
      if (mDiff) { repro.metalDiffLanes++; const k = kindOf(c, gm); inc(repro.byKind, `${k}`);
        if (!lDiff) { repro.notReproduced++; if (repro.notReproducedExamples.length < 6) repro.notReproducedExamples.push({ id, lane: l, args, cpu: c, metalGpu: gm, lavapipeGpu: gl, kind: k }); }
        else if (Object.is(gm, gl) || (Number.isNaN(gm) && Number.isNaN(gl)) || (gm === 0 && gl === 0)) repro.reproducedSameGpuBits++; else { repro.reproducedDifferentGpuBits++; if (repro.differentGpuExamples.length < 6) repro.differentGpuExamples.push({ id, lane: l, args, cpu: c, metalGpu: gm, lavapipeGpu: gl }); } }
      else if (lDiff) { repro.lavapipeOnlyDiffLanes++; inc(repro.lavapipeOnlyByKind, kindOf(c, gl)); } } } }
out.cpuVsGpuRepro = repro; out.cpuThrows = thr;
fs.writeFileSync(outP, JSON.stringify(out, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v), 1));
console.log(JSON.stringify({ rowIdsEqual: out.rowIdsEqual, rows: out.rows, inputs: out.inputs, cpuColumn: out.cpuColumn, cpuRecompute: out.cpuRecompute, totals: out.totals, laneCategoryChangesGpu: out.laneCategoryChanges.gpu, gpuValueDifferences: out.gpuValueDifferences, repro: { ...repro, notReproducedExamples: undefined, differentGpuExamples: undefined }, thr: { ...thr, mismatchExamples: undefined } }, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v), 1));
