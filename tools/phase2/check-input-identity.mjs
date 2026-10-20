// usage: node check-input-identity.mjs <frozen-ref dump> <new dump>   (exit 1 on any failure)
// Checks: same schema/ops/group list/row-id sequence, raw-identical input bits (sha256), want+cpu identical after NaN canonicalisation, all-zero-GPU sanity, cpuRecompute mismatches == 0.
import fs from 'node:fs'; import crypto from 'node:crypto';
const [refP, newP] = process.argv.slice(2); const R = JSON.parse(fs.readFileSync(refP, 'utf8')), N = JSON.parse(fs.readFileSync(newP, 'utf8'));
const out = []; const chk = (n, ok, d = '') => out.push({ n, ok: !!ok, d });
const inputHash = (D) => { const h = crypto.createHash('sha256'); for (const g of D.groups) { h.update(`${g.op}/${g.type}\n`); for (const r of g.rows) h.update(`${r.id}:${JSON.stringify(r.inputs)}\n`); } return h.digest('hex'); };
const canon = (x) => JSON.stringify(x, (k, v) => typeof v === 'string' && /^[0-9a-f]+$/.test(v) ? canonHex(v) : v);
const canonHex = (h) => { if (h.length === 8) { const e = (parseInt(h.slice(0, 4), 16) >> 7) & 0xff, m = parseInt(h, 16) & 0x7fffff; return e === 255 && m ? 'NaN32' : h; } if (h.length === 16) { const e = Number((BigInt('0x' + h) >> 52n) & 0x7ffn), m = BigInt('0x' + h) & 0xfffffffffffffn; return e === 2047 && m ? 'NaN64' : h; } if (h.length === 4) { const e = (parseInt(h, 16) >> 10) & 31, m = parseInt(h, 16) & 0x3ff; return e === 31 && m ? 'NaN16' : h; } return h; };
chk('schema equal', R.schema === N.schema, `${R.schema} vs ${N.schema}`); chk('ops equal', JSON.stringify(R.ops) === JSON.stringify(N.ops), `${R.ops} vs ${N.ops}`);
chk('group list equal', JSON.stringify(R.groups.map((g) => [g.op, g.type, g.total])) === JSON.stringify(N.groups.map((g) => [g.op, g.type, g.total])), `${R.groups.length} vs ${N.groups.length} groups`);
const hr = inputHash(R), hn = inputHash(N); chk('input-set sha256 equal', hr === hn, `${hr.slice(0, 16)} vs ${hn.slice(0, 16)}`);
let wantDiff = 0, cpuDiff = 0, rows = 0, zeroGroups = [], cpuMis = 0;
for (let i = 0; i < Math.min(R.groups.length, N.groups.length); i++) { const a = R.groups[i], b = N.groups[i]; if (a.op !== b.op) continue; let nz = 0, nw = 0; cpuMis += b.cpuRecompute?.mismatches ?? 0;
  for (let j = 0; j < Math.min(a.rows.length, b.rows.length); j++) { rows++; if (canon(a.rows[j].want) !== canon(b.rows[j].want)) wantDiff++; if (canon(a.rows[j].cpu) !== canon(b.rows[j].cpu)) cpuDiff++; for (const x of [].concat(b.rows[j].gpu.flat?.() ?? b.rows[j].gpu)) { nw++; if (/^0+$/.test(String(x))) nz++; } }
  if (nw > 20 && nz / nw > 0.9) zeroGroups.push(`${b.op}/${b.type}`); }
chk('want equal (NaN canonicalised)', wantDiff === 0, `${wantDiff} rows differ of ${rows}`); chk('cpu column equal (NaN canonicalised)', cpuDiff === 0, `${cpuDiff} rows differ`);
chk('no group has >90% all-zero GPU bits (silent failed dispatch)', zeroGroups.length === 0, zeroGroups.join(','));
chk('cpuRecompute mismatches == 0', cpuMis === 0, String(cpuMis));
console.log(out.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.d ? '  [' + r.d + ']' : ''}`).join('\n')); console.log(`input-set-sha256: ${hn}\nref-input-set-sha256: ${hr}`); process.exit(out.every((r) => r.ok) ? 0 : 1);
