#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const A = 'reports', B = 'reports/lavapipe-full-conformance';
const rj = (p) => JSON.parse(readFileSync(p, 'utf8'));
const strip = (n) => n.replace(/^.*\/(?:webgpu-poc|typegpu-gpu-ci-study)\//, '');
const out = {};

const tests = (d) => new Map(rj(`${d}/vitest.json`).testResults.flatMap((f) => f.assertionResults.map((a) => [`${strip(f.name)} :: ${a.fullName}`, a.status])));
const ta = tests(A), tb = tests(B);
out.tests = { metal: { total: ta.size, ...count([...ta.values()]) }, lavapipe: { total: tb.size, ...count([...tb.values()]) },
  onlyInOne: [...ta.keys()].filter((k) => !tb.has(k)).concat([...tb.keys()].filter((k) => !ta.has(k))),
  statusChanges: [...ta].filter(([k, v]) => tb.has(k) && tb.get(k) !== v).map(([k, v]) => ({ test: k, metal: v, lavapipe: tb.get(k) })) };
function count(a) { const c = {}; for (const x of a) c[x] = (c[x] ?? 0) + 1; return c; }

const groups = (d) => new Map(readdirSync(`${d}/cases`).filter((f) => f.endsWith('.json')).flatMap((f) => rj(`${d}/cases/${f}`).groups.map((g) => [`${f.replace('.json', '')}|${g.op}|${g.type}`, g])));
const ga = groups(A), gb = groups(B);
out.groups = { metal: ga.size, lavapipe: gb.size, changed: [] };
for (const [k, a] of ga) {
  const b = gb.get(k); if (!b) { out.groups.changed.push({ group: k, note: 'missing on lavapipe' }); continue; }
  const f = (g) => ({ total: g.total, pass: g.pass, fail: g.fail, knownDivergence: g.knownDivergence, investigate: g.investigate, cpuVsGpuIdentical: g.cpuVsGpu?.identical, cpuVsGpuDiffer: g.cpuVsGpu?.differ, maxUlpDiff: g.cpuVsGpu?.maxUlpDiff, unsupported: g.unsupported?.side ?? null });
  const fa = f(a), fb = f(b);
  if (JSON.stringify(fa) !== JSON.stringify(fb)) out.groups.changed.push({ group: k, policy: a.policy.id, metal: fa, lavapipe: fb });
}

const rowsum = { common: 0, sameAll: 0, statusChanged: 0, gpuValueChanged: 0, cpuValueChanged: 0, inputsChanged: 0, transitions: {}, examples: [] };
const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
for (const [k, a] of ga) {
  const b = gb.get(k); if (!b) continue;
  const mb = new Map(b.rows.map((r) => [r.id, r]));
  for (const r of a.rows) {
    const s = mb.get(r.id); if (!s) continue;
    rowsum.common++;
    const st = r.status !== s.status, gp = !eq(r.gpu, s.gpu), cp = !eq(r.cpu, s.cpu), inp = !eq(r.inputs, s.inputs);
    if (inp) rowsum.inputsChanged++;
    if (st) { rowsum.statusChanged++; const t = `${r.status}->${s.status}`; rowsum.transitions[t] = (rowsum.transitions[t] ?? 0) + 1; }
    if (gp) rowsum.gpuValueChanged++;
    if (cp) rowsum.cpuValueChanged++;
    if (!st && !gp && !cp) rowsum.sameAll++;
    if ((st || gp) && rowsum.examples.length < 400) rowsum.examples.push({ id: r.id, policy: a.policy.id, inputs: r.inputs, cpu: r.cpu, metalGpu: r.gpu, lavaGpu: s.gpu, want: r.want, metal: r.status, lavapipe: s.status });
  }
}
out.rows = rowsum;

const ma = rj(`${A}/report.json`), mb = rj(`${B}/report.json`);
out.cases = { metal: ma.summary.cases, lavapipe: mb.summary.cases };
out.unsupported = { metal: ma.unsupported?.length, lavapipe: mb.unsupported?.length, same: eq(ma.unsupported, mb.unsupported) };
out.confirmedDefects = { metal: ma.confirmedDefects?.length, lavapipe: mb.confirmedDefects?.length, same: eq(ma.confirmedDefects, mb.confirmedDefects) };
out.knownDivergences = { metal: ma.knownDivergences?.length, lavapipe: mb.knownDivergences?.length, same: eq(ma.knownDivergences, mb.knownDivergences) };
out.observations = Object.fromEntries(Object.keys({ ...ma.observations, ...mb.observations }).filter((k) => !eq(ma.observations?.[k], mb.observations?.[k])).map((k) => [k, { metal: ma.observations?.[k], lavapipe: mb.observations?.[k] }]));
writeFileSync(`${B}/COMPARISON.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ tests: { metal: out.tests.metal, lavapipe: out.tests.lavapipe, statusChanges: out.tests.statusChanges.length, onlyInOne: out.tests.onlyInOne.length }, groups: { total: out.groups.metal, lavapipe: out.groups.lavapipe, changed: out.groups.changed.length }, rows: { ...rowsum, examples: rowsum.examples.length }, cases: out.cases, unsupported: out.unsupported, confirmedDefects: out.confirmedDefects, knownDivergences: out.knownDivergences, observationsChanged: Object.keys(out.observations) }, null, 1));
