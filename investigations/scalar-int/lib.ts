import { d, tgpu } from 'typegpu';
import { root } from '../../harness.ts';

export type Any = any;

export const MAX = 2147483647, MIN = -2147483648, UMAX = 4294967295;
export type K = 'i32' | 'u32' | 'f32';
export const schemaOf = (k: K): Any => (k === 'i32' ? d.i32 : k === 'u32' ? d.u32 : d.f32);
const Arr = { i32: Int32Array, u32: Uint32Array, f32: Float32Array } as const;

export const wrapI = (x: bigint) => Number(BigInt.asIntN(32, x));
export const wrapU = (x: bigint) => Number(BigInt.asUintN(32, x));
export const wrapK = (k: K, x: bigint) => (k === 'i32' ? wrapI(x) : wrapU(x));
const IMIN = -(2n ** 31n);
export const wgslDiv = (k: K, a: bigint, b: bigint): bigint => (b === 0n ? a : k === 'i32' && a === IMIN && b === -1n ? a : a / b);
export const wgslRem = (k: K, a: bigint, b: bigint): bigint => (b === 0n ? 0n : k === 'i32' && a === IMIN && b === -1n ? 0n : a % b);

const f32buf = new Float32Array(1), u32view = new Uint32Array(f32buf.buffer);
export const f32bits = (x: number) => { f32buf[0] = x; return u32view[0]!; };
export const bitsF32 = (b: number) => { u32view[0] = b >>> 0; return f32buf[0]!; };
export function f32Candidates(a: number): [number, number] {
  const n = Math.fround(a);
  if (n === a) return [n, n];
  const nextUp = (x: number) => bitsF32(x >= 0 ? f32bits(x) + 1 : f32bits(x) - 1);
  return n < a ? [n, nextUp(n)] : [bitsF32(n >= 0 ? f32bits(n) - 1 : f32bits(n) + 1), n];
}
export const ulp32 = (x: number) => { const a = Math.abs(x); if (a === 0) return 2 ** -149; const e = Math.max(Math.floor(Math.log2(a)), -126); return 2 ** (e - 23); };

export function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function randBand(r: () => number, bits: number, signed: boolean): number {
  if (bits <= 0) return 0;
  const lo = 2 ** (bits - 1), hi = 2 ** bits;
  const mag = Math.floor(lo + r() * (hi - lo));
  if (!signed) return Math.min(mag, UMAX);
  const v = r() < 0.5 ? -mag : mag;
  return Math.max(MIN, Math.min(MAX, v));
}

const dev = () => root.device as Any;
export interface GpuIn { k: K; values: number[] }
export async function gpuMap(fn: Any, ins: GpuIn[], outK: K): Promise<{ out: number[] } | { error: string; wgsl?: string }> {
  const n = ins[0]!.values.length;
  const bufs = ins.map(({ k, values }) => {
    const b: Any = root.createMutable(d.arrayOf(schemaOf(k), n));
    dev().queue.writeBuffer((root as Any).unwrap(b), 0, new (Arr[k] as Any)(values));
    return b;
  });
  const out: Any = root.createMutable(d.arrayOf(schemaOf(outK), n));
  const [x, y, z] = bufs;
  try {
    const mk = () => ins.length === 1
      ? root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(x.$[i]); })
      : ins.length === 2
        ? root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(x.$[i], y.$[i]); })
        : root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(x.$[i], y.$[i], z.$[i]); });
    dev().pushErrorScope('validation');
    const p = mk();
    p.dispatchThreads(n);
    const err = await dev().popErrorScope();
    if (err) return { error: String(err.message).split('\n')[0]! };
    return { out: await readBuf(out, n, outK) };
  } catch (e) { return { error: (e as Error).message.split('\n')[0]! }; }
  finally { for (const b of [...bufs, out]) b.buffer.destroy(); }
}

export async function readBuf(buf: Any, n: number, k: K): Promise<number[]> {
  const src = (root as Any).unwrap(buf) as GPUBuffer;
  const stg = dev().createBuffer({ size: src.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = dev().createCommandEncoder(); enc.copyBufferToBuffer(src, 0, stg, 0, src.size); dev().queue.submit([enc.finish()]);
  await stg.mapAsync(GPUMapMode.READ);
  const arr = new (Arr[k] as Any)(stg.getMappedRange().slice(0)); stg.unmap(); stg.destroy();
  return Array.from(arr.slice(0, n)) as number[];
}

export function fnWgsl(fn: Any, ins: K[], outK: K): string {
  try { return tgpu.resolve([(tgpu.fn as Any)(ins.map(schemaOf), schemaOf(outK))(fn)]).replace(/\s+/g, ' '); }
  catch (e) { return `resolve error: ${(e as Error).message.split('\n').slice(0, 3).join(' | ')}`; }
}

export function cpuMap(fn: Any, ins: GpuIn[]): (number | string)[] {
  const n = ins[0]!.values.length;
  return Array.from({ length: n }, (_, i) => {
    try {
      const args = ins.map(({ k, values }) => values[i]!);
      const v = fn(...args);
      return typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : `non-number: ${String(v)}`;
    } catch (e) { return `threw: ${(e as Error).message.split('\n')[0]}`; }
  });
}

export function storedAs(k: K, v: number): number {
  if (k === 'f32') return Math.fround(v);
  if (!Number.isFinite(v)) return 0;
  return k === 'i32' ? (Math.trunc(v) | 0) : Math.trunc(v) >>> 0;
}
export const inRange = (k: K, v: number) => k === 'f32' || (Number.isInteger(v) && (k === 'i32' ? v >= MIN && v <= MAX : v >= 0 && v <= UMAX));

export interface ConstRun { wgsl: string; rejected: string | null; value: number | null; folded: boolean }
export async function constRun(body: () => Any, outK: K): Promise<ConstRun> {
  const out: Any = root.createMutable(schemaOf(outK));
  try {
    const wrapper = () => { 'use gpu'; out.$ = body(); };
    let wgsl = '';
    try { wgsl = tgpu.resolve([wrapper as Any]).replace(/\s+/g, ' '); } catch (e) { return { wgsl: `resolve error: ${(e as Error).message.split('\n').slice(0, 4).join(' | ')}`, rejected: 'TypeGPU resolve error', value: null, folded: false }; }
    const m = /fn item\(\) -> (\S+) \{ return ([^;]*); \}/.exec(wgsl);
    const line = m ? `${m[2]}` : wgsl; const retT = m?.[1] ?? '?';
    dev().pushErrorScope('validation');
    root.createGuardedComputePipeline(() => { 'use gpu'; out.$ = body(); }).dispatchThreads(1);
    const err = await dev().popErrorScope();
    if (err) return { wgsl: `${retT}: ${line}`, rejected: String(err.message).split('\n')[0]!.replace(/^Error while parsing WGSL: /, ''), value: null, folded: /^-?[\d.]+[iuf]?$/.test(line.trim()) };
    const v = (await readBuf(out, 1, outK))[0]!;
    return { wgsl: `${retT}: ${line}`, rejected: null, value: v, folded: /^-?[\d.]+(e[+-]?\d+)?[iuf]?$/.test(line.trim()) };
  } catch (e) { return { wgsl: '', rejected: (e as Error).message.split('\n')[0]!, value: null, folded: false }; }
  finally { out.buffer.destroy(); }
}
