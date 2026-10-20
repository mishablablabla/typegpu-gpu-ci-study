import { dotOracle, gamma, type Any, type Dot, type Kind, type Logical } from './util.ts';

export type Cols = number[][];
export const flatOut = (k: Kind, v: Logical): number[] => (k.mat ? (v as Cols).flat() : k.vec ? (v as number[]) : [v as number]);

export function oracleMul(lk: Kind, rk: Kind, a: Logical, b: Logical): Dot[] {
  const t = (xs: number[], ys: number[]) => dotOracle(xs, ys);
  if (lk.mat && rk.mat) {
    const A = a as Cols, B = b as Cols, n = lk.rows, out: Dot[] = [];
    for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) out.push(t(A.map((col) => col[r]!), B[c]!));
    return out;
  }
  if (lk.mat && rk.vec) { const A = a as Cols, v = b as number[]; return Array.from({ length: lk.rows }, (_, r) => t(A.map((col) => col[r]!), v)); }
  if (lk.vec && rk.mat) { const v = a as number[], M = b as Cols; return M.map((col) => t(v, col)); }
  if (lk.mat || rk.mat) {
    const M = (lk.mat ? a : b) as Cols, s = (lk.mat ? b : a) as number;
    return M.flat().map((x) => t([x], [s]));
  }
  if (lk.vec && rk.vec) return (a as number[]).map((x, i) => t([x], [(b as number[])[i]!]));
  if (lk.vec || rk.vec) { const v = (lk.vec ? a : b) as number[], s = (lk.vec ? b : a) as number; return v.map((x) => t([x], [s])); }
  return [t([a as number], [b as number])];
}
export function oracleAddSub(sign: 1 | -1, lk: Kind, rk: Kind, a: Logical, b: Logical): number[] {
  const fa = flatOut(lk, a), fb = flatOut(rk, b);
  const n = Math.max(fa.length, fb.length);
  return Array.from({ length: n }, (_, i) => (fa[fa.length === 1 ? 0 : i]!) + sign * (fb[fb.length === 1 ? 0 : i]!));
}

export function checkDot(got: number[], ora: Dot[]): { ok: boolean; worstRatio: number; worstIndex: number } {
  let worst = 0, wi = -1, ok = true;
  got.forEach((g, i) => {
    const o = ora[i]!, bound = gamma(o.n) * o.absSum;
    const err = Math.abs(g - o.exact);
    const within = Number.isFinite(g) && err <= bound;
    const ratio = bound === 0 ? (err === 0 ? 0 : Infinity) : err / bound;
    if (!within) ok = false;
    if (ratio > worst) { worst = ratio; wi = i; }
  });
  return { ok, worstRatio: worst, worstIndex: wi };
}

export const fr = Math.fround;
export function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
export function gen(k: Kind, set: 'exact' | 'random' | 'cancel', seed: number): Logical {
  const r = lcg(seed * 7919 + 13);
  let idx = 0;
  const one = (): number => {
    const i = idx++;
    if (set === 'exact') return ((seed * 5 + i * 7 + 3) % 13) - 6;
    if (set === 'random') return fr(-4 + 8 * r());
    return i % 3 === 0 ? 1e8 : i % 3 === 1 ? 1.5 : -1e8;
  };
  const oneB = (): number => (set === 'cancel' ? 1 + (idx++ % 2) : one());
  const f = seed % 2 === 1 || set !== 'cancel' ? one : oneB;
  if (k.mat) return Array.from({ length: k.cols }, () => Array.from({ length: k.rows }, f));
  if (k.vec) return Array.from({ length: k.rows }, f);
  return f();
}
export type { Any };
