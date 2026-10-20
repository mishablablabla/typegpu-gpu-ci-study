import { exactCross, exactDot, fr, roundHalfEven, type Any, type Shape } from './common.ts';

export type Tier = { k: 'exact' } | { k: 'ulp'; max: number; why: string } | { k: 'abs'; max: number; why: string } | { k: 'obs' } | { k: 'ood'; why: string };
export interface FnSpec {
  name: string;
  body?: string;
  shapes: Shape[];
  out: Shape;
  dims: number[];
  list?: 'edge' | number[];
  lane?: (a: number[]) => number;
  row?: (a: number[][]) => number[];
  tierLane?: (a: number[]) => Tier;
  tierRow?: (a: number[][]) => Tier | Tier[];
  note?: string;
}
const EX: Tier = { k: 'exact' }, OBS: Tier = { k: 'obs' };
const finite = (...v: number[]) => v.every(Number.isFinite);
const smallInt = (...v: number[][]) => v.every((l) => l.every((x) => Number.isInteger(x) && Math.abs(x) <= 1000));
const FMAX = 3.4028234663852886e38;
const U = 2 ** -24;
export const ordinary = (...v: number[][]) => v.every((l) => l.every((x) => x === 0 || (Math.abs(x) >= 2 ** -30 && Math.abs(x) <= 2 ** 30)));
const derived = (max: number, why: string): Tier => ({ k: 'abs', max, why: `derived: ${why}` });

const lane = (name: string, lane: (a: number[]) => number, extra: Partial<FnSpec> = {}): FnSpec => ({ name, shapes: ['V'], out: 'V', dims: [0, 2, 3, 4], lane, ...extra });
const mixTier = ([a, b, t]: number[]): Tier =>
  (t === 0 || t === 1 || (a === b && t === 0.5)) && finite(a!, b!) ? EX
    : ordinary([a!, b!, t!]) && Math.abs(t!) <= 4 ? derived(5 * U * (Math.abs(a!) * Math.abs(1 - t!) + Math.abs(b!) * Math.abs(t!)), 'mix inherited from x*(1-z)+y*z: <= ~4u(|x||1-z|+|y||z|)') : OBS;
const sat = (x: number) => Math.min(Math.max(0, x), 1);

export const SPECS: FnSpec[] = [
  lane('abs', (a) => Math.abs(a[0]!), { tierLane: () => EX }),
  lane('floor', (a) => Math.floor(a[0]!), { tierLane: () => EX }),
  lane('ceil', (a) => Math.ceil(a[0]!), { tierLane: () => EX }),
  lane('trunc', (a) => Math.trunc(a[0]!), { tierLane: () => EX }),
  lane('round', (a) => roundHalfEven(a[0]!), { tierLane: () => EX, note: 'WGSL round: ties to even' }),
  lane('sign', (a) => Math.sign(a[0]!), { tierLane: () => EX }),
  lane('fract', (a) => a[0]! - Math.floor(a[0]!), { tierLane: () => EX }),
  lane('saturate', (a) => sat(a[0]!), { tierLane: () => EX }),
  { name: 'step', shapes: ['V', 'V'], out: 'V', dims: [0, 2, 3, 4], lane: (a) => (a[0]! <= a[1]! ? 1 : 0), tierLane: () => EX },
  { name: 'clamp', shapes: ['V', 'V', 'V'], out: 'V', dims: [0, 2, 3, 4], lane: (a) => Math.min(Math.max(a[0]!, a[1]!), a[2]!),
    tierLane: (a) => (a[1]! > a[2]! ? { k: 'ood', why: 'low > high: WGSL allows min(max(e,low),high) OR median-of-3; shader-creation error for const-expressions' } : EX) },
  { name: 'select', body: 'selectV', shapes: ['V', 'V', 'V'], out: 'V', dims: [2, 3, 4], lane: (a) => (a[2]! > a[0]! ? a[1]! : a[0]!), tierLane: () => EX, note: 'select(a, b, c > a)' },
  { name: 'select', body: 'selectS', shapes: ['V', 'V', 'V'], out: 'V', dims: [0], lane: (a) => (a[2]! > a[0]! ? a[1]! : a[0]!), tierLane: () => EX, note: 'select(a, b, c > a)' },
  lane('atan', (a) => Math.atan(a[0]!), { tierLane: () => ({ k: 'ulp', max: 4096, why: 'WGSL: atan 4096 ULP' }), list: 'edge' }),
  lane('asin', (a) => Math.asin(a[0]!), { list: [-1, -0.9999999, -0.75, -0.5, -0.1, -1e-30, 0, -0, 1e-30, 0.1, 0.25, 0.5, 0.7071068, 0.99, 0.9999999, 1, 1.0000001, 1.5, -2, 3e38, 1e-40],
    tierLane: (a) => (Math.abs(a[0]!) > 1 ? { k: 'ood', why: '|x| > 1 outside domain' } : { k: 'abs', max: 6.81e-5, why: 'WGSL: asin: worse of abs 6.81e-5 and inherited (exceeding is inconclusive)' }) }),
  lane('acos', (a) => Math.acos(a[0]!), { list: [-1, -0.9999999, -0.75, -0.5, -0.1, -1e-30, 0, -0, 1e-30, 0.1, 0.25, 0.5, 0.7071068, 0.99, 0.9999999, 1, 1.0000001, 1.5, -2, 3e38, 1e-40],
    tierLane: (a) => (Math.abs(a[0]!) > 1 ? { k: 'ood', why: '|x| > 1 outside domain' } : { k: 'abs', max: 6.77e-5, why: 'WGSL: acos: worse of abs 6.77e-5 and inherited (exceeding is inconclusive)' }) }),
  { name: 'atan2', shapes: ['V', 'V'], out: 'V', dims: [0, 2, 3, 4], lane: (a) => Math.atan2(a[0]!, a[1]!),
    tierLane: (a) => (Math.abs(a[1]!) >= 2 ** -126 && Math.abs(a[1]!) <= 2 ** 126 && Math.abs(a[0]!) >= 2 ** -126 && Number.isFinite(a[0]!)
      ? { k: 'ulp', max: 4096, why: 'WGSL: atan2 4096 ULP for |x| in [2^-126,2^126], y finite normal' }
      : { k: 'ood', why: 'atan2 error unbounded at origin / subnormal / huge' }) },
  lane('sinh', (a) => Math.sinh(a[0]!), { list: [0, -0, 1e-30, 1e-8, 0.1, 0.5, 1, -1, 2, 5, -5, 10, 50, 80, 88, 88.7, 89, -89, 100, 1e-40],
    tierLane: ([x]) => (Math.abs(x!) < 1 ? derived(Math.cosh(x!) * (3 + 2 * Math.abs(x!)) * 2 ** -23 * 1.05 + Math.abs(Math.sinh(x!)) * 2 ** -23, 'sinh inherited from (exp(x)-exp(-x))*0.5 with exp 3+2|x| ULP: absolute bound ~cosh(x)(3+2|x|)2^-23, |x| < 1') : Math.abs(x!) >= 1 && Math.abs(x!) <= 20 ? { k: 'ulp', max: Math.ceil(1.2 * (3 + 2 * Math.abs(x!)) + 2), why: 'derived from "inherited from (exp(x)-exp(-x))*0.5", exp: 3+2|x| ULP, |x| in [1,20]' } : OBS) }),
  lane('cosh', (a) => Math.cosh(a[0]!), { list: [0, -0, 1e-30, 1e-8, 0.1, 0.5, 1, -1, 2, 5, -5, 10, 50, 80, 88, 88.7, 89, -89, 100, 1e-40],
    tierLane: ([x]) => (Math.abs(x!) <= 20 ? { k: 'ulp', max: Math.ceil(1.0 * (3 + 2 * Math.abs(x!)) + 2), why: 'derived from "inherited from (exp(x)+exp(-x))*0.5", exp: 3+2|x| ULP, |x| <= 20' } : OBS) }),
  lane('tan', (a) => Math.tan(a[0]!), { list: [0, -0, 1e-30, 1e-8, 0.1, 0.5, 1, -1, 1.2, 1.5, 1.5707963, 1.5707964, -1.5707964, 3.1415927, 2, 3, 10, 100, 1e5, 1e-40],
    tierLane: ([x]) => (Math.abs(x!) <= 1.2 ? derived(1.1 * 2 ** -11 * (1 + Math.abs(Math.tan(x!))) / Math.abs(Math.cos(x!)) + Math.abs(Math.tan(x!)) * U * 4, 'tan inherited from sin/cos (abs 2^-11 each on [-pi,pi]); |x| <= 1.2') : OBS) }),
  lane('radians', (a) => (a[0]! * Math.PI) / 180, { tierLane: () => ({ k: 'ulp', max: 2, why: 'derived: x * (f32 const) -> const rounding + product rounding <= ~2 ULP' }) }),
  lane('degrees', (a) => (a[0]! * 180) / Math.PI, { tierLane: () => ({ k: 'ulp', max: 2, why: 'derived: x * (f32 const) -> const rounding + product rounding <= ~2 ULP' }) }),
  { name: 'smoothstep', shapes: ['V', 'V', 'V'], out: 'V', dims: [0, 2, 3, 4],
    lane: (a) => { const [e0, e1, x] = a as [number, number, number]; const t = sat((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); },
    tierLane: ([e0, e1, x]) => {
      if (e0 === e1) return { k: 'ood', why: 'edge0 == edge1: indeterminate' };
      const w = Math.abs(e1! - e0!);
      if (!(w >= 2 ** -126 && w <= 2 ** 126) || Math.abs(x! - e0!) > 2 ** 126) return { k: 'ood', why: 'division accuracy is only specified for |y| in [2^-126, 2^126]' };
      if (x === e0) return EX;
      const m = 1e-5 * w;
      const clamped = e0! < e1! ? x! <= e0! - m || x! >= e1! + m : x! >= e0! + m || x! <= e1! - m;
      return clamped ? EX : OBS;
    } },
  { name: 'fma', shapes: ['V', 'V', 'V'], out: 'V', dims: [0, 2, 3, 4], lane: (a) => a[0]! * a[1]! + a[2]!,
    tierLane: (a) => (smallInt([a[0]!], [a[1]!], [a[2]!]) ? EX : ordinary(a) ? derived(2 * U * (Math.abs(a[0]! * a[1]!) + Math.abs(a[2]!)), 'fma inherited from x*y+z: <= 2u(|xy|+|z|)') : OBS),
    note: 'exact for small ints; derived 2u(|xy|+|z|) bound for ordinary magnitudes' },
  { name: 'mix', shapes: ['V', 'V', 'V'], out: 'V', dims: [0, 2, 3, 4], lane: (a) => a[0]! * (1 - a[2]!) + a[1]! * a[2]!,
    tierLane: mixTier, note: 'formula x*(1-z)+y*z; exact tier for z in {0,1} (and x==y, z=.5), derived from the formula' },
  { name: 'mix', body: 'mix', shapes: ['V', 'V', 'S'], out: 'V', dims: [2, 3, 4], lane: (a) => a[0]! * (1 - a[2]!) + a[1]! * a[2]!,
    tierLane: mixTier, note: 'vector mix with scalar blend factor (name suffix _s)' },
  { name: 'dot', shapes: ['V', 'V'], out: 'S', dims: [2, 3, 4], row: (r) => [exactDot(r[0]!, r[1]!)],
    tierRow: (r) => (smallInt(r[0]!, r[1]!) ? EX : ordinary(r[0]!, r[1]!) ? derived(2 * r[0]!.length * U * r[0]!.reduce((s, x, i) => s + Math.abs(x * r[1]![i]!), 0), 'dot inherited from sum of x[i]*y[i]: <= (2n-1) roundings, <= 2n*u*sum|x_i y_i|') : OBS) },
  { name: 'length', shapes: ['V'], out: 'S', dims: [0, 2, 3, 4], row: (r) => [Math.sqrt(Math.abs(r[0]!.length === 1 ? r[0]![0]! ** 2 : exactDot(r[0]!, r[0]!)))], tierRow: (r) => (r[0]!.every((x) => x === 0) ? EX : ordinary(r[0]!) ? { k: 'ulp', max: 8, why: 'derived (conservative): sqrt(dot) with sqrt inherited from 1/inverseSqrt (2 ULP) + dot rounding' } : OBS),
    note: 'scalar: sqrt(x*x) may overflow per spec note; exact tier only for the zero vector' },
  { name: 'distance', shapes: ['V', 'V'], out: 'S', dims: [0, 2, 3, 4], row: (r) => { const diff = r[0]!.map((x, i) => fr(x - r[1]![i]!)); return [diff.some((x) => !Number.isFinite(x)) ? Infinity : Math.sqrt(exactDot(diff, diff))]; },
    tierRow: (r) => (r[0]!.some((x, i) => !Number.isFinite(fr(x - r[1]![i]!))) ? { k: 'ood', why: 'x - y overflows f32' } : r[0]!.every((x, i) => x === r[1]![i]) ? EX : ordinary(r[0]!, r[1]!) ? { k: 'ulp', max: 8, why: 'derived (conservative): length(x - y)' } : OBS), note: 'oracle uses the f32-rounded difference (spec: inherited from length(x - y))' },
  { name: 'normalize', shapes: ['V'], out: 'V', dims: [2, 3, 4], row: (r) => { const l = Math.sqrt(exactDot(r[0]!, r[0]!)); return r[0]!.map((x) => x / l); },
    tierRow: (r) => (r[0]!.every((x) => x === 0) ? { k: 'ood', why: 'zero vector: outside domain' } : ordinary(r[0]!) ? { k: 'ulp', max: 12, why: 'derived (conservative): x / length(x), length <= 8 ULP + division 2.5 ULP' } : OBS) },
  { name: 'cross', shapes: ['V', 'V'], out: 'V', dims: [3], row: (r) => exactCross(r[0]!, r[1]!), tierRow: (r) => (smallInt(r[0]!, r[1]!) ? EX : ordinary(r[0]!, r[1]!) ? [0, 1, 2].map((i) => { const j = (i + 1) % 3, k = (i + 2) % 3; return derived(3 * U * (Math.abs(r[0]![j]! * r[1]![k]!) + Math.abs(r[0]![k]! * r[1]![j]!)), 'cross inherited from x[i]*y[j]-x[j]*y[i]: 3 roundings'); }) : OBS) },
  { name: 'reflect', shapes: ['V', 'V'], out: 'V', dims: [2, 3, 4], row: (r) => { const dd = exactDot(r[0]!, r[1]!); return r[0]!.map((x, i) => x - 2 * dd * r[1]![i]!); },
    tierRow: (r) => {
      if (smallInt(r[0]!, r[1]!)) return EX;
      if (!ordinary(r[0]!, r[1]!)) return OBS;
      const n = r[0]!.length, Sd = r[0]!.reduce((s, x, i) => s + Math.abs(x * r[1]![i]!), 0);
      return r[0]!.map((x, i) => derived(U * (Math.abs(x) + (4 * n + 4) * Math.abs(r[1]![i]!) * Sd), 'reflect inherited from x - 2*dot(x,y)*y: dot <= 2n u S, then 3 more roundings'));
    } },
  { name: 'faceForward', shapes: ['V', 'V', 'V'], out: 'V', dims: [2, 3, 4], row: (r) => { const dd = exactDot(r[1]!, r[2]!); return dd < 0 ? r[0]! : r[0]!.map((x) => -x); },
    tierRow: (r) => {
      if (smallInt(r[1]!, r[2]!)) return EX;
      const dd = exactDot(r[1]!, r[2]!), sabs = r[1]!.reduce((s, x, i) => s + Math.abs(x * r[2]![i]!), 0);
      return Math.abs(dd) > 1e-3 * sabs && Math.abs(dd) > 1e-30 && sabs < 1e38 ? EX : { k: 'ood', why: 'sign of dot ill-conditioned / overflow' };
    }, note: 'oracle: e1 if dot(e2,e3)<0 else -e1 (spec text)' },
  { name: 'refract', shapes: ['V', 'V', 'S'], out: 'V', dims: [2, 3, 4], row: (r) => {
      const [e1, e2, e3] = [r[0]!, r[1]!, r[2]![0]!], dd = exactDot(e2, e1), k = 1 - e3 * e3 * (1 - dd * dd);
      return k < 0 ? e1.map(() => 0) : e1.map((x, i) => e3 * x - (e3 * dd + Math.sqrt(k)) * e2[i]!);
    },
    tierRow: (r) => {
      const [e1, e2, e3] = [r[0]!, r[1]!, r[2]![0]!], dd = exactDot(e2, e1), k = 1 - e3 * e3 * (1 - dd * dd);
      return k < -1e-3 ? EX : OBS;
    } },
];
export const specId = (s: FnSpec, dim: number) => `${s.name}${s.body === 'mix' && s.shapes[2] === 'S' ? '_s' : ''}${s.body === 'selectS' ? '' : ''}:${dim === 0 ? 'f32' : 'vec' + dim + 'f'}`;
export type { Any };
