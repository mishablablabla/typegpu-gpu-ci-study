// usage: node collect-ex.mjs <exrundir> -> <exrundir>/ex.json : per (example,repeat): class, value fingerprint (canvas/buffer/texture hashes of all checkpoints, timestamp-ish buffers and decimals in DOM text excluded), text fingerprint (WGSL module hashes), gpu error count.
import fs from 'node:fs'; import path from 'node:path'; import { createHash } from 'node:crypto';
const dir = path.resolve(process.argv[2]); const sha = (s) => createHash('sha256').update(s).digest('hex');
const rows = fs.existsSync(path.join(dir, 'runs.jsonl')) ? fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const out = { dir, adapter: rows[0]?.adapter ?? null, examples: {} };
for (const r of rows) { const f = path.join(dir, r.example.replace('/', '--'), `r${r.repeat}`, 'result.json'); let value = null, text = null, gpuErr = null, canvas = 0;
  if (fs.existsSync(f)) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); const parts = [];
    for (const cp of Object.keys(j.checkpoints ?? {}).sort()) { const c = j.checkpoints[cp]; for (const x of c.canvases ?? []) parts.push(`c${x.idx}:${x.sha256}`); for (const b of c.buffers ?? []) if (!(b.usage & 512) && !/timestamp|query/i.test(b.label ?? "")) parts.push(`b${b.dev}.${b.n}:${b.sha256}`); for (const t of c.textures ?? []) parts.push(`t:${t.sha256 ?? ''}`); parts.push('dom:' + sha(String(c.dom?.text ?? '').replace(/-?\d+\.\d+/g, '#'))); }
    value = sha(JSON.stringify(parts)); text = sha(JSON.stringify((j.shaderModules ?? []).map((m) => m.sha256))); gpuErr = j.gpuErrorCount + (j.shaderCompileErrors ?? 0); }
  (out.examples[r.example] ??= {})[r.repeat] = { class: r.class, value, text, gpuErr, wallMs: r.wallMs }; }
fs.writeFileSync(path.join(dir, 'ex.json'), JSON.stringify(out)); console.log(Object.keys(out.examples).length, 'examples');
