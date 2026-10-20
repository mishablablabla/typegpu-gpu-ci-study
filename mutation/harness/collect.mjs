// usage: node collect.mjs <rundir>  -> <rundir>/run.json : per-pool, per-test {status, err, value, valueOrdered, text, nrb, rbBytes} + crash info + adapter identity.
import fs from 'node:fs'; import path from 'node:path';
const dir = path.resolve(process.argv[2]); const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const info = Object.fromEntries((fs.existsSync(path.join(dir, 'run-info.txt')) ? fs.readFileSync(path.join(dir, 'run-info.txt'), 'utf8') : '').split('\n').filter((l) => l.includes(': ')).map((l) => [l.split(': ')[0], l.slice(l.indexOf(': ') + 2)]));
const norm = (s) => String(s ?? '').replace(/\S*\/pool\//g, 'pool/').replace(/\S*\/repo\//g, 'repo/').replace(/\u001b\[[0-9;]*m/g, '').replace(/0x[0-9a-f]{6,}/g, '0x…').slice(0, 500);
function readPool(base, pool) {
  const pd = path.join(base, pool); const ex = fs.existsSync(path.join(pd, `${pool}.exit.json`)) ? rd(path.join(pd, `${pool}.exit.json`)) : null;
  const res = { exit: ex, crashed: !ex || ex.timedOut || !ex.jsonWritten, tests: {}, counts: { pass: 0, fail: 0, skip: 0 } };
  const fp = new Map();
  if (fs.existsSync(pd)) for (const f of fs.readdirSync(pd).filter((f) => /^fp-.*\.jsonl$/.test(f))) for (const l of fs.readFileSync(path.join(pd, f), 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); const k = r.file + '::' + [...r.anc, r.title].join(' '); (fp.get(k) ?? fp.set(k, []).get(k)).push(r); }
  const jf = path.join(pd, `${pool}.vitest.json`); const seen = new Map();
  if (fs.existsSync(jf)) { let j; try { j = rd(jf); } catch { res.crashed = true; j = { testResults: [] }; }
    for (const t of j.testResults) { const file = t.name.includes('/pool/') ? t.name.slice(t.name.indexOf('/pool/') + 6) : t.name;
      if (t.assertionResults.length === 0 && t.status === 'failed') { res.tests[`${file}::<file-level failure>`] = { status: 'fail', err: norm(t.message), value: null, text: null }; res.counts.fail++; }
      for (const a of t.assertionResults) { const base = `${file}::${a.fullName}`; const n = (seen.get(base) ?? 0); seen.set(base, n + 1); const key = n ? `${base}#${n}` : base;
        const st = a.status === 'passed' ? 'pass' : a.status === 'failed' ? 'fail' : 'skip'; res.counts[st]++;
        const f = fp.get(base)?.[n]; res.tests[key] = { status: st, err: st === 'fail' ? norm(a.failureMessages?.[0]) : undefined, value: f?.value ?? null, valueOrdered: f?.valueOrdered ?? null, text: f?.text ?? null, nrb: f?.nrb ?? 0, rbBytes: f?.rbBytes ?? 0, nwg: f?.wg?.length ?? 0, ms: a.duration ?? null }; } }
    const outside = [...fp.keys()].filter((k) => k.endsWith(' __outside_tests__')); for (const k of outside) for (const [i, f] of fp.get(k).entries()) res.tests[`${k}#${i}`] = { status: 'n/a', value: f.value, valueOrdered: f.valueOrdered, text: f.text, nrb: f.nrb, rbBytes: f.rbBytes, nwg: f.wg.length }; }
  return res;
}
const POOLS = (info.pools ?? '').replace(/^.*pools: /, '').split(' ').filter(Boolean);
const out = { dir, mutant: info.mutant?.split(' ')[0], backend: (info.mutant ?? '').match(/backend: (\w+)/)?.[1], aborted: fs.existsSync(path.join(dir, 'ABORTED.txt')) ? fs.readFileSync(path.join(dir, 'ABORTED.txt'), 'utf8').trim() : null, prepFailed: fs.existsSync(path.join(dir, 'PREP_FAILED.txt')), pools: {}, crashed: [], crashRetry: {} };
if (!out.aborted && !out.prepFailed) {
  const pools = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, `${e.name}.exit.json`))).map((e) => e.name);
  const missing = (info.mutant ?? '').length ? (fs.readFileSync(path.join(dir, 'commands.log'), 'utf8').match(/pools=(.*)/)?.[1] ?? '').split(' ').filter(Boolean) : [];
  for (const p of new Set([...pools, ...missing])) { const a1 = readPool(dir, p); out.pools[p] = a1; if (a1.crashed) { out.crashed.push(p); if (fs.existsSync(path.join(dir, 'retry', p))) { const a2 = readPool(path.join(dir, 'retry'), p); out.crashRetry[p] = { crashedAgain: a2.crashed, exit: a2.exit }; if (!a2.crashed) { out.pools[p] = { ...a2, firstAttemptCrashed: true }; } } } }
  const ad = new Set(); for (const sub of ['.', ...Object.keys(out.pools)]) { const d = path.join(dir, sub); if (fs.existsSync(d) && fs.statSync(d).isDirectory()) for (const f of fs.readdirSync(d).filter((f) => /^adapters-.*\.jsonl$/.test(f))) for (const l of fs.readFileSync(path.join(d, f), 'utf8').split('\n').filter(Boolean)) { const a = JSON.parse(l); ad.add(`${a.vendor}/${a.architecture}/${a.device}/${a.description}/f16=${a.shaderF16}`); } }
  out.adapters = [...ad]; const aa = path.join(dir, 'adapter-assert.json'); out.adapterAssert = fs.existsSync(aa) ? rd(aa).result : 'MISSING';
}
fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(out)); 
const n = Object.values(out.pools).reduce((s, p) => s + Object.keys(p.tests).length, 0); console.log(`${out.mutant} ${out.backend}: pools=${Object.keys(out.pools).length} tests=${n} crashed=[${out.crashed}] assert=${out.adapterAssert} adapters=${(out.adapters ?? []).join('|')}`);
