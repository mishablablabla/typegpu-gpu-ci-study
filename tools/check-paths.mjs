import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TOP = ['ci', 'docker', 'evaluator', 'tools', 'mutation', 'examples-runner', 'typegpu-examples', 'third_party', 'scripts', 'lib', 'diff', 'ported', 'selftest', 'investigations', 'docs', 'results', '.github'];
const IGNORE = [/^third_party\/llvm-project/, /^runs\//, /^out\//, /^docker\/swiftshader\/icd(\/|$)/, /^third_party\/cts(\/|$)/, /^examples-runner\/docker\/ctx/, /^mutation\/_scratch/, /^investigations\/[^/]+\/raw/, /^reports\//, /^evaluator\/group/, /^evaluator\/evaluator-versions/, /node_modules/, /out-local$/, /typegpu-examples\/results$/];
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'runs']);
const re = new RegExp('(?:^|[\\s"\'`=:(<])((?:' + TOP.map((t) => t.replace('.', '\\.')).join('|') + ')/[A-Za-z0-9_./@~-]*[A-Za-z0-9_])', 'g');
const missing = [];
let checked = 0;

function exists(rel) {
  rel = rel.replace(/[.,;:)]+$/, '');
  if (IGNORE.some((r) => r.test(rel))) return true;
  return fs.existsSync(path.join(ROOT, rel)) || fs.existsSync(path.join(ROOT, rel + '.gz'));
}

function scanText(file, text, { md }) {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (md) {
      for (const m of line.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
        const l = m[1];
        if (/^(https?:|mailto:)/.test(l)) continue;
        const target = path.resolve(path.dirname(file), l);
        checked++;
        if (!fs.existsSync(target) && !fs.existsSync(target + '.gz')) missing.push(`${path.relative(ROOT, file)}:${i + 1}: link ${l}`);
      }
    }
    for (const m of line.matchAll(re)) {
      const p = m[1];
      if (/[$*<>{}]/.test(p)) continue;
      checked++;
      if (!exists(p)) missing.push(`${path.relative(ROOT, file)}:${i + 1}: ${p}`);
    }
  });
}

function walk(d, cb) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, cb); } else cb(p);
  }
}

const mode = process.argv[2] ?? 'all';
const files = [];
walk(ROOT, (p) => files.push(p));
for (const f of files) {
  const rel = path.relative(ROOT, f);
  const b = path.basename(f);
  const isMd = /\.md$/.test(b);
  const isScript = /\.sh$/.test(b) || /^Dockerfile/.test(b) || /dockerignore$/.test(b);
  const isYml = /\.yml$/.test(b);
  if (mode === 'docs' && !isMd) continue;
  if (mode === 'code' && isMd) continue;
  if (isMd && /^(docs|results)\//.test(rel) && mode === 'code') continue;
  if (!isMd && !isScript && !isYml) continue;
  if (/^(investigations)\//.test(rel) && !isMd) continue;
  if (/^typegpu-examples\//.test(rel) && !isMd) continue;
  if (/^(lib|diff|ported|selftest|scripts)\//.test(rel) && !isMd) continue;
  scanText(f, fs.readFileSync(f, 'utf8'), { md: isMd });
}
console.log(`checked ${checked} references, missing ${missing.length}`);
for (const m of missing) console.log(m);
process.exit(missing.length ? 1 : 0);
