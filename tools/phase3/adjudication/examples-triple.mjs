import { readJson } from '../../lib/read-json.mjs';
import fs from 'node:fs';
const D = readJson(new URL('../../../results/examples/results.json', import.meta.url).pathname);
const agree = (s) => ['=', '0', 't'].includes(s); const out = { cp3: { all_agree: [], ss_lone: [], lav_lone: [], metal_lone: [], all_differ: [], other: [] }, notComparable: [] };
for (const [ex, e] of Object.entries(D.examples)) { const P = e.pairs; if (!P['metal~lavapipe']?.comparable || !P['metal~swiftshader']?.comparable || !P['lavapipe~swiftshader']?.comparable) { out.notComparable.push(ex); continue; }
  const ml = P['metal~lavapipe'].sev?.cp3, ms = P['metal~swiftshader'].sev?.cp3, ls = P['lavapipe~swiftshader'].sev?.cp3; if (ml === undefined) { out.notComparable.push(ex); continue; }
  const a = [agree(ml), agree(ms), agree(ls)]; const rec = { ex, ml, ms, ls, wgslSame: [P['metal~lavapipe'].wgslIdentical, P['metal~swiftshader'].wgslIdentical, P['lavapipe~swiftshader'].wgslIdentical] };
  const k = a.every(Boolean) ? 'all_agree' : a[0] && !a[1] && !a[2] ? 'ss_lone' : !a[0] && a[1] && !a[2] ? 'lav_lone' : !a[0] && !a[1] && a[2] ? 'metal_lone' : !a.some(Boolean) ? 'all_differ' : 'other'; out.cp3[k].push(rec); }
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1)); console.log(Object.fromEntries(Object.entries(out.cp3).map(([k, v]) => [k, v.length])), 'notComparable', out.notComparable.length);
for (const k of ['ss_lone', 'lav_lone', 'metal_lone', 'other']) console.log(k, out.cp3[k].map((r) => `${r.ex}[${r.ml}${r.ms}${r.ls}]`).join(' '));
