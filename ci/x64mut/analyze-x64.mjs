import fs from 'node:fs'; import path from 'node:path';
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8')); const tk = (p, k) => `${p}::${k}`;
export function analyzeDir(dir) {
  const RUNS = path.join(dir, 'runs'); const runs = [];
  if (fs.existsSync(RUNS)) for (const n of fs.readdirSync(RUNS)) { const f = path.join(RUNS, n, 'run.json'); const m = n.match(/^(BASE|M\d+)__(\w+)__r(\d+)$/); if (!m) continue; if (!fs.existsSync(f)) { runs.push({ name: n, id: m[1], backend: m[2], rep: +m[3], j: null }); continue; } runs.push({ name: n, id: m[1], backend: m[2], rep: +m[3], j: rd(f) }); }
  const backend = runs[0]?.backend; const baseRuns = runs.filter((r) => r.id === 'BASE' && r.j && !r.j.aborted && r.j.adapterAssert === 'PASS');
  const tests = {}; const keys = new Set(); for (const r of baseRuns) for (const [p, pool] of Object.entries(r.j.pools)) for (const k of Object.keys(pool.tests)) keys.add(tk(p, k));
  const pools = [...new Set(baseRuns.flatMap((r) => Object.keys(r.j.pools)))];
  for (const key of keys) { const p = key.split('::')[0], k = key.slice(p.length + 2); const ts = baseRuns.map((r) => r.j.pools[p]?.tests[k]).filter(Boolean); const st = new Set(ts.map((t) => t.status));
    tests[key] = { status: st.size === 1 ? ts[0].status : 'unstable', valueDet: new Set(ts.map((t) => t.value)).size === 1 && ts.length === baseRuns.length, textDet: new Set(ts.map((t) => t.text)).size === 1 && ts.length === baseRuns.length, value: ts[0].value, text: ts[0].text, err: ts[0].err, nrb: ts[0].nrb, nwg: ts[0].nwg }; }
  const vals = Object.values(tests); const perPool = {}; for (const key of Object.keys(tests)) { const p = key.split('::')[0]; const c = (perPool[p] ??= { total: 0, pass: 0, fail: 0, skip: 0, unstable: 0, valueNondet: 0, textNondet: 0 }); const t = tests[key]; c.total++; c[t.status === 'unstable' ? 'unstable' : t.status]++; if (!t.valueDet) c.valueNondet++; if (!t.textDet) c.textNondet++; }
  const baseline = { reps: baseRuns.length, runs: baseRuns.map((r) => r.name), pools, counts: { total: vals.length, pass: vals.filter((t) => t.status === 'pass').length, fail: vals.filter((t) => t.status === 'fail').length, skip: vals.filter((t) => t.status === 'skip').length, unstableStatus: vals.filter((t) => t.status === 'unstable').length, valueNondet: vals.filter((t) => !t.valueDet).length, textNondet: vals.filter((t) => !t.textDet).length, noGpuValue: vals.filter((t) => !t.nrb).length }, perPool, nondetValueTests: Object.entries(tests).filter(([, t]) => !t.valueDet).map(([k]) => k), crashedPools: [...new Set(baseRuns.flatMap((r) => r.j.crashed))], adapters: [...new Set(baseRuns.flatMap((r) => r.j.adapters ?? []))] };
  function evaluate(run) {
    const out = { run: run.name, status: 'ok', pools: [], detections: [], textDiffs: [], crashes: [], crashNonRepro: [], valueExcluded: 0, adapters: run.j?.adapters ?? [] };
    if (!run.j) { out.status = 'no-run-json'; return out; } if (!baseRuns.length) { out.status = 'no-baseline'; return out; }
    if (run.j.prepFailed) { out.status = 'prep-failed'; return out; } if (run.j.aborted || run.j.adapterAssert !== 'PASS') { out.status = 'identity-failed'; return out; }
    out.pools = Object.keys(run.j.pools);
    for (const p of run.j.crashed) { const rr = run.j.crashRetry[p]; if (rr && !rr.crashedAgain) out.crashNonRepro.push(p); else out.crashes.push(p); }
    for (const [p, pool] of Object.entries(run.j.pools)) { if (out.crashes.includes(p) || !pools.includes(p)) continue;
      for (const [k, t] of Object.entries(pool.tests)) { const key = tk(p, k); const b = tests[key];
        if (!b) { if (t.status === 'fail') out.detections.push({ pool: p, test: k, type: 'status', from: 'absent', to: 'fail', err: t.err }); continue; }
        if (b.status === 'unstable') continue;
        if (b.status === 'pass' && t.status === 'fail') { out.detections.push({ pool: p, test: k, type: 'status', from: 'pass', to: 'fail', err: t.err }); continue; }
        if (t.status === 'n/a' || b.status !== 'skip') { if (t.value !== b.value) { if (b.valueDet) out.detections.push({ pool: p, test: k, type: 'value', from: b.status, to: t.status }); else out.valueExcluded++; } }
        if (t.text !== b.text && b.textDet) out.textDiffs.push({ pool: p, test: k }); }
      for (const [key, b] of Object.entries(tests)) { if (!key.startsWith(p + '::')) continue; const k = key.slice(p.length + 2); if (b.status === 'pass' && !pool.tests[k]) out.detections.push({ pool: p, test: k, type: 'status', from: 'pass', to: 'missing' }); } }
    out.verdict = out.detections.length ? 'DETECTED-value' : out.crashes.length ? 'crash' : out.textDiffs.length ? 'text-only' : 'missed';
    return out; }
  const evals = runs.filter((r) => r.id !== 'BASE').sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)) || a.rep - b.rep).map((r) => ({ id: r.id, rep: r.rep, ...evaluate(r) }));
  const baselineTests = Object.fromEntries(Object.entries(tests).map(([k, t]) => [k, { status: t.status, err: t.err ? String(t.err).slice(0, 160) : undefined }]));
  return { dir, backend, baseline, baselineTests, evals };
}
if (process.argv[1] && process.argv[1].endsWith('analyze-x64.mjs')) {
  const a = process.argv.slice(2);
  if (a[0] === '--quick') { const res = analyzeDir(a[1]); { const { baselineTests, ...slim } = res; fs.writeFileSync(path.join(a[1], 'analysis-quick.json'), JSON.stringify(slim)); } const w = (n) => { const f = path.join(a[1], 'runs', n, 'run-info.txt'); return fs.existsSync(f) ? (fs.readFileSync(f, 'utf8').match(/attempt1 wall (\d+)s/) ?? [])[1] : '?'; };
    console.log(`backend=${res.backend} BASE reps=${res.baseline.reps} counts=${JSON.stringify(res.baseline.counts)} crashedPools=[${res.baseline.crashedPools}] adapters=${res.baseline.adapters.join('|')}`);
    for (const e of res.evals) console.log(`${e.id}\t${e.verdict ?? e.status}\tdet=${e.detections.length}\ttext=${e.textDiffs.length}\tcrash=[${e.crashes}]\tpools=${e.pools.join(',')}\twall=${w(e.run)}s`); }
  else if (a[0] === '--json') { const res = a.slice(2).map(analyzeDir); fs.writeFileSync(a[1], JSON.stringify(res, null, 1)); console.log(`wrote ${a[1]}: ${res.map((r) => `${r.backend}:${r.evals.length}`).join(' ')}`); }
}
