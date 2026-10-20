import { readJson } from '../../lib/read-json.mjs';
// usage: node build-results.mjs <analysis.json> [--out results.json]
// analysis.json = output of `analyze-x64.mjs --json` over all downloaded artifact dirs (one entry per backend x shard).
// Merges x64 verdicts with the arm64 verdicts (results/mutation/results.json) and tests the pre-registered H0.
// Run selection: if a mutant has several evaluations on a backend (re-runs), all are listed; the CANONICAL one is the first with status ok from the dir list order given in the 'canonical' field (see below).
import fs from 'node:fs'; import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..'); const here = path.join(REPO, 'results/x64-mutation'); const A = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const oi = process.argv.indexOf('--out'); const OUT = oi > 0 ? process.argv[oi + 1] : path.join(here, 'results.json');
const R = readJson(path.join(REPO, 'results/mutation/results.json')); const cat = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(REPO, 'mutation/catalogue.json'), 'utf8')).map((e) => [e.id, e]));
const BK = ['lavapipe', 'swiftshader']; const tk = (p, k) => `${p}::${k}`;
const byB = Object.fromEntries(BK.map((b) => [b, A.filter((x) => x.backend === b)]));
const f16Re = /f16|vec[234]h|mat[234]x[234]h|\bhalf\b/i;
function baseStatus(entry, pool, test) { return entry.baselineTests?.[tk(pool, test)]; }
const arm = (id, b) => R.mutants[id].backends[b];
const armDetKeys = (id, b, pools) => { const r = arm(id, b); const s = new Set(); for (const [pn, p] of Object.entries(r.passes)) if (pn !== 'ex97') for (const d of p.detected) if (pools.includes(d.split('::')[0])) s.add(d); return s; };
const rows = []; const ids = Object.keys(R.mutants); const lvEntry = new Map();
for (const id of ids) {
  const row = { id, title: cat[id]?.title, tier: cat[id]?.tier, backends: {} };
  for (const b of BK) {
    const evs = byB[b].flatMap((e) => e.evals.filter((x) => x.id === id).map((x) => ({ ...x, dir: e.dir, entry: e })));
    const ok = evs.filter((x) => x.status === 'ok'); const c = ok[0]; const a = arm(id, b);
    const o = { arm64: a.verdict, x64: null, runs: evs.length, runsOk: ok.length, x64Raw: null, same: null, reason: '' };
    if (c) { let v = c.verdict; o.x64Raw = v; o.pools = c.pools; o.nDet = c.detections.length; o.nText = c.textDiffs.length; o.detectedBy = c.detections.map((d) => `${d.pool}::${d.test}::${d.type}`); o.crashes = c.crashes; o.valueExcluded = c.valueExcluded;
      if (b === 'swiftshader' && v === 'missed') {
        const lv = row.backends.lavapipe; const blocked = []; if (lv?.detectedBy) for (const d of lv.detectedBy) { const p = d.split('::')[0], t = d.slice(p.length + 2, d.lastIndexOf('::')); const sb = c.entry.baselineTests?.[tk(p, t)], lb = lvEntry.get(id)?.baselineTests?.[tk(p, t)]; if (sb && lb && lb.status === 'pass' && (sb.status === 'skip' || (sb.status === 'fail' && f16Re.test(t + ' ' + (sb.err ?? ''))))) blocked.push(d); }
        if (blocked.length) { v = 'not-run(f16)'; o.f16Blocked = blocked; } }
      o.replicates = ok.map((x) => ({ dir: path.basename(x.dir), verdict: x.verdict, nDet: x.detections.length, nText: x.textDiffs.length })); o.x64 = v; o.same = v === a.verdict; if (b === 'lavapipe') lvEntry.set(id, c.entry);
      const ad = armDetKeys(id, b, c.pools), xd = new Set(o.detectedBy); const onlyArm = [...ad].filter((x) => !xd.has(x)), onlyX = [...xd].filter((x) => !ad.has(x));
      const tn = (x) => x.slice(0, x.lastIndexOf('::')); const aT = new Set([...ad].map(tn)), xT = new Set([...xd].map(tn)); o.detTests = { arm64: aT.size, x64: xT.size, onlyArm64: [...aT].filter((x) => !xT.has(x)).length, onlyX64: [...xT].filter((x) => !aT.has(x)).length, channelShifts: [...xd].filter((x) => !ad.has(x) && aT.has(tn(x))).length };
      o.detSet = { arm64InRunPools: ad.size, x64: xd.size, onlyArm64: onlyArm.length, onlyX64: onlyX.length, onlyArm64Examples: onlyArm.slice(0, 3), onlyX64Examples: onlyX.slice(0, 3) };
      if (!o.same) o.reason = 'VERDICT DIFFERS (needs manual attribution)'; }
    else o.reason = evs.length ? 'no ok run (' + evs.map((x) => x.status).join(',') + ')' : 'not run';
    row.backends[b] = o; }
  rows.push(row); }
const cnt = (b, key) => rows.reduce((m, r) => { const v = r.backends[b][key]; if (v) m[v] = (m[v] ?? 0) + 1; return m; }, {});
const covered = (b) => rows.filter((r) => r.backends[b].x64).length;
const diffs = rows.flatMap((r) => BK.filter((b) => r.backends[b].x64 && !r.backends[b].same).map((b) => ({ id: r.id, backend: b, arm64: r.backends[b].arm64, x64: r.backends[b].x64, reason: r.backends[b].reason })));
const detX = (b) => rows.filter((r) => r.backends[b].x64 === 'DETECTED-value').map((r) => r.id); const f16m = ['M01', 'M21'];
const both = rows.filter((r) => r.backends.lavapipe.x64 && r.backends.swiftshader.x64 && !f16m.includes(r.id));
const lsDiff = both.filter((r) => (r.backends.lavapipe.x64 === 'DETECTED-value') !== (r.backends.swiftshader.x64 === 'DETECTED-value')).map((r) => ({ id: r.id, lavapipe: r.backends.lavapipe.x64, swiftshader: r.backends.swiftshader.x64 }));
const missingCov = rows.flatMap((r) => BK.filter((b) => !r.backends[b].x64).map((b) => `${r.id}:${b}`));
const res = { generated: new Date().toISOString(), counts: { arm64: Object.fromEntries(BK.map((b) => [b, cnt(b, 'arm64')])), x64: Object.fromEntries(BK.map((b) => [b, cnt(b, 'x64')])), covered: Object.fromEntries(BK.map((b) => [b, covered(b)])) },
  H0a_verdictDifferences: diffs, H0a_confirmed: diffs.length === 0 && missingCov.length === 0, notCovered: missingCov,
  H0b_lavapipeVsSwiftshaderDetectedDiff_excl_f16: lsDiff, H0b_confirmed: lsDiff.length < 2, x64DetectedIds: { lavapipe: detX('lavapipe'), swiftshader: detX('swiftshader') },
  baselines: A.map((e) => ({ dir: path.basename(e.dir), backend: e.backend, reps: e.baseline.reps, counts: e.baseline.counts, perPool: e.baseline.perPool, crashedPools: e.baseline.crashedPools, adapters: e.baseline.adapters, nondetValueTests: e.baseline.nondetValueTests.length })), rows };
fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); console.log(JSON.stringify({ counts: res.counts, H0a_confirmed: res.H0a_confirmed, diffs, notCovered: missingCov.length, H0b: res.H0b_confirmed, lsDiff }, null, 1));
