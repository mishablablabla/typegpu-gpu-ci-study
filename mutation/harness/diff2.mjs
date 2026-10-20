import fs from 'node:fs'; const [a, b] = process.argv.slice(2).map((d) => JSON.parse(fs.readFileSync(d + '/run.json', 'utf8')));
const tot = { tests: 0, noGpuData: 0, valueSame: 0, valueDiff: 0, textSame: 0, textDiff: 0, statusDiff: 0 }; const ex = { value: [], text: [], status: [] };
for (const [p, pa] of Object.entries(a.pools)) { const pb = b.pools[p]; for (const [k, ta] of Object.entries(pa.tests)) { const tb = pb?.tests[k]; if (!tb) continue; tot.tests++;
  if (ta.status !== tb.status) { tot.statusDiff++; ex.status.push(p + '|' + k + ' ' + ta.status + '->' + tb.status); }
  if (!ta.nrb && !ta.nwg) tot.noGpuData++;
  if (ta.value === tb.value) tot.valueSame++; else { tot.valueDiff++; ex.value.push(p + '|' + k); }
  if (ta.text === tb.text) tot.textSame++; else { tot.textDiff++; ex.text.push(p + '|' + k); } } }
console.log(JSON.stringify(tot)); for (const k of ['status', 'value', 'text']) if (ex[k].length) console.log(k, ex[k].slice(0, 15));
