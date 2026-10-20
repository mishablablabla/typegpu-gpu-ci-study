export const fround = Math.fround;
export const f16round = (Math as any).f16round as (x: number) => number;

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

export function nextUp32(x: number): number {
  if (Number.isNaN(x) || x === Infinity) return x;
  if (x === 0) return 2 ** -149;
  f32[0] = x;
  u32[0] = x > 0 ? u32[0]! + 1 : u32[0]! - 1;
  return f32[0]!;
}
export const nextDown32 = (x: number) => -nextUp32(-x);

export function ulp32(x: number): number {
  const ax = Math.abs(x);
  if (ax >= 3.4028234663852886e38) return 2 ** 104;
  if (ax === 0) return 2 ** -149;
  const r = fround(ax);
  if (r === ax) return Math.min(nextUp32(ax) - ax, ax - nextDown32(ax));
  return r < ax ? nextUp32(r) - r : r - nextDown32(r);
}

export const MIN_NORMAL_F32 = 2 ** -126;
export const isSubnormal32 = (x: number) => x !== 0 && Math.abs(x) < MIN_NORMAL_F32;
export const flushSub32 = (x: number) => (isSubnormal32(x) ? (x < 0 ? -0 : 0) : x);

export const i32 = (x: number) => x | 0;
export const u32w = (x: number) => x >>> 0;

export function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 0x100000000);
}
export function uniform(n: number, lo: number, hi: number, seed: number, round: (x: number) => number = fround): number[] {
  const r = lcg(seed);
  return Array.from({ length: n }, () => round(lo + (hi - lo) * r()));
}
export function uniformInt(n: number, lo: number, hi: number, seed: number): number[] {
  const r = lcg(seed);
  return Array.from({ length: n }, () => Math.floor(lo + (hi - lo + 1) * r()));
}

export const fmt = (x: number): string =>
  Object.is(x, -0) ? '-0' : Number.isNaN(x) ? 'NaN' : !Number.isFinite(x) ? (x > 0 ? '+Inf' : '-Inf')
  : Number.isInteger(x) && Math.abs(x) < 2 ** 53 ? String(x) : x.toPrecision(9);
