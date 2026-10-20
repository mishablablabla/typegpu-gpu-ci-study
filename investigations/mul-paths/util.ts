import { d, tgpu } from 'typegpu';
import { root } from '../../harness.ts';

export type Any = any;

export interface Kind { name: string; schema: Any; elem: 'f32' | 'i32' | 'u32'; rows: number; cols: number; mat: boolean; vec: boolean }
const ELEM: Record<string, 'f32' | 'i32' | 'u32'> = { f: 'f32', i: 'i32', u: 'u32' };
export function kind(name: string): Kind {
  if (name === 'f32' || name === 'i32' || name === 'u32')
    return { name, schema: (d as Any)[name], elem: name, rows: 1, cols: 1, mat: false, vec: false };
  const v = /^vec([234])([fiu])$/.exec(name);
  if (v) return { name, schema: (d as Any)[name], elem: ELEM[v[2]!]!, rows: Number(v[1]), cols: 1, mat: false, vec: true };
  const m = /^mat([234])x\1f$/.exec(name);
  if (m) return { name, schema: (d as Any)[name], elem: 'f32', rows: Number(m[1]), cols: Number(m[1]), mat: true, vec: false };
  throw new Error(`bad kind ${name}`);
}
export type Logical = number | number[] | number[][];

const colStride = (rows: number) => (rows === 3 ? 4 : rows);
export const sizeWords = (k: Kind) => (k.mat ? k.cols * colStride(k.rows) : k.vec ? k.rows : 1);

export function encode(k: Kind, v: Logical, words = new Uint32Array(sizeWords(k))): Uint32Array {
  const f = new Float32Array(words.buffer, words.byteOffset, words.length), i = new Int32Array(words.buffer, words.byteOffset, words.length);
  const put = (idx: number, x: number) => { if (k.elem === 'f32') f[idx] = x; else if (k.elem === 'i32') i[idx] = x; else words[idx] = x; };
  if (k.mat) (v as number[][]).forEach((col, c) => col.forEach((x, r) => put(c * colStride(k.rows) + r, x)));
  else if (k.vec) (v as number[]).forEach((x, r) => put(r, x));
  else put(0, v as number);
  return words;
}
export function decode(k: Kind, words: Uint32Array): Logical {
  const f = new Float32Array(words.buffer, words.byteOffset, words.length), i = new Int32Array(words.buffer, words.byteOffset, words.length);
  const get = (idx: number) => (k.elem === 'f32' ? f[idx]! : k.elem === 'i32' ? i[idx]! : words[idx]!);
  if (k.mat) return Array.from({ length: k.cols }, (_, c) => Array.from({ length: k.rows }, (_, r) => get(c * colStride(k.rows) + r)));
  if (k.vec) return Array.from({ length: k.rows }, (_, r) => get(r));
  return get(0);
}
export function toTgpu(k: Kind, v: Logical): Any {
  if (k.mat) return (k.schema as Any)(...(v as number[][]).flat());
  if (k.vec) return (k.schema as Any)(...(v as number[]));
  return v;
}
export function fromTgpu(k: Kind, v: Any): Logical {
  if (k.mat) return (v.columns as Any[]).map((c) => Array.from(c as number[]));
  if (k.vec) return Array.from(v as number[]);
  return Number(v);
}

const dev = () => root.device as Any;
export async function readRawBuffer(buf: Any, words: number): Promise<Uint32Array> {
  const src = (root as Any).unwrap(buf) as GPUBuffer;
  const stg = dev().createBuffer({ size: src.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = dev().createCommandEncoder(); enc.copyBufferToBuffer(src, 0, stg, 0, src.size); dev().queue.submit([enc.finish()]);
  await stg.mapAsync(GPUMapMode.READ);
  const out = new Uint32Array(stg.getMappedRange().slice(0)).slice(0, words); stg.unmap(); stg.destroy();
  return out;
}
export interface In { k: Kind; v: Logical }
export async function gpuEval(fn: Any, ins: In[], outK: Kind): Promise<{ value: Logical; raw: Uint32Array; wgsl: string }> {
  const bufs = ins.map(({ k, v }) => { const b: Any = root.createMutable(k.schema); dev().queue.writeBuffer((root as Any).unwrap(b), 0, encode(k, v)); return b; });
  const out: Any = root.createMutable(outK.schema);
  const [a, b, c] = bufs;
  try {
    const body = ins.length === 1 ? () => { 'use gpu'; out.$ = fn(a.$); }
      : ins.length === 2 ? () => { 'use gpu'; out.$ = fn(a.$, b.$); }
      : () => { 'use gpu'; out.$ = fn(a.$, b.$, c.$); };
    const wgsl = wgslOf(body);
    dev().pushErrorScope('validation');
    const p = root.createGuardedComputePipeline(body);
    p.dispatchThreads(1);
    const verr = await dev().popErrorScope();
    if (verr) throw new Error(`VALIDATION: ${String(verr.message).split('\n')[0]}`);
    const raw = await readRawBuffer(out, sizeWords(outK));
    return { value: decode(outK, raw), raw, wgsl };
  } finally { for (const x of [...bufs, out]) x.buffer.destroy(); }
}
export function wgslOf(body: Any): string {
  try { return tgpu.resolve([body]).replace(/\s+/g, ' '); } catch (e) { return `resolve error: ${errText(e)}`; }
}
export function errText(e: unknown): string {
  const m = (e as Error).message ?? String(e);
  return m.split('\n').map((l) => l.trim()).filter(Boolean).join(' | ');
}
export function cpuEval(fn: Any, ins: In[], outK: Kind): { value?: Logical; error?: string } {
  try { return { value: fromTgpu(outK, fn(...ins.map(({ k, v }) => toTgpu(k, v)))) }; }
  catch (e) { return { error: errText(e) }; }
}
export async function gpuEvalSafe(fn: Any, ins: In[], outK: Kind) {
  try { return { ...(await gpuEval(fn, ins, outK)), error: undefined as string | undefined }; }
  catch (e) { return { value: undefined, raw: undefined, wgsl: undefined, error: errText(e) }; }
}

export const U = 2 ** -24;
export const gamma = (n: number) => (n * U) / (1 - n * U);
export interface Dot { exact: number; absSum: number; n: number }
export const dotOracle = (xs: number[], ys: number[]): Dot => ({
  exact: xs.reduce((s, x, i) => s + x * ys[i]!, 0), absSum: xs.reduce((s, x, i) => s + Math.abs(x * ys[i]!), 0), n: xs.length,
});
export const withinDot = (got: number, o: Dot) => Math.abs(got - o.exact) <= gamma(o.n) * o.absSum + 0 && Number.isFinite(got);
