// usage: node base-compare.mjs <x64 artifact dir (one shard per backend)> ... -> arm64 BASE vs x64 BASE per backend: status transitions + value/text fingerprint equality per test
import fs from 'node:fs'; import path from 'node:path';
const M = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../runs/mutation/runs'); const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const res = {};
for (const d of process.argv.slice(2)) { const rj = rd(path.join(d, 'runs', fs.readdirSync(path.join(d, 'runs')).find((n) => /^BASE__.*__r1$/.test(n)), 'run.json')); const bk = rj.backend; if (res[bk]) continue;
  const arm = {}; for (const pass of ['pool1', 'own']) { const a = rd(path.join(M, `BASE__${bk}__${pass}__r1`, 'run.json')); for (const [p, pool] of Object.entries(a.pools)) for (const [k, t] of Object.entries(pool.tests)) arm[`${p}::${k}`] = t; }
  const tr = {}; let same = 0, n = 0, valEq = 0, valBoth = 0, textEq = 0, textBoth = 0; const flips = []; const missing = [];
  for (const [p, pool] of Object.entries(rj.pools)) for (const [k, t] of Object.entries(pool.tests)) { const a = arm[`${p}::${k}`]; if (!a) { missing.push(`${p}::${k}`); continue; } n++; const key = `${a.status}->${t.status}`; tr[key] = (tr[key] ?? 0) + 1; if (a.status !== t.status) flips.push(`${p}::${k.slice(0, 110)} ${key}`); else same++;
    if (a.nrb && t.nrb) { valBoth++; if (a.value === t.value) valEq++; } if (a.text && t.text) { textBoth++; if (a.text === t.text) textEq++; } }
  res[bk] = { testsCompared: n, statusSame: same, transitions: tr, flips, notInArm64: missing.length, valueFpEqual: `${valEq}/${valBoth}`, wgslTextEqual: `${textEq}/${textBoth}` }; }
console.log(JSON.stringify(res, null, 1));
