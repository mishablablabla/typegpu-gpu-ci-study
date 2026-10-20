// usage: node canary-verdict.mjs <runs dir> <backend> <mutant>...   (needs BASE__<backend>__*__r1/r2 and <mutant>__<backend>__*__r1 with run.json from collect.mjs)
import fs from 'node:fs';
import path from 'node:path';
const [dir, backend, ...ids] = process.argv.slice(2);
const load = (n) => JSON.parse(fs.readFileSync(path.join(dir, n, 'run.json'), 'utf8'));
const names = fs.readdirSync(dir);
const flat = (j) => { const m = {}; for (const [p, pool] of Object.entries(j.pools)) for (const [k, t] of Object.entries(pool.tests)) m[`${p}::${k}`] = t; return m; };
const base = names.filter((n) => n.startsWith(`BASE__${backend}__`)).sort().map((n) => flat(load(n)));
if (base.length < 2) throw new Error('need two BASE runs');
let ok = true;
for (const id of ids) {
  const m = names.find((n) => n.startsWith(`${id}__${backend}__`));
  const run = flat(load(m));
  let status = 0, value = 0, text = 0;
  for (const [k, b] of Object.entries(base[0])) {
    const r = run[k];
    if (!r) { if (b.status === 'pass') status++; continue; }
    if (b.status === 'pass' && r.status === 'fail') status++;
    const det = base.every((x) => x[k] && x[k].value === b.value);
    if (det && b.value !== r.value) value++;
    if (b.text !== r.text) text++;
  }
  const verdict = status + value > 0 ? 'DETECTED-value' : text > 0 ? 'text-only' : 'missed';
  console.log(`${id} ${backend}: ${verdict} (status changes ${status}, value-fingerprint changes ${value}, wgsl-text changes ${text})`);
  if (verdict !== 'DETECTED-value') ok = false;
}
process.exit(ok ? 0 : 1);
