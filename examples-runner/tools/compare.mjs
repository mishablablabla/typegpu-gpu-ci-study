import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { loadRuns, readResult, fingerprint, isVolatileBuffer, domNorm } from '../src/summarize.mjs';

const [, , outFile, ...specs] = process.argv;
const runs = specs.map((s) => { const [label, dir] = s.split('='); return { label, dir: path.resolve(dir), by: loadRuns(path.resolve(dir)) }; });
const names = [...new Set(runs.flatMap((r) => Object.keys(r.by)))].sort();
const RAN = (c) => c === 'ran-clean' || c === 'ran-with-gpu-validation-errors';

function dump(dir, ex, rep, cp, name) { try { return zlib.gunzipSync(fs.readFileSync(path.join(dir, ex.replace('/', '--'), `r${rep}`, `cp${cp}`, name + '.bin.gz'))); } catch { return null; } }
const f32of = (u8) => new Float32Array(u8.buffer.slice(u8.byteOffset, u8.byteOffset + (u8.length & ~3)));

function cmpPixels(a, b, fmt) {
  if (a.length !== b.length) return { sizeMismatch: [a.length, b.length] };
  if (fmt === 'rgba16float') { const u = (x) => new Uint16Array(x.buffer.slice(x.byteOffset, x.byteOffset + x.length)); const A = u(a), B = u(b); let nd = 0, max = 0, px = 0, pxd = 0; for (let i = 0; i < A.length; i += 4) { let d = false; for (let c = 0; c < 4; c++) if (A[i + c] !== B[i + c]) { nd++; d = true; max = Math.max(max, Math.abs(A[i + c] - B[i + c])); } px++; if (d) pxd++; } return { halfBitsMaxDiff: max, pctPixelsDiffering: +(100 * pxd / px).toFixed(3) }; }
  let max = 0, sum = 0, pxd = 0; const n = a.length / 4;
  for (let i = 0; i < a.length; i += 4) { let big = false; for (let c = 0; c < 4; c++) { const d = Math.abs(a[i + c] - b[i + c]); if (d > max) max = d; sum += d; if (d > 2) big = true; } if (big) pxd++; }
  return { maxAbsDiff255: max, pctPixelsDiffGt2of255: +(100 * pxd / n).toFixed(3), meanAbsDiff255: +(sum / a.length).toFixed(4) };
}
function cmpWords(a, b) {
  if (a.length !== b.length) return { sizeMismatch: [a.length, b.length] };
  const A = f32of(a), B = f32of(b); let nd = 0, max = 0, nanMis = 0, maxRel = 0, bad = 0;
  for (let i = 0; i < A.length; i++) { if (A[i] === B[i] || (Number.isNaN(A[i]) && Number.isNaN(B[i]))) continue; nd++; if (Number.isNaN(A[i]) !== Number.isNaN(B[i])) { nanMis++; bad++; continue; } if (!Number.isFinite(A[i]) || !Number.isFinite(B[i])) { max = Infinity; bad++; continue; } const d = Math.abs(A[i] - B[i]); if (d > max) max = d; const rel = d / Math.max(Math.abs(A[i]), Math.abs(B[i]), 1e-30); if (rel > maxRel) maxRel = rel; if (d > 1e-3 * Math.max(1, Math.abs(A[i]), Math.abs(B[i]))) bad++; }
  return { pctWordsDiffering: +(100 * nd / Math.max(1, A.length)).toFixed(3), pctBad: +(100 * bad / Math.max(1, A.length)).toFixed(4), maxAbsDiffF32view: max, maxRelDiffF32view: +maxRel.toExponential(3), nanMismatch: nanMis };
}
const halfToF = (h) => { const e = (h >> 10) & 31, m = h & 1023, sg = h & 0x8000 ? -1 : 1; if (e === 0) return sg * m * 2 ** -24; if (e === 31) return m ? NaN : sg * Infinity; return sg * (1 + m / 1024) * 2 ** (e - 15); };
function cmpTexture(a, b, fmt) {
  if (a.length !== b.length) return { sizeMismatch: [a.length, b.length] };
  if (/^(r|rg|rgba|bgra)8/.test(fmt) || fmt === 'rgb10a2unorm') { let max = 0, n = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > max) max = d; if (d > 2) n++; } return { kind: 'bytes', maxAbs: max, pctGt2: +(100 * n / a.length).toFixed(3), pctBad: +(100 * n / a.length).toFixed(3), maxRel: max / 255 }; }
  let A, B, conv = (x) => x;
  if (/16float/.test(fmt)) { A = new Uint16Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.length)); B = new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); conv = halfToF; }
  else if (/32float/.test(fmt)) { A = f32of(a); B = f32of(b); }
  else { const u = (x) => new Uint32Array(x.buffer.slice(x.byteOffset, x.byteOffset + (x.length & ~3))); A = u(a); B = u(b); let nd = 0; for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) nd++; return { kind: 'u32', pctWordsDiffering: +(100 * nd / Math.max(1, A.length)).toFixed(3), pctBad: +(100 * nd / Math.max(1, A.length)).toFixed(3), maxRel: nd ? Infinity : 0 }; }
  let nd = 0, max = 0, maxRel = 0, nanMis = 0, bad = 0; for (let i = 0; i < A.length; i++) { const x = conv(A[i]), y = conv(B[i]); if (x === y || (Number.isNaN(x) && Number.isNaN(y))) continue; nd++; if (Number.isNaN(x) !== Number.isNaN(y)) { nanMis++; bad++; continue; } if (!Number.isFinite(x) || !Number.isFinite(y)) { max = Infinity; maxRel = Infinity; bad++; continue; } const d = Math.abs(x - y); if (d > max) max = d; const r = d / Math.max(Math.abs(x), Math.abs(y), 1e-30); if (r > maxRel) maxRel = r; if (d > 1e-3 * Math.max(1, Math.abs(x), Math.abs(y))) bad++; }
  return { kind: 'float', pctWordsDiffering: +(100 * nd / Math.max(1, A.length)).toFixed(3), pctBad: +(100 * bad / Math.max(1, A.length)).toFixed(4), maxAbs: max, maxRel: nanMis ? Infinity : maxRel, nanMismatch: nanMis };
}
function compareOne(ex, A, B) {
  const ra = readResult(A.dir, ex, 1), rb = readResult(B.dir, ex, 1);
  const ca = A.by[ex]?.[1]?.class, cb = B.by[ex]?.[1]?.class;
  if (!RAN(ca) || !RAN(cb)) return { comparable: false, why: `${A.label}:${ca ?? '-'} ${B.label}:${cb ?? '-'}` };
  const res = { comparable: true, checkpoints: {}, verdict: 'bit-identical', structure: 'same' };
  const wa = (ra.shaderModules ?? []).map((m) => m.sha256).join(','), wb = (rb.shaderModules ?? []).map((m) => m.sha256).join(',');
  res.wgslIdentical = wa === wb;
  const worst = { canvasPctGt2: 0, canvasMax: 0, bufMaxAbs: 0, bufPctWords: 0, bufMaxRel: 0, texMaxRel: 0, texUnknown: 0, texPctGt2: 0, bufPctBad: 0, texPctBad: 0 };
  for (const cp of Object.keys(ra.checkpoints ?? {})) {
    const w0 = { ...worst }; worst.canvasPctGt2 = 0; worst.canvasMax = 0; worst.bufMaxAbs = 0; worst.bufPctWords = 0; worst.bufMaxRel = 0; worst.texMaxRel = 0; worst.texUnknown = 0; worst.texPctGt2 = 0; worst.bufPctBad = 0; worst.texPctBad = 0;
    const xa = ra.checkpoints[cp], xb = rb.checkpoints?.[cp]; if (!xb) { res.structure = `checkpoint ${cp} missing in ${B.label}`; res.verdict = 'not-comparable'; continue; }
    const item = { canvases: [], buffers: { total: 0, identical: 0, differing: [] }, textures: { total: 0, identical: 0, differing: [] }, dom: domNorm(xa.dom) === domNorm(xb.dom) };
    xa.canvases.forEach((c, i) => { const d = xb.canvases[i]; if (!d || !c.sha256 || !d.sha256) return; if (c.nonZero !== d.nonZero) (res.blankMismatch ??= []).push(`cp${cp} canvas${i}: ${A.label} nonZero=${c.nonZero} ${B.label} nonZero=${d.nonZero}`); if (c.sha256 === d.sha256) { item.canvases.push({ idx: i, identical: true }); return; } const a = dump(A.dir, ex, 1, cp, `canvas${c.idx}`), b = dump(B.dir, ex, 1, cp, `canvas${d.idx}`); const m = a && b ? cmpPixels(a, b, c.format) : { noDump: true }; item.canvases.push({ idx: i, identical: false, ...m }); worst.canvasPctGt2 = Math.max(worst.canvasPctGt2, m.pctPixelsDiffGt2of255 ?? 0); worst.canvasMax = Math.max(worst.canvasMax, m.maxAbsDiff255 ?? 0); });
    for (const kind of ['buffers', 'textures']) {
      const pre = kind === 'buffers' ? 'buf' : 'tex'; const mapB = new Map((xb[kind] ?? []).map((o) => [`${o.dev}.${o.n}`, o]));
      for (const o of xa[kind] ?? []) { if (!o.sha256 || (kind === 'buffers' && isVolatileBuffer(o))) continue; const p = mapB.get(`${o.dev}.${o.n}`); item[kind].total++; if (!p || !p.sha256) { item[kind].differing.push({ id: `${o.dev}.${o.n}`, label: o.label, note: 'missing/skipped in other' }); res.structure = 'resource lists differ'; continue; } if (o.sha256 === p.sha256) { item[kind].identical++; continue; } const a = dump(A.dir, ex, 1, cp, `${pre}${o.dev}-${o.n}`), b = dump(B.dir, ex, 1, cp, `${pre}${o.dev}-${o.n}`); const m = a && b ? (kind === 'textures' ? cmpTexture(a, b, o.format) : cmpWords(a, b)) : { noDump: true, size: o.size ?? o.bytes }; item[kind].differing.push({ id: `${o.dev}.${o.n}`, label: o.label, size: o.size ?? o.bytes, format: o.format, ...m }); if (kind === 'textures') { if (!m.noDump) worst.texPctBad = Math.max(worst.texPctBad, m.sizeMismatch ? 100 : m.pctBad ?? 0); if (m.noDump) worst.texUnknown = 1; else worst.texMaxRel = Math.max(worst.texMaxRel ?? 0, m.sizeMismatch ? Infinity : m.maxRel ?? 0); if (m.kind === 'bytes') worst.texPctGt2 = Math.max(worst.texPctGt2 ?? 0, m.pctGt2); } if (kind === 'buffers') { if (typeof m.maxAbsDiffF32view === 'number') worst.bufMaxAbs = Math.max(worst.bufMaxAbs, m.maxAbsDiffF32view); worst.bufPctWords = Math.max(worst.bufPctWords, m.pctWordsDiffering ?? 0); if (!m.noDump) worst.bufPctBad = Math.max(worst.bufPctBad, m.sizeMismatch ? 100 : m.pctBad ?? 0); if (m.noDump) worst.bufUnknown = 1; else worst.bufMaxRel = Math.max(worst.bufMaxRel, m.sizeMismatch ? Infinity : Number(m.maxRelDiffF32view ?? 0) || 0, m.nanMismatch ? Infinity : 0); } }
    }
    const anyDiff = item.canvases.some((c) => !c.identical) || item.buffers.differing.length || item.textures.differing.length || !item.dom;
    item.identical = !anyDiff; item.worst = { ...worst }; res.checkpoints[cp] = item; if (anyDiff) res.verdict = 'differs';
  }
  res.worst = Object.values(res.checkpoints).reduce((a, c) => ({ canvasPctGt2: Math.max(a.canvasPctGt2, c.worst.canvasPctGt2), canvasMax: Math.max(a.canvasMax, c.worst.canvasMax), bufMaxAbs: Math.max(a.bufMaxAbs, c.worst.bufMaxAbs), bufPctWords: Math.max(a.bufPctWords, c.worst.bufPctWords), bufMaxRel: Math.max(a.bufMaxRel, c.worst.bufMaxRel), bufUnknown: a.bufUnknown || c.worst.bufUnknown || 0, texMaxRel: Math.max(a.texMaxRel, c.worst.texMaxRel), texUnknown: a.texUnknown || c.worst.texUnknown || 0, texPctGt2: Math.max(a.texPctGt2, c.worst.texPctGt2), bufPctBad: Math.max(a.bufPctBad, c.worst.bufPctBad), texPctBad: Math.max(a.texPctBad, c.worst.texPctBad) }), { canvasPctGt2: 0, canvasMax: 0, bufMaxAbs: 0, bufPctWords: 0, bufMaxRel: 0, texMaxRel: 0, texUnknown: 0, texPctGt2: 0, bufPctBad: 0, texPctBad: 0 });
  for (const [cp, c] of Object.entries(res.checkpoints)) res['verdictCp' + cp] = c.identical ? ((c.canvases.length || c.buffers.total || c.textures.total) ? 'bit-identical' : 'no-readbacks') : 'differs';
  const cps = Object.values(res.checkpoints); res.hasReadbacks = cps.some((c) => c.canvases.length || c.buffers.total || c.textures.total);
  if (res.verdict === 'bit-identical' && !res.hasReadbacks) res.verdict = 'no-readbacks';
  return res;
}

const out = { runs: runs.map((r) => ({ label: r.label, dir: r.dir })), examples: {} };
for (const ex of names) {
  const rec = { backends: {}, pairs: {} };
  for (const r of runs) { const a = r.by[ex]?.[1], b = r.by[ex]?.[2]; const res1 = a ? readResult(r.dir, ex, 1) : null; const res2 = b ? readResult(r.dir, ex, 2) : null; let det = null; if (res1 && res2) { const A = fingerprint(res1), B = fingerprint(res2); det = JSON.stringify(A) === JSON.stringify(B) ? 'identical' : { differs: Object.keys(A).filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k])) }; }
    rec.backends[r.label] = { class: a?.class ?? null, detail: a?.detail ?? '', notes: a?.notes ?? [], interact: a?.interact ?? null, class2: b?.class ?? null, determinism: det, console: res1 ? { warn: (res1.console?.lines ?? []).filter((l) => l.level === 'warn').length, error: (res1.console?.lines ?? []).filter((l) => l.level === 'error').length, total: res1.console?.count ?? 0 } : null, partial: a?.partial ?? false, checkable: a?.checkable?.checkable ?? null, wallMs: [a?.wallMs, b?.wallMs], features: res1 ? { requested: [...new Set((res1.deviceRequests ?? []).flatMap((q) => q.requiredFeatures))], failedRequest: (res1.deviceRequests ?? []).filter((q) => !q.ok).map((q) => q.message) } : null }; }
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) rec.pairs[`${runs[i].label}~${runs[j].label}`] = compareOne(ex, runs[i], runs[j]);
  out.examples[ex] = rec;
}
fs.writeFileSync(outFile, JSON.stringify(out, (k, v) => (v === Infinity ? 1e30 : v), 1));
console.error(`wrote ${outFile}: ${names.length} examples`);
