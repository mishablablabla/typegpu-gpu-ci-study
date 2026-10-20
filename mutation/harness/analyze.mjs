// usage: node analyze.mjs  -> results.json (machine readable) ; RESULTS.tables.md (generated tables). Reads runs/*/run.json (written by collect.mjs) and ../catalogue/catalogue.json.
// DETECTION DEFINITION (fixed): mutant M is DETECTED on backend B if, vs BASE on the same B, any test (i) changes pass->fail (or a passing BASE test disappears), (ii) has a different value-channel fingerprint
// AND that test's fingerprint was identical across all BASE repeats on B (else it is excluded as non-deterministic), or (iii) a pool crashes/hangs in the run AND in its one re-run.
// text-only: only the generated-WGSL fingerprint differs (text channel; not counted as GPU detection). Value channel = sha256 of all GPU->CPU readbacks (+ __record data), see harness/fp-setup.ts.
import fs from 'node:fs'; import path from 'node:path';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'); const M = process.env.MUTATION_DIR ?? path.join(REPO, 'runs/mutation'); const RES = path.join(REPO, 'results/mutation'); fs.mkdirSync(RES, { recursive: true }); const RUNS = path.join(M, 'runs');
const BACKENDS = ['lavapipe', 'swiftshader', 'metal'];
const runs = []; for (const n of fs.readdirSync(RUNS)) { if (n.startsWith('_')) continue; const f = path.join(RUNS, n, 'run.json'); if (!fs.existsSync(f)) continue; const [id, backend, pass, r] = n.split('__'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); runs.push({ name: n, id, backend, pass, rep: Number(r.slice(1)), j }); }
let cat = []; try { cat = JSON.parse(fs.readFileSync(path.join(REPO, 'mutation/catalogue.json'), 'utf8')); } catch {}
const catById = Object.fromEntries(cat.map((e) => [e.id, e]));
const tk = (p, k) => `${p}::${k}`;
const baselines = {};
for (const b of BACKENDS) for (const pass of new Set(runs.filter((r) => r.backend === b).map((r) => r.pass))) {
  const reps = runs.filter((r) => r.id === 'BASE' && r.backend === b && r.pass === pass && !r.j.aborted && r.j.adapterAssert === 'PASS'); if (!reps.length) continue;
  const tests = {}; const keys = new Set(); for (const r of reps) for (const [p, pool] of Object.entries(r.j.pools)) for (const k of Object.keys(pool.tests)) keys.add(tk(p, k));
  const pools = new Set(reps.flatMap((r) => Object.keys(r.j.pools)));
  for (const key of keys) { const [p, k] = [key.split('::')[0], key.slice(key.indexOf('::') + 2)]; const ts = reps.map((r) => r.j.pools[p]?.tests[k]).filter(Boolean);
    const st = new Set(ts.map((t) => t.status)); tests[key] = { status: st.size === 1 ? ts[0].status : 'unstable', valueDet: new Set(ts.map((t) => t.value)).size === 1 && ts.length === reps.length, textDet: new Set(ts.map((t) => t.text)).size === 1 && ts.length === reps.length, value: ts[0].value, text: ts[0].text, err: ts[0].err, nrb: ts[0].nrb, nwg: ts[0].nwg }; }
  const vals = Object.values(tests); baselines[`${b}/${pass}`] = { reps: reps.length, runs: reps.map((r) => r.name), tests, pools: [...pools], counts: { total: vals.length, pass: vals.filter((t) => t.status === 'pass').length, fail: vals.filter((t) => t.status === 'fail').length, skip: vals.filter((t) => t.status === 'skip').length, unstableStatus: vals.filter((t) => t.status === 'unstable').length, valueNondet: vals.filter((t) => !t.valueDet).length, textNondet: vals.filter((t) => !t.textDet).length, noGpuValue: vals.filter((t) => !t.nrb).length }, nondetValueTests: Object.entries(tests).filter(([, t]) => !t.valueDet).map(([k]) => k), crashedPools: [...new Set(reps.flatMap((r) => r.j.crashed))] };
}
function evaluate(run) {
  const bl = baselines[`${run.backend}/${run.pass}`]; const out = { run: run.name, rep: run.rep, status: 'ok', detections: [], textDiffs: [], crashes: [], crashNonRepro: [], valueExcluded: 0 };
  if (!bl) { out.status = 'no-baseline'; return out; }
  if (run.j.prepFailed) { out.status = 'prep-failed'; return out; }
  if (run.j.aborted || run.j.adapterAssert !== 'PASS') { out.status = 'identity-failed'; return out; }
  for (const p of run.j.crashed) { const rr = run.j.crashRetry[p]; if (rr && !rr.crashedAgain) out.crashNonRepro.push(p); else out.crashes.push(p); }
  for (const [p, pool] of Object.entries(run.j.pools)) { if (out.crashes.includes(p) || !bl.pools.includes(p)) continue;
    for (const [k, t] of Object.entries(pool.tests)) { const key = tk(p, k); const b = bl.tests[key];
      if (!b) { if (t.status === 'fail') out.detections.push({ pool: p, test: k, type: 'status', from: 'absent', to: 'fail', err: t.err }); continue; }
      if (b.status === 'unstable') continue;
      if (b.status === 'pass' && t.status === 'fail') { out.detections.push({ pool: p, test: k, type: 'status', from: 'pass', to: 'fail', err: t.err }); continue; }
      if (t.status === 'n/a' || b.status !== 'skip') { if (t.value !== b.value) { if (b.valueDet) out.detections.push({ pool: p, test: k, type: 'value', from: b.status, to: t.status }); else out.valueExcluded++; } }
      if (t.text !== b.text && b.textDet) out.textDiffs.push({ pool: p, test: k }); }
    for (const [key, b] of Object.entries(bl.tests)) { if (!key.startsWith(p + '::')) continue; const k = key.slice(p.length + 2); if (b.status === 'pass' && !pool.tests[k]) out.detections.push({ pool: p, test: k, type: 'status', from: 'pass', to: 'missing' }); } }
  return out;
}
const mutIds = [...new Set(runs.filter((r) => r.id !== 'BASE').map((r) => r.id))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const results = { generated: new Date().toISOString(), baselines: Object.fromEntries(Object.entries(baselines).map(([k, v]) => [k, { reps: v.reps, runs: v.runs, counts: v.counts, nondetValueTests: v.nondetValueTests, crashedPools: v.crashedPools }])), mutants: {} };
for (const id of mutIds) {
  const m = { meta: catById[id] ? { title: catById[id].title, tier: catById[id].tier, kind: catById[id].kind, symptom_class: catById[id].symptom_class, reach_class: catById[id].reach_class, files: catById[id].files, expected_reachable_by: catById[id].expected_reachable_by } : null, backends: {} };
  for (const b of BACKENDS) {
    const per = {};
    for (const pass of new Set(runs.filter((r) => r.id === id && r.backend === b).map((r) => r.pass))) per[pass] = runs.filter((r) => r.id === id && r.backend === b && r.pass === pass).sort((x, y) => x.rep - y.rep).map(evaluate);
    if (!Object.keys(per).length) continue;
    const key = (d) => `${d.pool}::${d.test}::${d.type}`;
    const stable = (evals, f) => { const ok = evals.filter((e) => e.status === 'ok'); if (!ok.length) return []; const sets = ok.map((e) => new Set(f(e))); return [...sets[0]].filter((x) => sets.every((s) => s.has(x))); };
    const any = (evals, f) => [...new Set(evals.filter((e) => e.status === 'ok').flatMap((e) => f(e)))];
    const passes = {}; for (const [pass, evals] of Object.entries(per)) { const det = stable(evals, (e) => e.detections.map(key)), detAny = any(evals, (e) => e.detections.map(key)); const crash = stable(evals, (e) => e.crashes), txt = stable(evals, (e) => e.textDiffs.map((d) => `${d.pool}::${d.test}`));
      passes[pass] = { reps: evals.length, statuses: evals.map((e) => e.status), detected: det, unstableDetections: detAny.filter((x) => !det.includes(x)), crashes: crash, crashNonRepro: any(evals, (e) => e.crashNonRepro), textDiffs: txt, valueExcluded: Math.max(...evals.map((e) => e.valueExcluded)), errs: Object.fromEntries(evals.flatMap((e) => e.detections.filter((d) => d.err).slice(0, 3).map((d) => [`${d.pool}::${d.test}`, d.err]))) }; }
    const allDet = Object.values(passes).flatMap((p) => p.detected), allCrash = Object.values(passes).flatMap((p) => p.crashes), allTxt = Object.values(passes).flatMap((p) => p.textDiffs);
    const bad = Object.values(passes).some((p) => p.statuses.some((s) => s !== 'ok'));
    const unstable = Object.values(passes).some((p) => p.unstableDetections.length);
    const verdict = bad ? 'invalid-run' : allDet.length ? 'DETECTED-value' : allCrash.length ? 'crash' : allTxt.length ? 'text-only' : 'missed';
    m.backends[b] = { verdict, unstableDetections: unstable, passes, detectedBy: allDet.map((x) => x.split('::').slice(0, 3).join('::')), }; }
  results.mutants[id] = m;
}
const RX = path.join(M, 'runs-ex'); const exBase = fs.existsSync(path.join(RX, 'BASE__metal__ex97__r12', 'ex.json')) ? JSON.parse(fs.readFileSync(path.join(RX, 'BASE__metal__ex97__r12', 'ex.json'), 'utf8')) : null;
results.ex97 = { baseline: null, mutants: {} };
if (exBase) { const E = exBase.examples; const E2p = path.join(RX, 'BASE__metal__ex97__r1234', 'ex.json'); const E2 = fs.existsSync(E2p) ? JSON.parse(fs.readFileSync(E2p, 'utf8')).examples : {};
  const allReps = (e) => [...Object.values(E[e]), ...Object.values(E2[e] ?? {})]; const nd = Object.keys(E).filter((e) => new Set(allReps(e).map((r) => r.value)).size > 1 || new Set(allReps(e).map((r) => r.class)).size > 1);
  results.ex97.baselineRepeats = Object.keys(E).length ? allReps(Object.keys(E)[0]).length : 0;
  results.ex97.baseline = { examples: Object.keys(E).length, nondeterministicValue: nd, classes: Object.values(E).reduce((a, r) => { a[r[1].class] = (a[r[1].class] ?? 0) + 1; return a; }, {}) };
  const exRuns = {}; for (const n of fs.readdirSync(RX)) { const mm = n.match(/^(M\d+)__metal__ex97__r(\d+)$/); if (mm) (exRuns[mm[1]] ??= []).push(n); }
  for (const [id, names] of Object.entries(exRuns)) { const evals = []; let P0 = null;
    for (const n of names.sort()) { const f = path.join(RX, n, 'ex.json'), pj = path.join(RX, n, 'p3-run.json'); if (!fs.existsSync(f) || !fs.existsSync(pj)) continue; const X = JSON.parse(fs.readFileSync(f, 'utf8')); P0 = JSON.parse(fs.readFileSync(pj, 'utf8'));
      const det = [], txt = []; for (const [e, r] of Object.entries(X.examples)) { const b = E[e]; if (!b) continue; const m = r[1]; if (m.class !== b[1].class && !nd.includes(e)) det.push(`ex97::${e}::class(${b[1].class}->${m.class})`); else if (!nd.includes(e) && m.value !== b[1].value) det.push(`ex97::${e}::value`); if (m.text !== b[1].text) txt.push(`ex97::${e}`); }
      evals.push({ det, txt, n }); }
    if (!evals.length) continue; const det = evals[0].det.filter((x) => evals.every((e) => e.det.includes(x))), txt = evals[0].txt.filter((x) => evals.every((e) => e.txt.includes(x)));
    const unst = [...new Set(evals.flatMap((e) => e.det))].filter((x) => !det.includes(x));
    results.ex97.mutants[id] = { reps: evals.length, detected: det, unstableDetections: unst, textDiffs: txt, restoredOk: P0.restoredOk, treeChanged: P0.treeMutated !== P0.treePre };
    const mm = [null, id]; const mt = results.mutants[mm[1]]?.backends.metal; if (mt) mt.passes.ex97 = { reps: evals.length, statuses: ['ok'], detected: det, unstableDetections: unst, crashes: [], crashNonRepro: [], textDiffs: txt, valueExcluded: 0, errs: {} }; } }
results.ex97sub = {};
for (const bk of ['lavapipe', 'swiftshader']) { const d = path.join(RX, `ex97sub__${bk}__r2`); if (!fs.existsSync(path.join(d, 'DONE'))) continue; const res = { examples: null, mutants: {} }; const ld = (j) => { const dd = path.join(d, j); if (!fs.existsSync(path.join(dd, 'runs.jsonl'))) return null; return JSON.parse(fs.readFileSync(path.join(dd, 'ex.json'), 'utf8')).examples; };
  const B = ld('BASE'); if (!B) continue; const nd = Object.keys(B).filter((e) => new Set(Object.values(B[e]).map((r) => r.value)).size > 1 || new Set(Object.values(B[e]).map((r) => r.class)).size > 1); res.examples = Object.keys(B).length; res.nondeterministic = nd;
  for (const m of ['M20', 'M13', 'M44', 'M32']) { const X = ld(m); if (!X) continue; const det = [], txt = []; for (const [e, r] of Object.entries(X)) { const b = B[e]; if (!b) continue; if (r[1].class !== b[1].class && !nd.includes(e)) det.push(`${e}::class(${b[1].class}->${r[1].class})`); else if (!nd.includes(e) && r[1].value !== b[1].value) det.push(`${e}::value`); if (r[1].text !== b[1].text) txt.push(e); } res.mutants[m] = { detected: det, textDiffs: txt }; }
  results.ex97sub[bk] = res; }
const f16Blocked = (b, pass, pool, test) => { const bl = baselines[`${b}/${pass}`]?.tests[tk(pool, test)]; const lv = baselines[`lavapipe/${pass}`]?.tests[tk(pool, test)]; if (!bl || !lv || lv.status !== 'pass') return false;
  return bl.status === 'skip' || (bl.status === 'fail' && /f16|vec[234]h|mat[234]x[234]h|\bhalf\b/i.test(test + ' ' + (bl.err ?? ''))); };
const SETS = { 'pool1': ['pool1'], 'pool1+own': ['pool1', 'own'], 'all': ['pool1', 'own', 'ex97'] };
function verdictOf(m, b, set) { const r = m.backends[b]; if (!r) return null; const ps = Object.entries(r.passes).filter(([k]) => set.includes(k)); if (!ps.length) return null;
  if (ps.some(([, p]) => p.statuses.some((s) => s !== 'ok'))) return { verdict: 'invalid-run' };
  const det = ps.flatMap(([, p]) => p.detected), cr = ps.flatMap(([, p]) => p.crashes), tx = ps.flatMap(([, p]) => p.textDiffs);
  let verdict = det.length ? 'DETECTED-value' : cr.length ? 'crash' : tx.length ? 'text-only' : 'missed'; const out = { verdict, nDetecting: det.length, unstable: ps.some(([, p]) => p.unstableDetections.length), detectedBy: det };
  if (b === 'swiftshader' && !det.length && !cr.length) { const blocked = []; for (const [ob, or] of Object.entries(m.backends)) { if (ob === b) continue; for (const [pass, p] of Object.entries(or.passes)) { if (!set.includes(pass)) continue; for (const d of p.detected) { const pool = d.split('::')[0]; const test = d.slice(pool.length + 2, d.lastIndexOf('::')); if (f16Blocked(b, pass, pool, test)) blocked.push(`${ob}:${pool}::${test}`); } } }
    if (blocked.length) { out.verdictRaw = verdict; out.verdict = 'not-run(f16)'; out.f16Blocked = blocked; } }
  return out; }
for (const [id, m] of Object.entries(results.mutants)) for (const b of BACKENDS) { if (!m.backends[b]) continue; m.backends[b].bySet = {}; for (const [sn, set] of Object.entries(SETS)) { const v = verdictOf(m, b, set); if (v) m.backends[b].bySet[sn] = v; } m.backends[b].verdict = m.backends[b].bySet['pool1+own']?.verdict ?? m.backends[b].bySet.pool1?.verdict ?? m.backends[b].verdict; m.backends[b].f16Blocked = m.backends[b].bySet['pool1+own']?.f16Blocked; }
results.sets = SETS;
results.definition = { detected: 'vs BASE on the same backend: (i) a pass->fail test (or a vanished passing test); (ii) a different value-channel fingerprint in a test whose fingerprint was identical across all BASE repeats; (iii) a pool crash/hang reproduced in its re-run. Detections must repeat in every repeat run of the mutant (intersection).', textOnly: 'only the generated-WGSL fingerprint differs; not counted as detection', notRunF16: 'swiftshader miss where a test that detected the mutant on another backend is skipped / fails with an f16-typed test in swiftshader BASE (and passes on lavapipe BASE)', passes: { pool1: '13 example tests + 6 investigation suites + ported/diff/step suite (pre-existing, sourced from PoC tree)', own: '14 mutation-run tests written by WS-MUT-RUN', ex97: 'WS-EX runner, 97 docs examples; Metal host only for 16 mutants; targeted 10-example subset on emulators for M20/M13/M44/M32 (results.ex97sub)' } };
fs.writeFileSync(path.join(RES, 'results.json'), JSON.stringify(results, null, 1));
const L = []; const ab = { 'DETECTED-value': 'DET', 'text-only': 'text', missed: 'miss', crash: 'CRASH', 'not-run(f16)': 'nr-f16', 'invalid-run': 'INVALID' };
L.push('| mutant | class | ' + BACKENDS.join(' | ') + ' | caught by (first 3, lavapipe) |', '|---|---|' + BACKENDS.map(() => '---').join('|') + '|---|');
for (const [id, m] of Object.entries(results.mutants)) L.push(`| ${id} | ${m.meta?.symptom_class ?? '?'} | ${BACKENDS.map((b) => { const r = m.backends[b]; return r ? ab[r.verdict] + (r.unstableDetections ? '*' : '') : '-'; }).join(' | ')} | ${(m.backends.lavapipe?.detectedBy ?? []).slice(0, 3).map((x) => x.replace(/^.*::(.*)::(.*)$/, '$1').slice(0, 50)).join('; ')} |`);
fs.writeFileSync(path.join(RES, 'RESULTS.tables.md'), L.join('\n') + '\n');
const count = {}; for (const b of BACKENDS) { count[b] = {}; for (const m of Object.values(results.mutants)) { const v = m.backends[b]?.verdict; if (v) count[b][v] = (count[b][v] ?? 0) + 1; } }
console.log(JSON.stringify({ baselines: Object.fromEntries(Object.entries(baselines).map(([k, v]) => [k, v.counts])), mutants: mutIds.length, count }, null, 1));
