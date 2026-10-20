import { readJson } from '../../lib/read-json.mjs';
// usage: node make-plan.mjs <name> [--calib] [--shards-per-backend N] [--max-det-pools K] [--drop M02,M04,...] [--only M24,M26]
// Reads results/mutation/results.json (arm64 verdicts). Per backend and mutant:
//   arm64 DETECTED -> pools = the pools that detected it on arm64 (optionally the K cheapest);   miss / text-only / not-run(f16) -> ALL pools of pool1 + own.
// Order: canaries first, then GPU-only/must-keep, then other detected, then text-only, then missed-on-both last (so a time cap drops them last).
import fs from 'node:fs'; import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..'); const here = path.join(REPO, 'results/x64-mutation'); const R = readJson(path.join(REPO, 'results/mutation/results.json'));
const a = process.argv.slice(2); const name = a[0]; const opt = (k, d) => { const i = a.indexOf(k); return i < 0 ? d : a[i + 1]; };
const SH = Number(opt('--shards-per-backend', 1)), K = Number(opt('--max-det-pools', 99)); const drop = new Set((opt('--drop', '') || '').split(',').filter(Boolean)); const only = (opt('--only', '') || '').split(',').filter(Boolean);
const ALL = ['ex', 'inv-bitops', 'inv-vector-fns', 'inv-mul-paths', 'inv-scalar-int', 'inv-integer-mul', 'inv-comptime', 'full', 'own'];
const cost = { ex: 35, 'inv-bitops': 65, 'inv-vector-fns': 36, 'inv-mul-paths': 25, 'inv-scalar-int': 55, 'inv-integer-mul': 6, 'inv-comptime': 20, full: 28, own: 3 };
const canary = ['M24', 'M26']; const gpuOnly = ['M26', 'M27', 'M33', 'M34', 'M42', 'M46', 'M47', 'M48', 'M49', 'M50', 'M01', 'M09', 'M10', 'M21', 'M32', 'M35'];
const ids = Object.keys(R.mutants);
const v = (id, b) => R.mutants[id].backends[b].verdict;
const bothMiss = (id) => v(id, 'lavapipe') === 'missed' && v(id, 'swiftshader') === 'missed';
const rank = (id) => canary.includes(id) ? 0 : gpuOnly.includes(id) ? 1 : bothMiss(id) ? 4 : (v(id, 'lavapipe') === 'text-only' || v(id, 'swiftshader') === 'text-only') ? 3 : 2;
const pools = (id, b) => { const r = R.mutants[id].backends[b]; if (r.verdict !== 'DETECTED-value') return { pools: ALL, why: 'arm64 ' + r.verdict };
  const s = new Set(); for (const [pn, p] of Object.entries(r.passes)) if (pn !== 'ex97') for (const d of p.detected) s.add(d.split('::')[0]);
  let l = ALL.filter((x) => s.has(x)); if (l.length > K) l = l.sort((x, y) => cost[x] - cost[y]).slice(0, K); return { pools: ALL.filter((x) => l.includes(x)), why: 'arm64 DET in ' + [...s].join(',') }; };
const out = { name, generated: new Date().toISOString(), opts: { shardsPerBackend: SH, maxDetPools: K, drop: [...drop], only }, jobs: [] };
for (const b of ['lavapipe', 'swiftshader']) {
  let items = ids.filter((id) => !drop.has(id) && (!only.length || only.includes(id))).sort((x, y) => rank(x) - rank(y) || Number(x.slice(1)) - Number(y.slice(1))).map((id) => ({ id, ...pools(id, b) }));
  const sh = [...Array(SH)].map(() => ({ items: [], c: 0 })); for (const it of items) { const c = it.pools.reduce((s, p) => s + cost[p], 0) + 8; const t = it.id === 'M24' || it.id === 'M26' ? sh[0] : sh.reduce((m, x) => (x.c < m.c ? x : m)); t.items.push(it); t.c += c; }
  sh.forEach((s, i) => out.jobs.push({ backend: b, shard: i + 1, estSecArm64: s.c, items: s.items }));
}
fs.writeFileSync(path.join(REPO, `mutation/plans/${name}.json`), JSON.stringify(out, null, 1));
for (const j of out.jobs) console.log(`${name} ${j.backend} shard${j.shard}: ${j.items.length} mutants, est ${(j.estSecArm64 / 60).toFixed(0)} min (+BASE x2 ~${(2 * ALL.reduce((s, p) => s + cost[p], 0) / 60).toFixed(0)} min)`);
