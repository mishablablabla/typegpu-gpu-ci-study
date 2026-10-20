import { ordinary } from './specs.ts';
import { cpuEval, fr, gpuBatch, hex, isSub, lanesOf, sameValue, sameBits, ulpDist, type Any, type CpuResult } from './common.ts';
import { RT } from './bodies.ts';
import { type FnSpec, type Tier } from './specs.ts';

export const EDGE = [0, -0, 1, -1, 0.5, -0.5, 1.5, -1.5, 2.5, -2.5, 3.5, -3.5, 0.3, -0.3, 0.1, 7, -7, 123.456, 4194304.5, 8388607.5, 16777216,
  1e-40, -1e-40, 1.1754943508222875e-38, 1e-30, -1e-30, 1e30, -1e30, 3e38, -3e38, 3.4028234663852886e38, -3.4028234663852886e38,
  0.49999997, 0.50000006, 1 + 2 ** -23, 1 - 2 ** -24].map(fr);
export const INTS = [0, 1, -1, 2, -2, 3, -3, 4, 5, -7, 10, 100, -100].map(fr);
const RAND_RANGE: Record<string, [number, number]> = { asin: [-1, 1], acos: [-1, 1], sinh: [-10, 10], cosh: [-10, 10], tan: [-3, 3] };
function rng(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; }

export type Tag = 'edge' | 'int' | 'rand' | 'special';
export interface Rows { argRows: number[][][]; tags: Tag[] }
export function genRows(spec: FnSpec, dim: number, lists: { tag: Tag; L: number[] }[], arity: number, randN = 300, seed = 7): Rows {
  const argRows: number[][][] = Array.from({ length: arity }, () => []);
  const tags: Tag[] = [];
  const lanes = lanesOf(dim);
  const lane = (j: number, idxs: number[], L: number[]) => (spec.shapes[j] === 'S' || dim === 0 ? [L[idxs[j]! % L.length]!] : Array.from({ length: lanes }, (_, l) => L[(idxs[j]! + l * (2 * j + 3)) % L.length]!));
  for (const { tag, L: L0 } of lists) {
    const L = L0.map(fr);
    const m = L.length;
    if (tag === 'rand') {
      const r = rng(seed + dim), [lo, hi] = RAND_RANGE[spec.name] ?? [-100, 100];
      for (let i = 0; i < randN; i++) {
        for (let j = 0; j < arity; j++) argRows[j]!.push(Array.from({ length: spec.shapes[j] === 'S' || dim === 0 ? 1 : lanes }, () => fr(lo + (hi - lo) * r())));
        tags.push('rand');
      }
      continue;
    }
    const push = (idxs: number[]) => { for (let j = 0; j < arity; j++) argRows[j]!.push(lane(j, idxs, L)); tags.push(tag); };
    if (arity === 1) for (let i = 0; i < m; i++) push([i]);
    else if (arity === 2) for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) push([i, j]);
    else for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) for (let t = 0; t < 3; t++) push([i, j, (i * 3 + j * 5 + t * 7 + t) % m]);
  }
  return { argRows, tags };
}

export interface Ex { tag: string; args: number[][]; cpu: string; gpu: string; oracle: string; ulp?: string | number; why?: string }
export interface Stats {
  id: string; fn: string; type: string; rows: number; elements: number;
  cpuThrewRows: number; cpuThrowMessages: Record<string, number>;
  tiers: Record<string, number>;
  gpuExactFail: number; gpuExactChecked: number; gpuBoundFail: number; gpuBoundChecked: number;
  cpuExactFail: number; cpuExactChecked: number;
  cpuVsGpu: { elements: number; identical: number; sameValueDiffZeroSign: number; ulp1: number; ulp2to4: number; ulpGt4: number; nanInfClassMismatch: number; maxUlp: number };
  oodElements: number; obsMaxUlpGpu: number; obsMaxUlpCpu: number; gpuOverflowVsOracle: number; cpuNonRepresentableResult: number;
  examples: { gpuExactFail: Ex[]; gpuBoundFail: Ex[]; cpuExactFail: Ex[]; cpuGpuWorst: Ex[]; nanInf: Ex[]; obsWorstGpu: Ex[] };
}
const fmt = (v: number) => (Number.isNaN(v) ? 'NaN' : v === Infinity ? 'inf' : v === -Infinity ? '-inf' : `${v}(${hex(v)})`);
const fmtL = (a: number[]) => '[' + a.map(fmt).join(', ') + ']';
const MAXEX = 8;

export async function evaluate(spec: FnSpec, dim: number, rows: Rows): Promise<{ stats: Stats; gpu: number[][]; cpu: CpuResult[]; oracle: number[][]; tiers: Tier[][] }> {
  const body = spec.body ?? spec.name, fn = RT[body]!;
  const arity = spec.shapes.length, n = rows.tags.length;
  const argDims = spec.shapes.map((s) => (s === 'S' ? 0 : dim));
  const outDim = spec.out === 'S' ? 0 : dim;
  const type = dim === 0 ? 'f32' : `vec${dim}f`;
  const gpu = await gpuBatch(fn, argDims, outDim, rows.argRows);
  const cpu: CpuResult[] = [], oracle: number[][] = [], tiers: Tier[][] = [];
  const stats: Stats = { id: `${spec.name}${spec.shapes[2] === 'S' && spec.name === 'mix' ? '_s' : ''}:${type}`, fn: spec.name, type, rows: n, elements: 0, cpuThrewRows: 0, cpuThrowMessages: {}, tiers: {},
    gpuExactFail: 0, gpuExactChecked: 0, gpuBoundFail: 0, gpuBoundChecked: 0, cpuExactFail: 0, cpuExactChecked: 0,
    cpuVsGpu: { elements: 0, identical: 0, sameValueDiffZeroSign: 0, ulp1: 0, ulp2to4: 0, ulpGt4: 0, nanInfClassMismatch: 0, maxUlp: 0 },
    oodElements: 0, obsMaxUlpGpu: 0, obsMaxUlpCpu: 0, gpuOverflowVsOracle: 0, cpuNonRepresentableResult: 0,
    examples: { gpuExactFail: [], gpuBoundFail: [], cpuExactFail: [], cpuGpuWorst: [], nanInf: [], obsWorstGpu: [] } };
  const worstCG: Ex[] = [], worstObs: Ex[] = [];
  for (let i = 0; i < n; i++) {
    const args = rows.argRows.map((a) => a[i]!);
    const c = cpuEval(fn, argDims, outDim, args);
    cpu.push(c);
    if (!c.ok) { stats.cpuThrewRows++; const k = c.error.replace(/'[^']*'/g, "'…'"); stats.cpuThrowMessages[k] = (stats.cpuThrowMessages[k] ?? 0) + 1; if (/Finite Math/.test(c.error)) stats.cpuNonRepresentableResult++; }
    let o: number[], tr: Tier[];
    const L = lanesOf(outDim);
    if (spec.row) {
      o = spec.row(args).map(fr);
      const t = spec.tierRow?.(args) ?? { k: 'obs' as const };
      tr = Array.isArray(t) ? t : Array.from({ length: L }, () => t);
    } else {
      o = []; tr = [];
      for (let l = 0; l < L; l++) {
        const la = args.map((a, j) => (spec.shapes[j] === 'S' || dim === 0 ? a[0]! : a[l]!));
        o.push(fr(spec.lane!(la)));
        tr.push(spec.tierLane?.(la) ?? { k: 'obs' });
      }
      if (spec.tierRow) { const t = spec.tierRow(args); tr = Array.isArray(t) ? t : tr.map(() => t); }
    }
    const anySubRow = args.some((a) => a.some(isSub));
    tr = tr.map((t, l) => {
      if (t.k === 'ood') return t;
      const la = args.map((a, j) => (spec.shapes[j] === 'S' || dim === 0 ? a[0]! : a[l]!));
      if (spec.row ? anySubRow : la.some(isSub)) return { k: 'ood' as const, why: 'subnormal input (flush-to-zero allowed)' };
      if (Math.abs(o[l]!) < 2 ** -120 && o[l] !== 0) return { k: 'ood' as const, why: 'result in/near the subnormal range (flush-to-zero allowed)' };
      if (args.some((a) => a.some((x) => x !== 0 && Math.abs(x) < 2 ** -120))) return { k: 'ood' as const, why: 'input in/near the subnormal range (flush-to-zero allowed)' };
      if (t.k === 'obs' && !(spec.row ? ordinary(...args) : ordinary(la))) return { k: 'ood' as const, why: 'extreme magnitude: intermediate overflow/underflow is indeterminate/flushable' };
      return t;
    });
    oracle.push(o); tiers.push(tr);
    for (let l = 0; l < L; l++) {
      stats.elements++;
      const g = gpu[i]![l]!, ov = o[l]!, t = tr[l]!;
      stats.tiers[t.k] = (stats.tiers[t.k] ?? 0) + 1;
      const mk = (extra: Partial<Ex> = {}): Ex => ({ tag: rows.tags[i]!, args: args as Any, cpu: c.ok ? fmtL(c.lanes) : `threw: ${c.error}`, gpu: fmtL(gpu[i]!), oracle: fmtL(o), ...extra,
        args: args.map((a) => fmtL(a)) as Any });
      const gUlp = ulpDist(g, ov);
      if (t.k === 'exact') {
        stats.gpuExactChecked++;
        if (!sameValue(g, ov)) { stats.gpuExactFail++; if (stats.examples.gpuExactFail.length < MAXEX) stats.examples.gpuExactFail.push(mk({ ulp: String(gUlp) })); }
        if (c.ok) { stats.cpuExactChecked++; if (!sameValue(c.lanes[l]!, ov)) { stats.cpuExactFail++; if (stats.examples.cpuExactFail.length < MAXEX) stats.examples.cpuExactFail.push(mk({ ulp: String(ulpDist(c.lanes[l]!, ov)) })); } }
      } else if (t.k === 'ulp' || t.k === 'abs') {
        if (Number.isFinite(ov) && Number.isFinite(g)) {
          stats.gpuBoundChecked++;
          const bad = t.k === 'ulp' ? (gUlp as number) > t.max : Math.abs(g - ov) > t.max;
          if (bad) { stats.gpuBoundFail++; if (stats.examples.gpuBoundFail.length < MAXEX) stats.examples.gpuBoundFail.push(mk({ ulp: String(gUlp), why: t.why })); }
        }
      }
      if (t.k !== 'ood') {
        if (Number.isFinite(ov) && Number.isFinite(g) && typeof gUlp === 'number') {
          if (t.k !== 'exact' && gUlp > stats.obsMaxUlpGpu) stats.obsMaxUlpGpu = gUlp;
          if (t.k !== 'exact' && gUlp >= stats.obsMaxUlpGpu && gUlp > 0) { worstObs.push(mk({ ulp: gUlp })); worstObs.sort((a, b) => (b.ulp as number) - (a.ulp as number)); worstObs.length = Math.min(worstObs.length, MAXEX); }
        }
        if (Number.isFinite(ov) && !Number.isFinite(g)) stats.gpuOverflowVsOracle++;
        if (c.ok && Number.isFinite(ov)) { const u = ulpDist(c.lanes[l]!, ov); if (typeof u === 'number' && t.k !== 'exact' && u > stats.obsMaxUlpCpu) stats.obsMaxUlpCpu = u; }
      }
      if (t.k === 'ood') stats.oodElements++;
      if (c.ok && t.k !== 'ood') {
        const cv = c.lanes[l]!, u = ulpDist(cv, g), s = stats.cpuVsGpu;
        s.elements++;
        if (u === 'nan' || u === 'inf') { s.nanInfClassMismatch++; if (stats.examples.nanInf.length < MAXEX) stats.examples.nanInf.push(mk({ ulp: u })); }
        else {
          if (sameBits(cv, g)) s.identical++;
          else if (u === 0) s.sameValueDiffZeroSign++;
          else if (u === 1) s.ulp1++; else if (u <= 4) s.ulp2to4++; else s.ulpGt4++;
          if (u > s.maxUlp) s.maxUlp = u;
          if (u > 1 && t.k !== 'ood') { worstCG.push(mk({ ulp: u })); worstCG.sort((a, b) => (b.ulp as number) - (a.ulp as number)); worstCG.length = Math.min(worstCG.length, MAXEX); }
        }
      }
    }
  }
  stats.examples.cpuGpuWorst = worstCG; stats.examples.obsWorstGpu = worstObs;
  return { stats, gpu, cpu, oracle, tiers };
}
