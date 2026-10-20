import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname); const P3 = path.resolve(here, '../../../runs/drift-swiftshader'); const SW = path.resolve(here, '../../../runs/phase2');
const [outMd, outJson, ...cfgs] = process.argv.slice(2); const all = ['m155', ...cfgs];
const dec = (h) => { const b = Buffer.alloc(4); b.writeUInt32BE(parseInt(h, 16)); return b.readFloatBE(0); }; const f = (x) => (Object.is(x, -0) ? '-0' : Number.isNaN(x) ? 'NaN' : x === Infinity ? 'inf' : x === -Infinity ? '-inf' : String(x));
const sp = (v) => Number.isNaN(v) || !Number.isFinite(v) || v === 0;
const dumpPath = (cfg, g) => (cfg === 'm155' ? `${SW}/raw/group${g}/swiftshader-arm64-run1/allrows-bits-ext.json` : `${P3}/raw/${cfg}/group${g}-run1/allrows-bits-ext.json`);
const table = {};
for (const g of ['A', 'B', 'C', 'D', 'L']) for (const cfg of all) { const p = dumpPath(cfg, g); if (!fs.existsSync(p)) continue; const D = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const grp of D.groups) { if (grp.type !== 'f32') continue; for (const row of grp.rows) { const args = row.inputs.map((x) => dec(x[0])); if (!args.some(sp)) continue; const key = `${grp.op}(${args.map(f).join(', ')})`; (table[key] ??= {})[cfg] = f(dec(row.gpu[0])); } } }
const diff = Object.entries(table).filter(([, v]) => new Set(Object.values(v)).size > 1);
const present = all.filter((c) => Object.values(table).some((v) => c in v));
const lines = ['# Special-operand outputs across SwiftShader builds (scalar f32 rows with a 0/-0/inf/NaN operand; only calls whose output differs between at least two builds)', '', `Builds present: ${present.join(', ')}. Baseline m155 = Phase-2 Debian M155 arm64. ${diff.length} of ${Object.keys(table).length} special-operand calls differ in at least one build.`, ''];
lines.push(`| call | ${present.join(' | ')} |`, `|---|${present.map(() => '---').join('|')}|`); for (const [k, v] of diff.slice(0, 400)) lines.push(`| ${k} | ${present.map((c) => v[c] ?? '').join(' | ')} |`);
fs.writeFileSync(outMd, lines.join('\n') + '\n'); fs.writeFileSync(outJson, JSON.stringify({ builds: present, callsTotal: Object.keys(table).length, callsDiffering: diff.length, differing: Object.fromEntries(diff) }, null, 1)); console.log(lines.slice(0, 3).join('\n'));
