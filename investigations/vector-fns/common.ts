import { d } from 'typegpu';
import { root } from '../../harness.ts';

export type Any = any;
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
export const fr = Math.fround;
export const bitsOf = (x: number) => { f32[0] = x; return u32[0]!; };
export const fromBits = (b: number) => { u32[0] = b >>> 0; return f32[0]!; };
export const hex = (x: number) => '0x' + bitsOf(x).toString(16).padStart(8, '0');
const ordered = (x: number) => { const b = bitsOf(x); return b & 0x80000000 ? -(b & 0x7fffffff) : b; };
export const MIN_NORMAL = 2 ** -126;
export const isSub = (x: number) => x !== 0 && Math.abs(x) < MIN_NORMAL;
export function ulpDist(a: number, b: number): number | 'nan' | 'inf' {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b) ? 0 : 'nan';
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b ? 0 : 'inf';
  if (Math.abs(a) < MIN_NORMAL && Math.abs(b) < MIN_NORMAL) return 0;
  return Math.abs(ordered(a) - ordered(b));
}
export const sameBits = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || bitsOf(a) === bitsOf(b);
export const sameValue = (a: number, b: number) => ulpDist(a, b) === 0;

export function big149(x: number): bigint {
  const b = bitsOf(x), e = (b >>> 23) & 0xff, frac = b & 0x7fffff, s = b >>> 31 ? -1n : 1n;
  if (e === 0xff) throw new Error('non-finite');
  return s * (e === 0 ? BigInt(frac) : BigInt(frac | 0x800000) << BigInt(e - 1));
}
const TWO298 = 2 ** 298;
export const fromBig298 = (s: bigint) => Number(s) / TWO298;
export const exactDot = (a: number[], b: number[]) => fromBig298(a.reduce((s, _, i) => s + big149(a[i]!) * big149(b[i]!), 0n));
export const exactCross = (a: number[], b: number[]) => {
  const A = a.map(big149), B = b.map(big149);
  return [fromBig298(A[1]! * B[2]! - A[2]! * B[1]!), fromBig298(A[2]! * B[0]! - A[0]! * B[2]!), fromBig298(A[0]! * B[1]! - A[1]! * B[0]!)];
};
export function roundHalfEven(x: number): number {
  if (!Number.isFinite(x) || Math.abs(x) >= 2 ** 52) return x;
  const fl = Math.floor(x), diff = x - fl;
  const r = diff < 0.5 ? fl : diff > 0.5 ? fl + 1 : fl % 2 === 0 ? fl : fl + 1;
  return r === 0 && (x < 0 || Object.is(x, -0)) ? -0 : r;
}

export type Shape = 'V' | 'S';
export const schemaFor = (dim: number): Any => (dim === 0 ? d.f32 : dim === 2 ? d.vec2f : dim === 3 ? d.vec3f : d.vec4f);
export const strideOf = (dim: number) => (dim === 0 ? 1 : dim === 3 ? 4 : dim);
export const lanesOf = (dim: number) => Math.max(1, dim);
const dev = () => root.device as Any;

export function packF32(dim: number, rows: number[][]): Float32Array {
  const stride = strideOf(dim), arr = new Float32Array(rows.length * stride);
  rows.forEach((r, i) => r.forEach((v, k) => { arr[i * stride + k] = v; }));
  return arr;
}
export async function gpuBatch(fn: Any, argDims: number[], outDim: number, argRows: number[][][]): Promise<number[][]> {
  const n = argRows[0]!.length;
  const ins = argDims.map((dm, j) => {
    const b: Any = root.createMutable(d.arrayOf(schemaFor(dm), n));
    dev().queue.writeBuffer((root as Any).unwrap(b), 0, packF32(dm, argRows[j]!));
    return b;
  });
  const out: Any = root.createMutable(d.arrayOf(schemaFor(outDim), n));
  const [x, y, z] = ins;
  try {
    (ins.length === 1
      ? root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(x.$[i]); })
      : ins.length === 2
        ? root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(x.$[i], y.$[i]); })
        : root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(x.$[i], y.$[i], z.$[i]); })).dispatchThreads(n);
    const src = (root as Any).unwrap(out) as GPUBuffer;
    const stg = dev().createBuffer({ size: src.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = dev().createCommandEncoder(); enc.copyBufferToBuffer(src, 0, stg, 0, src.size); dev().queue.submit([enc.finish()]);
    await stg.mapAsync(GPUMapMode.READ);
    const arr = new Float32Array(stg.getMappedRange().slice(0)); stg.unmap(); stg.destroy();
    const st = strideOf(outDim), ln = lanesOf(outDim);
    return Array.from({ length: n }, (_, i) => Array.from({ length: ln }, (_, l) => arr[i * st + l]!));
  } finally { for (const b of [...ins, out]) b.buffer.destroy(); }
}

export type CpuResult = { ok: true; lanes: number[]; raw: number[] } | { ok: false; error: string };
const mk = (dim: number, lanes: number[]) => (dim === 0 ? lanes[0]! : (dim === 2 ? d.vec2f : dim === 3 ? d.vec3f : d.vec4f)(...(lanes as [number, number, number, number])));
export function cpuEval(fn: Any, argDims: number[], outDim: number, args: number[][]): CpuResult {
  try {
    const v = fn(...args.map((a, j) => mk(argDims[j]!, a)));
    const raw = outDim === 0 ? [Number(v)] : Array.from(v as ArrayLike<number>);
    return { ok: true, raw, lanes: raw.map(fr) };
  } catch (e) { return { ok: false, error: String((e as Error).message).split('\n')[0]!.slice(0, 140) }; }
}

import { tgpu } from 'typegpu';
export interface ConstResult { wgsl: string; error?: string; lanes?: number[]; folded: boolean }
export async function constRun(value: Any, outDim: number, name: string): Promise<ConstResult> {
  const out: Any = root.createMutable(schemaFor(outDim));
  let wgsl = '';
  try {
    try { wgsl = tgpu.resolve([(() => { 'use gpu'; out.$ = value(); }) as Any]).replace(/\s+/g, ' '); }
    catch (e) { return { wgsl: '', error: `resolve: ${String((e as Error).message).split('\n')[0]!.slice(0, 160)}`, folded: false }; }
    const folded = !new RegExp(`\\b${name}\\(`).test(wgsl.slice(wgsl.indexOf('fn ')));
    dev().pushErrorScope('validation');
    root.createGuardedComputePipeline(() => { 'use gpu'; out.$ = value(); }).dispatchThreads(1);
    const err = await dev().popErrorScope();
    if (err) return { wgsl, folded, error: `pipeline: ${String(err.message).split('\n').slice(0, 3).join(' ').slice(0, 220)}` };
    const src = (root as Any).unwrap(out) as GPUBuffer;
    const stg = dev().createBuffer({ size: src.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = dev().createCommandEncoder(); enc.copyBufferToBuffer(src, 0, stg, 0, src.size); dev().queue.submit([enc.finish()]);
    await stg.mapAsync(GPUMapMode.READ);
    const arr = new Float32Array(stg.getMappedRange().slice(0)); stg.unmap(); stg.destroy();
    return { wgsl, folded, lanes: Array.from({ length: lanesOf(outDim) }, (_, l) => arr[l]!) };
  } catch (e) { return { wgsl, folded: false, error: `exception: ${String((e as Error).message).split('\n')[0]!.slice(0, 160)}` }; }
  finally { out.buffer.destroy(); }
}
export const constArgs = (shapes: Shape[], dim: number, args: number[][]) =>
  args.map((a, j) => (shapes[j] === 'S' || dim === 0 ? a[0]! : (dim === 2 ? d.vec2f : dim === 3 ? d.vec3f : d.vec4f)(...(a as [number, number, number, number])))) as Any[];
