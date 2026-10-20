import { afterAll, afterEach, beforeEach } from 'vitest';
import { globals } from 'webgpu';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = process.env.P3_FP_OUT ?? path.join(process.cwd(), 'p3-fp-local');
const ROOT = process.env.P3_ROOT ?? '';
const sha = (b: any) => createHash('sha256').update(b).digest('hex');
mkdirSync(path.join(OUT, 'wgsl'), { recursive: true });

type Bucket = { rb: string[]; rbBytes: number; wg: string[]; rec: string[] };
const fresh = (): Bucket => ({ rb: [], rbBytes: 0, wg: [], rec: [] });
const G: any = globalThis;
G.__p3 ??= { cur: null as Bucket | null, outside: fresh(), modes: new WeakMap<object, number>() };
const S = G.__p3;
const bucket = (): Bucket => S.cur ?? S.outside;

const GB: any = (globals as any).GPUBuffer?.prototype;
const GD: any = (globals as any).GPUDevice?.prototype;
const GG: any = (globals as any).GPU?.prototype;
if (GB && !GB.__p3) {
  GB.__p3 = true;
  const mapAsync = GB.mapAsync, getMappedRange = GB.getMappedRange;
  GB.mapAsync = function (mode: number, ...r: any[]) { S.modes.set(this, mode); return mapAsync.call(this, mode, ...r); };
  GB.getMappedRange = function (...a: any[]) {
    const ab = getMappedRange.apply(this, a);
    if (((S.modes.get(this) ?? 0) & 1) !== 0 && ab && S.timing.has(this)) { bucket().rb.push('timing-skipped'); } else if (((S.modes.get(this) ?? 0) & 1) !== 0 && ab) { const b = bucket(); const u8 = new Uint8Array(ab); b.rb.push(sha(u8) + ':' + u8.byteLength); b.rbBytes += u8.byteLength; }
    return ab;
  };
}
const GCE: any = (globals as any).GPUCommandEncoder?.prototype; // timestamp-query results are wall-clock data: never hash them (mark resolve targets and their copies as 'timing')
S.timing ??= new WeakSet<object>();
if (GCE && !GCE.__p3) {
  GCE.__p3 = true; const rqs = GCE.resolveQuerySet, cb2b = GCE.copyBufferToBuffer;
  GCE.resolveQuerySet = function (qs: any, f: any, c: any, dest: any, off: any) { try { S.timing.add(dest); } catch {} return rqs.call(this, qs, f, c, dest, off); };
  GCE.copyBufferToBuffer = function (src: any, ...r: any[]) { try { if (S.timing.has(src)) S.timing.add(r.length >= 4 ? r[1] : r[0]); } catch {} return cb2b.call(this, src, ...r); };
}
if (GD && !GD.__p3) {
  GD.__p3 = true;
  const csm = GD.createShaderModule;
  GD.createShaderModule = function (desc: any) {
    try { const code = String(desc?.code ?? ''); const h = sha(code); bucket().wg.push(h); const f = path.join(OUT, 'wgsl', h + '.wgsl'); if (!existsSync(f)) writeFileSync(f, code); } catch {}
    return csm.call(this, desc);
  };
}
if (GG && !GG.__p3) {
  GG.__p3 = true;
  const ra = GG.requestAdapter;
  GG.requestAdapter = async function (...a: any[]) {
    const ad = await ra.apply(this, a);
    if (ad) { try { const i = ad.info; appendFileSync(path.join(OUT, `adapters-${process.pid}.jsonl`), JSON.stringify({ vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description, shaderF16: ad.features.has('shader-f16'), features: [...ad.features].sort() }) + '\n'); } catch {} }
    return ad;
  };
}
const wrapRecord = () => {
  const o = G.__record; if (typeof o !== 'function' || o.__p3) return;
  const w: any = (n: string, d: unknown) => { try { bucket().rec.push(n + ':' + sha(JSON.stringify(d, (k, v) => (/^(ms|time|timeMs|elapsed|elapsedMs|duration|durationMs|wallMs)$/i.test(k) ? undefined : v)) ?? 'undefined')); } catch {} return o(n, d); }; w.__p3 = true; G.__record = w;
};
const file = (t: any) => { const f = String(t?.file?.filepath ?? ''); return ROOT && f.startsWith(ROOT) ? f.slice(ROOT.length).replace(/^\/+/, '') : f; };
const flush = (name: { file: string; anc: string[]; title: string }, b: Bucket) =>
  appendFileSync(path.join(OUT, `fp-${process.pid}.jsonl`), JSON.stringify({ ...name, nrb: b.rb.length, rbBytes: b.rbBytes, rb: b.rb, wg: b.wg, rec: b.rec, value: sha(JSON.stringify([[...b.rb].sort(), [...b.rec].sort()])), valueOrdered: sha(JSON.stringify([b.rb, b.rec])), text: sha(JSON.stringify(b.wg)) }) + '\n');
const seedOf = (str: string) => { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
const mulberry32 = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
beforeEach(({ task }: any) => { if (process.env.P3_PIN_RANDOM !== '0') Math.random = mulberry32(seedOf(file(task) + '::' + task.name)); wrapRecord(); S.cur = fresh(); const t = task; const anc: string[] = []; let s = t.suite; while (s && s.type !== 'file' && s.name) { anc.unshift(s.name); s = s.suite; } S.name = { file: file(t), anc, title: t.name }; });
afterEach(() => { if (S.cur) flush(S.name, S.cur); S.cur = null; });
afterAll(() => { const b = S.outside; if (b.rb.length || b.wg.length || b.rec.length) flush({ file: S.name?.file ?? '?', anc: [], title: '__outside_tests__' }, b); S.outside = fresh(); });
