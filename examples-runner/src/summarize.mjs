import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { classify, checkable } from './classify.mjs';
export function loadRuns(OUT) {
  const rows = fs.existsSync(path.join(OUT, 'runs.jsonl')) ? fs.readFileSync(path.join(OUT, 'runs.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const by = {};
  for (const r0 of rows) {
    const res = readResult(OUT, r0.example, r0.repeat); const c = classify(res, r0.exit); const r = { ...r0, ...c, checkable: checkable(res), classifiedBy: 'summarize.mjs' };
    (by[r.example] ??= {})[r.repeat] = r;
  }
  return by;
}
export function readResult(OUT, ex, rep) { try { return JSON.parse(fs.readFileSync(path.join(OUT, ex.replace('/', '--'), `r${rep}`, 'result.json'), 'utf8')); } catch { return null; } }
const QUERY_RESOLVE = 512;
export const isVolatileBuffer = (b) => !!(b.usage & QUERY_RESOLVE);
export const domNorm = (dom) => crypto.createHash('sha256').update((dom?.text ?? '').replace(/-?\d+\.\d+/g, '#')).digest('hex');
export function fingerprint(result) {
  const fp = {}; for (const [cp, v] of Object.entries(result?.checkpoints ?? {})) {
    fp[cp] = { canvases: (v.canvases ?? []).map((c) => c.sha256 ?? null), buffers: (v.buffers ?? []).filter((b) => !isVolatileBuffer(b)).map((b) => `${b.dev}.${b.n}:${b.sha256 ?? b.skipped}`), textures: (v.textures ?? []).map((t) => `${t.dev}.${t.n}:${t.sha256 ?? t.skipped}`), dom: domNorm(v.dom) };
  } return fp;
}
export function summarize(OUT, DEST = OUT) {
  const by = loadRuns(OUT); const ex = {};
  for (const [name, reps] of Object.entries(by)) {
    const r1 = reps[1], r2 = reps[2]; const res1 = readResult(OUT, name, 1), res2 = readResult(OUT, name, 2);
    let det = null;
    if (res1 && res2) { const a = JSON.stringify(fingerprint(res1)), b = JSON.stringify(fingerprint(res2)); det = a === b ? 'identical' : 'differs'; if (det === 'differs') { const A = fingerprint(res1), B = fingerprint(res2); det = { differs: Object.keys(A).filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k])) }; } }
    ex[name] = { class: r1?.class, detail: r1?.detail, notes: r1?.notes, class2: r2?.class, sameClass: r1 && r2 ? r1.class === r2.class : null, determinism: det, checkable: r1?.checkable, wallMs: [r1?.wallMs, r2?.wallMs] };
  }
  const counts = {}; for (const e of Object.values(ex)) counts[e.class] = (counts[e.class] ?? 0) + 1;
  const unstable = Object.entries(ex).filter(([, e]) => e.sameClass === false).map(([n]) => n);
  const nondet = Object.entries(ex).filter(([, e]) => e.determinism && e.determinism !== 'identical').map(([n]) => n);
  fs.mkdirSync(DEST, { recursive: true });
  fs.writeFileSync(path.join(DEST, 'summary.json'), JSON.stringify({ counts, unstable, nondeterministic: nondet, examples: ex }, null, 1));
  const lines = [`# summary (${Object.keys(ex).length} examples)`, '', '| class | n |', '|---|---|', ...Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`), '', `class differs run1/run2: ${unstable.join(', ') || 'none'}`, `readback differs run1/run2: ${nondet.join(', ') || 'none'}`, '', '| example | class | determinism | detail |', '|---|---|---|---|', ...Object.entries(ex).map(([n, e]) => `| ${n} | ${e.class}${e.sameClass === false ? ' (r2: ' + e.class2 + ')' : ''} | ${(e.determinism && typeof e.determinism === 'object') ? 'DIFF ' + e.determinism.differs : e.determinism ?? '-'} | ${(e.detail ?? '').replace(/\|/g, '/').slice(0, 140)} |`)];
  fs.writeFileSync(path.join(DEST, 'summary.md'), lines.join('\n') + '\n');
  return ex;
}
if (process.argv[1]?.endsWith('summarize.mjs')) summarize(path.resolve(process.argv[2]), path.resolve(process.argv[3] ?? process.argv[2]));
