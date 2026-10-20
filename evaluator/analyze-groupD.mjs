import fs from 'node:fs'; import path from 'node:path';
const ARGS = process.argv.slice(2).map((a) => (a.includes('=') ? a.replace(/=(.*)$/, (_, p) => '=' + path.resolve(p)) : path.resolve(a))); const outP = ARGS[0]; const sets = Object.fromEntries(ARGS.slice(1).map((a) => a.split('=')));
const here = path.dirname(new URL(import.meta.url).pathname);
const { judge, dec, dec64 } = await import(path.join(here, 'evaluate-ext.mjs')); const { TY } = await import(path.resolve(here, '../lib/types.ts'));
const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; }; const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const ulp = (x) => { f32[0] = Math.abs(x); const e = (u32[0] >>> 23) & 255; return e === 0 ? 2 ** -149 : 2 ** (e - 127 - 23); };
const q = (a, p) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
const cls = (x) => (Number.isNaN(x) ? 'NaN' : x === Infinity ? '+inf' : x === -Infinity ? '-inf' : Object.is(x, -0) ? '-0' : x === 0 ? '+0' : Math.abs(x) < 2 ** -126 ? (x < 0 ? 'negative subnormal' : 'positive subnormal') : x < 0 ? 'negative normal' : 'normal positive');
const window = (op, want) => (op === 'sqrt' ? [want - 9 * ulp(want), want + 9 * ulp(want)] : [want - 1e-5, want + 1e-5]);
const out = { schema: 'groupD-analysis/1', criteria: { harness: { sqrt: '9 ULP of exact (derived), x<=0 investigate', tanh: 'abs 1e-5, exceeding -> investigate' }, cts: { sqrt: 'division(1, inverseSqrt(x)), domain x>0 normal', tanh: 'span(sinh/cosh composition, abs 1e-5 around Math.tanh)' } }, datasets: {} };
for (const [label, p] of Object.entries(sets)) { const D = JSON.parse(fs.readFileSync(p, 'utf8')); const O = {};
  for (const g of D.groups) { const t = TY[g.type]; const o = (O[g.op] ??= { windowRelation: {}, ctsWidth: [], observed: { gpu: [], cpu: [] }, byInputClass: {}, signedZero: {}, cpuThrows: { rows: 0, nonFiniteInput: 0, finiteInputNonFiniteResult: 0, examples: [] }, exampleLanes: {} });
    for (const r of g.rows) { const cpuStr = typeof r.cpu === 'string';
      if (cpuStr) { o.cpuThrows.rows++; const nf = r.inputs.flatMap((a) => a).map(dec).some((v) => !Number.isFinite(v)); if (nf) o.cpuThrows.nonFiniteInput++; else { o.cpuThrows.finiteInputNonFiniteResult++; if (o.cpuThrows.examples.length < 3) o.cpuThrows.examples.push({ id: r.id, inputs: r.inputs.map((a) => a.map(dec)), want: r.want.map(dec64) }); } }
      for (let l = 0; l < t.lanes; l++) { const x = dec(r.inputs[0].length > 1 ? r.inputs[0][l] : r.inputs[0][0]), want = dec64(r.want[l]), gv = dec(r.gpu[l]); const cv = cpuStr ? undefined : dec(r.cpu[l]);
        const old = r.issues.find((i) => i[0] === l && i[1] === 'gpu')?.[2] ?? 'pass'; const jg = judge(g.op, [x], gv); const key = `${cls(x)}: harness ${old} -> CTS ${jg.cat}`; inc(o.byInputClass, key); (o.exampleLanes[key] ??= []).length < 2 && o.exampleLanes[key].push({ id: r.id, lane: l, x, gpu: gv, want, interval: jg.interval ?? null });
        if (Math.abs(x) === 0) inc(o.signedZero, `${g.op}(${cls(x)}): gpu ${cls(gv)}${cv === undefined ? '' : ' cpu ' + cls(cv)}`);
        if (Number.isFinite(x) && Number.isFinite(want) && jg.interval && Number.isFinite(jg.interval[0]) && Number.isFinite(jg.interval[1])) { const [lo, hi] = jg.interval; const [wl, wh] = window(g.op, want);
          const tol = g.op === 'sqrt' ? ulp(want) * 1e-3 : 1e-9;
          const rel = Math.abs(lo - wl) <= tol && Math.abs(hi - wh) <= tol ? 'equal (within rounding)' : lo >= wl - tol && hi <= wh + tol ? 'CTS interval inside the harness window (CTS stricter)' : lo <= wl + tol && hi >= wh - tol ? 'CTS interval contains the harness window (CTS looser)' : 'incomparable (each excludes values the other accepts)';
          inc(o.windowRelation, rel); if (rel.startsWith('incomparable') && (o.incomparableExamples ??= []).length < 4) o.incomparableExamples.push({ x, want, ctsLoMinusWantUlp: (lo - want) / ulp(want), ctsHiMinusWantUlp: (hi - want) / ulp(want), harnessWindowUlp: [-9, 9] });
          o.ctsWidth.push(g.op === 'sqrt' ? (hi - lo) / ulp(want || 1e-30) : hi - lo); }
        for (const [tgt, v] of [['gpu', gv], ['cpu', cv]]) if (v !== undefined && Number.isFinite(v) && Number.isFinite(want) && (g.op !== 'sqrt' || (want !== 0 && Math.abs(want) >= 2 ** -126))) o.observed[tgt].push(g.op === 'sqrt' ? Math.abs(v - want) / ulp(want) : Math.abs(v - want)); } } }
  for (const o of Object.values(O)) { o.ctsWidthSummary = { n: o.ctsWidth.length, min: q(o.ctsWidth, 0), median: q(o.ctsWidth, 0.5), max: q(o.ctsWidth, 1) }; delete o.ctsWidth; for (const t of ['gpu', 'cpu']) { const a = o.observed[t]; o.observed[t] = { n: a.length, median: q(a, 0.5), p99: q(a, 0.99), max: q(a, 1) }; } }
  out.datasets[label] = O; }
fs.writeFileSync(outP, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v), 1));
