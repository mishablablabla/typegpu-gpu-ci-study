// usage: node assert-adapters.mjs <backend> <outdir>  -- checks every adapter seen by any test process (adapters-*.jsonl) matches the backend. exit 3 on mismatch/no data.
import fs from 'node:fs'; import path from 'node:path';
const [backend, out] = process.argv.slice(2); const fpDirs = [out];
const rows = []; const dirs = [out, ...fs.readdirSync(out, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(out, e.name))];
for (const dd of dirs) for (const f of fs.readdirSync(dd)) if (/^adapters-.*\.jsonl$/.test(f)) for (const l of fs.readFileSync(path.join(dd, f), "utf8").split("\n").filter(Boolean)) rows.push(JSON.parse(l));
const ok = (a) => backend === 'swiftshader' ? a.vendor === 'google' && a.architecture === 'swiftshader' && /swiftshader/i.test(a.description + a.device) && !a.shaderF16
  : backend === 'lavapipe' ? a.vendor === 'mesa' && /llvmpipe/i.test(a.description + a.device) && a.shaderF16
  : backend === 'metal' ? a.vendor === 'apple' && /metal/i.test(a.architecture + a.description) : false;
const bad = rows.filter((a) => !ok(a)); const uniq = [...new Set(rows.map((a) => `${a.vendor}/${a.architecture}/${a.device}/${a.description}/f16=${a.shaderF16}`))];
const res = { backend, adaptersSeen: rows.length, unique: uniq, mismatches: bad.length, result: rows.length > 0 && bad.length === 0 ? 'PASS' : 'FAIL' };
fs.writeFileSync(path.join(out, 'adapter-assert.json'), JSON.stringify(res, null, 1)); console.log(JSON.stringify(res)); process.exit(res.result === 'PASS' ? 0 : 3);
