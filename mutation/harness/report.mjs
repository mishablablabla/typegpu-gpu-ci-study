// usage: node report.mjs -> RESULTS.generated.md (tables/attribution used to assemble RESULTS.md) + ATTRIBUTION.md. Reads results.json.
import fs from 'node:fs'; import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'); const M = process.env.MUTATION_DIR ?? path.join(REPO, 'runs/mutation'); const RES = path.join(REPO, 'results/mutation'); fs.mkdirSync(RES, { recursive: true }); const R = JSON.parse(fs.readFileSync(path.join(RES, 'results.json'), 'utf8'));
const B = ['lavapipe', 'swiftshader', 'metal']; const ab = { 'DETECTED-value': 'DET', 'text-only': 'text', missed: 'miss', crash: 'CRASH', 'not-run(f16)': 'nr-f16', 'invalid-run': 'INVALID' };
const ids = Object.keys(R.mutants); const L = [];
const V = (id, b, set) => R.mutants[id].backends[b]?.bySet?.[set];
const short = (d) => { const pool = d.split('::')[0]; const type = d.slice(d.lastIndexOf('::') + 2); const t = d.slice(pool.length + 2, d.lastIndexOf('::')); return { pool, type, file: t.split('::')[0], name: t.split('::').slice(1).join('::') }; };
for (const set of ['pool1', 'pool1+own']) {
  L.push(`\n### Matrix: ${set === 'pool1' ? 'pre-existing pool only (13 examples + 6 investigation suites + ported/diff suite)' : 'pre-existing pool + own mutation-run tests'}\n`);
  L.push('| mutant | class | tier | title | lavapipe | swiftshader | metal | #detecting tests L/S/M |', '|---|---|---|---|---|---|---|---|');
  for (const id of ids) { const m = R.mutants[id]; L.push(`| ${id} | ${m.meta?.symptom_class ?? ''} | ${m.meta?.tier ?? ''} | ${(m.meta?.title ?? '').slice(0, 60)} | ${B.map((b) => { const v = V(id, b, set); return v ? ab[v.verdict] + (v.unstable ? '*' : '') : '-'; }).join(' | ')} | ${B.map((b) => V(id, b, set)?.nDetecting ?? '-').join('/')} |`); }
  const cnt = {}; for (const b of B) { cnt[b] = {}; for (const id of ids) { const v = V(id, b, set)?.verdict; if (v) cnt[b][v] = (cnt[b][v] ?? 0) + 1; } }
  L.push('', `Counts (${set}): ` + B.map((b) => `${b}: ` + Object.entries(cnt[b]).map(([k, v]) => `${ab[k]} ${v}`).join(', ')).join(' ; '));
  const exclusive = {}; for (const b of B) exclusive[b] = ids.filter((id) => V(id, b, set)?.verdict === 'DETECTED-value' && B.filter((o) => o !== b).every((o) => V(id, o, set)?.verdict !== 'DETECTED-value'));
  L.push('', `Exclusive value catches (${set}): ` + B.map((b) => `${b}: [${exclusive[b].join(', ')}]`).join(' ; '));
  const dis = ids.filter((id) => new Set(B.map((b) => V(id, b, set)?.verdict)).size > 1); L.push('', `Backends disagree (${set}): [${dis.join(', ')}]`);
}
L.push('\n### Per bug class (pool1+own), DET / total\n', '| symptom_class | n | lavapipe | swiftshader | metal |', '|---|---|---|---|---|');
const classes = [...new Set(ids.map((i) => R.mutants[i].meta?.symptom_class ?? '?'))]; for (const c of classes) { const g = ids.filter((i) => (R.mutants[i].meta?.symptom_class ?? '?') === c); L.push(`| ${c} | ${g.length} | ${B.map((b) => g.filter((i) => V(i, b, 'pool1+own')?.verdict === 'DETECTED-value').length).join(' | ')} |`); }
L.push('\n### Per reach_class (pool1+own), DET / total\n', '| reach_class | n | lavapipe | swiftshader | metal |', '|---|---|---|---|---|');
for (const c of [...new Set(ids.map((i) => R.mutants[i].meta?.reach_class ?? '?'))]) { const g = ids.filter((i) => (R.mutants[i].meta?.reach_class ?? '?') === c); L.push(`| ${c} | ${g.length} | ${B.map((b) => g.filter((i) => V(i, b, 'pool1+own')?.verdict === 'DETECTED-value').length).join(' | ')} |`); }
const A = ['# Per-test attribution (pool1+own): which tests detected each mutant, per backend\n', 'type: status = pass->fail (or vanished); value = readback fingerprint changed in a BASE-deterministic test.\n'];
for (const id of ids) { A.push(`\n## ${id} ${R.mutants[id].meta?.title ?? ''}\n`); for (const b of B) { const v = V(id, b, 'pool1+own'); if (!v) continue; A.push(`- **${b}**: ${v.verdict}${v.f16Blocked ? ' (f16-blocked tests: ' + v.f16Blocked.length + ')' : ''}, ${v.nDetecting ?? 0} detecting tests`);
  const by = {}; for (const d of v.detectedBy ?? []) { const s = short(d); const k = `${s.pool} / ${s.file} [${s.type}]`; (by[k] ??= []).push(s.name); } for (const [k, ns] of Object.entries(by)) A.push(`  - ${k}: ${ns.length} test(s), e.g. "${ns[0].slice(0, 110)}"`); } }
fs.writeFileSync(path.join(RES, 'RESULTS.generated.md'), L.join('\n') + '\n'); fs.writeFileSync(path.join(RES, 'ATTRIBUTION.md'), A.join('\n') + '\n');
console.log(L.filter((l) => /^(Counts|Exclusive|Backends)/.test(l)).join('\n'));
