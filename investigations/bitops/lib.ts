import { d, tgpu } from 'typegpu';
import { root } from '../../harness.ts';

export type Any = any;
export const INT_MAX = 2147483647;
export const INT_MIN = -2147483648;
export const UINT_MAX = 4294967295;

export type Elem = 'i32' | 'u32' | 'f32';
export interface TD { name: string; lanes: number; elem: Elem; schema: Any }
export const td = (name: string): TD => ({
  name,
  lanes: name.startsWith('vec') ? Number(name[3]) : 1,
  elem: name.endsWith('u') || name === 'u32' ? 'u32' : name.endsWith('f') || name === 'f32' ? 'f32' : 'i32',
  schema: (d as Any)[name],
});
export const SCALAR_AND_VEC = (e: 'i' | 'u') => [e === 'i' ? 'i32' : 'u32', `vec2${e}`, `vec3${e}`, `vec4${e}`];
export const INT_TYPE_NAMES = [...SCALAR_AND_VEC('i'), ...SCALAR_AND_VEC('u')];
export const strideOf = (t: TD) => (t.lanes === 3 ? 4 : t.lanes);
const ArrOf = (e: Elem) => (e === 'i32' ? Int32Array : e === 'u32' ? Uint32Array : Float32Array);

export const bits = (x: number): bigint => BigInt.asUintN(32, BigInt(x));
export const wrap = (elem: Elem, x: bigint): number => Number(elem === 'i32' ? BigInt.asIntN(32, x) : BigInt.asUintN(32, x));
const bitLen = (u: bigint): number => (u === 0n ? 0 : u.toString(2).length);

export const O = {
  countOneBits: (e: Elem, [a]: number[]) => [...bits(a!).toString(2)].filter((c) => c === '1').length,
  reverseBits: (e: Elem, [a]: number[]) => wrap(e, BigInt('0b' + bits(a!).toString(2).padStart(32, '0').split('').reverse().join(''))),
  countLeadingZeros: (_e: Elem, [a]: number[]) => 32 - bitLen(bits(a!)),
  countTrailingZeros: (_e: Elem, [a]: number[]) => {
    const u = bits(a!);
    if (u === 0n) return 32;
    let n = 0; while (((u >> BigInt(n)) & 1n) === 0n) n++;
    return n;
  },
  firstLeadingBit: (e: Elem, [a]: number[]) => {
    const u = bits(a!);
    if (e === 'u32') return u === 0n ? wrap(e, -1n) : bitLen(u) - 1;
    if (u === 0n || u === 0xffffffffn) return -1;
    const neg = (u >> 31n) === 1n;
    const m = neg ? BigInt.asUintN(32, ~u) : u;
    return bitLen(m) - 1;
  },
  firstTrailingBit: (e: Elem, [a]: number[]) => {
    const u = bits(a!);
    if (u === 0n) return wrap(e, -1n);
    return O.countTrailingZeros(e, [a!]);
  },
  extractBits: (e: Elem, [a, off, cnt]: number[]) => {
    const o = Math.min(off!, 32), c = Math.min(cnt!, 32 - o);
    if (c === 0) return 0;
    const field = (bits(a!) >> BigInt(o)) & ((1n << BigInt(c)) - 1n);
    return e === 'i32' ? Number(BigInt.asIntN(c, field)) : Number(field);
  },
  insertBits: (e: Elem, [a, nb, off, cnt]: number[]) => {
    const o = Math.min(off!, 32), c = Math.min(cnt!, 32 - o);
    if (c === 0) return a!;
    const mask = ((1n << BigInt(c)) - 1n) << BigInt(o);
    return wrap(e, (bits(a!) & ~mask & 0xffffffffn) | ((bits(nb!) << BigInt(o)) & mask));
  },
  shl: (e: Elem, [a, s]: number[]) => wrap(e, bits(a!) << BigInt(s! % 32)),
  shr: (e: Elem, [a, s]: number[]) =>
    e === 'i32' ? Number(BigInt.asIntN(32, BigInt(a!)) >> BigInt(s! % 32)) : Number(bits(a!) >> BigInt(s! % 32)),
  ushr: (e: Elem, [a, s]: number[]) => Number(bits(a!) >> BigInt(s! % 32)),
  and: (e: Elem, [a, b]: number[]) => wrap(e, bits(a!) & bits(b!)),
  or: (e: Elem, [a, b]: number[]) => wrap(e, bits(a!) | bits(b!)),
  xor: (e: Elem, [a, b]: number[]) => wrap(e, bits(a!) ^ bits(b!)),
  not: (e: Elem, [a]: number[]) => wrap(e, ~bits(a!)),
  abs: (e: Elem, [a]: number[]) => (e === 'u32' || a! >= 0 ? a! : a === INT_MIN ? INT_MIN : -a!),
  sign: (_e: Elem, [a]: number[]) => Math.sign(a!),
  clamp: (_e: Elem, [a, lo, hi]: number[]) => Math.min(Math.max(a!, lo!), hi!),
  min: (_e: Elem, [a, b]: number[]) => Math.min(a!, b!),
  max: (_e: Elem, [a, b]: number[]) => Math.max(a!, b!),
  select: (_e: Elem, [f, t, c]: number[]) => (c !== 0 ? t! : f!),
};

const pow2 = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => 2 ** (from + i));
export const I32_VALUES = [
  0, 1, -1, 2, -2, 3, -3, 7, -7, 255, 256, 32767, 32768, 65535, 65536, -65536, 0x55555555, -0x55555556 , 0x0f0f0f0f,
  INT_MAX, INT_MIN, INT_MIN + 1, INT_MAX - 1, 1 << 30, -(1 << 30), 2 ** 24, -(2 ** 24), 0x12345678, -0x12345678, 1 << 15, 1 << 16,
];
export const U32_VALUES = [
  0, 1, 2, 3, 7, 255, 256, 65535, 65536, 0x55555555, 0xaaaaaaaa, 0xf0f0f0f0, 0xdeadbeef, 0x0f0f0f0f, UINT_MAX, UINT_MAX - 1,
  2147483648, 2147483647, 2147483649, 2 ** 24, 0x12345678, ...pow2(4, 5),
];
export const SHIFT_AMOUNTS = [0, 1, 2, 7, 15, 16, 30, 31, 32, 33, 63, 64, UINT_MAX];
export const SHIFT_VALUES_I = [0, 1, -1, 2, INT_MAX, INT_MIN, 0x12345678, -0x12345678, 1 << 30, -(1 << 30), 0x55555555, 3];
export const SHIFT_VALUES_U = [0, 1, 2, 3, UINT_MAX, 2147483648, 2147483649, 0x12345678, 0xdeadbeef, 1 << 30, 0x55555555, 0x80000001];
export const valuesOf = (elem: Elem) => (elem === 'i32' ? I32_VALUES : U32_VALUES);
export const OFFSETS = [0, 1, 5, 16, 31, 32, 33, UINT_MAX];
export const COUNTS = [0, 1, 2, 5, 16, 31, 32, 33];

export function crossCases(lists: number[][], lanes: number, cap = 4000): number[][][] {
  const total = lists.reduce((p, l) => p * l.length, 1);
  const out: number[][][] = [];
  const step = Math.max(1, Math.ceil(total / cap));
  for (let idx = 0; idx < total; idx += step) {
    const lane = (l: number) => {
      let r = (idx + l * 7919) % total; const picks: number[] = [];
      for (let a = lists.length - 1; a >= 0; a--) { picks[a] = lists[a]![r % lists[a]!.length]!; r = Math.floor(r / lists[a]!.length); }
      return picks;
    };
    const perLane = Array.from({ length: lanes }, (_, l) => lane(l));
    out.push(lists.map((_, a) => perLane.map((p) => p[a]!)));
  }
  return out;
}

function pack(t: TD, rows: number[][]) {
  const Arr = ArrOf(t.elem), stride = strideOf(t), arr = new Arr(rows.length * stride);
  rows.forEach((r, i) => r.forEach((v, k) => { arr[i * stride + k] = v; }));
  return arr;
}
export const shapeCases = (cases: number[][][], argTs: TD[]) => cases.map((c) => c.map((a, i) => (argTs[i]!.lanes === 1 ? [a[0]!] : a)));
export async function gpuMap(fn: Any, argTs: TD[], cases: number[][][], outT: TD): Promise<number[][]> {
  const dev = root.device as Any, n = cases.length;
  const bufs = argTs.map((t, a) => {
    const b: Any = root.createMutable(d.arrayOf(t.schema, n));
    dev.queue.writeBuffer((root as Any).unwrap(b), 0, pack(t, cases.map((c) => c[a]!)));
    return b;
  });
  const out: Any = root.createMutable(d.arrayOf(outT.schema, n));
  const [x, y, z, w] = bufs;
  try {
    const pipe =
      argTs.length === 1 ? root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(x.$[i]); })
      : argTs.length === 2 ? root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(x.$[i], y.$[i]); })
      : argTs.length === 3 ? root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(x.$[i], y.$[i], z.$[i]); })
      : root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(x.$[i], y.$[i], z.$[i], w.$[i]); });
    pipe.dispatchThreads(n);
    const src = (root as Any).unwrap(out) as GPUBuffer;
    const stg = dev.createBuffer({ size: src.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = dev.createCommandEncoder(); enc.copyBufferToBuffer(src, 0, stg, 0, src.size); dev.queue.submit([enc.finish()]);
    await stg.mapAsync(GPUMapMode.READ);
    const arr = new (ArrOf(outT.elem))(stg.getMappedRange().slice(0)); stg.unmap(); stg.destroy();
    return Array.from({ length: n }, (_, i) => Array.from({ length: outT.lanes }, (_, k) => arr[i * strideOf(outT) + k]!));
  } finally { for (const b of [...bufs, out]) b.buffer.destroy(); }
}

export const make = (t: TD, lanes: number[]) => (t.lanes === 1 ? (t.schema as Any)(lanes[0]!) : (d as Any)[t.name](...lanes));
export interface CpuRes { lanes?: number[]; threw?: string; kind?: string; jsType?: string }
export function cpuMap(fn: Any, argTs: TD[], cases: number[][][], outLanes: number): CpuRes[] {
  return cases.map((c) => {
    try {
      const v = fn(...argTs.map((t, a) => make(t, c[a]!)));
      if (typeof v === 'number') return { lanes: [v], jsType: 'number' };
      if (typeof v === 'boolean') return { lanes: [Number(v)], jsType: 'boolean' };
      if (v && typeof v === 'object' && 'length' in v) return { lanes: Array.from(v as ArrayLike<number>).slice(0, outLanes), kind: (v as Any).kind, jsType: 'vec' };
      return { threw: `unexpected result ${String(v)}`, jsType: typeof v };
    } catch (e) { return { threw: (e as Error).message.split('\n')[0]!, jsType: 'throw' }; }
  });
}
export const inRange = (e: Elem, v: number) => (e === 'i32' ? Number.isInteger(v) && v >= INT_MIN && v <= INT_MAX : e === 'u32' ? Number.isInteger(v) && v >= 0 && v <= UINT_MAX : true);

const dev = () => root.device as Any;
export async function dawnError(wgsl: string, entryCall?: string): Promise<string | undefined> {
  const names = [...wgsl.matchAll(/fn ([A-Za-z_0-9]+)\(\)/g)].map((m) => m[1]);
  const call = entryCall ?? `${names[names.length - 1]}()`;
  const pre = /\bf16\b|\bvec[234]h\b/.test(wgsl) && !/enable f16/.test(wgsl) ? 'enable f16;\n' : '';
  const code = `${pre}${wgsl}\n@compute @workgroup_size(1) fn entry_point_x() { _ = ${call}; }`;
  const m = dev().createShaderModule({ code });
  const info = await m.getCompilationInfo();
  const errs = info.messages.filter((x: Any) => x.type === 'error').map((x: Any) => String(x.message).split('\n')[0]);
  return errs[0];
}
export function resolveOrError(f: () => unknown): { wgsl?: string; error?: string } {
  try { return { wgsl: tgpu.resolve([f as Any]) }; } catch (e) { return { error: String((e as Error).message).split('\n').filter((l) => l.trim()).slice(-1)[0] }; }
}
export const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface Mismatch { args: number[][]; got: number[]; want: number[] }
export function compare(
  cases: number[][][], got: (number[] | undefined)[], oracle: (lanesArgs: number[]) => number, outLanes: number, skip?: (args: number[]) => boolean,
) {
  let checked = 0, unverified = 0; const bad: Mismatch[] = [];
  cases.forEach((c, i) => {
    const g = got[i];
    if (!g) return;
    for (let l = 0; l < outLanes; l++) {
      const lane = (k: number) => c.map((a) => (a.length === 1 ? a[0]! : a[k]!));
      const args = lane(l);
      if (skip?.(args)) { unverified++; continue; }
      checked++;
      const want = oracle(args);
      if (g[l] !== want) bad.push({ args: c.map((a) => a.slice()), got: g, want: Array.from({ length: outLanes }, (_, k) => oracle(lane(k))) });
    }
  });
  return { checked, unverified, mismatches: bad.length, first: bad.slice(0, 3) };
}
