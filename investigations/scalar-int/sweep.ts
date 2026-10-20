import { type Any, type GpuIn, type K, MAX, MIN, UMAX, cpuMap, f32Candidates, gpuMap, inRange, randBand, rng, storedAs, ulp32 } from './lib.ts';
import type { Op } from './ops.ts';

export const IV = [MIN, MIN + 1, -1073741825, -33554433, -16777217, -16777216, -16777215, -65536, -46341, -46340, -1000, -7, -3, -2, -1, 0, 1, 2, 3, 7, 1000, 46340, 46341, 65535, 65536, 16777215, 16777216, 16777217, 16777219, 33554433, 1073741824, 123456789, 2147483520, MAX - 1, MAX];
export const UV = [0, 1, 2, 3, 7, 1000, 46340, 46341, 65535, 65536, 16777215, 16777216, 16777217, 16777219, 33554433, 1073741824, 2147483647, 2147483648, 2147483649, 3000000000, 4294967040, 4294967041, UMAX - 1, UMAX];
export const SH = [0, 1, 2, 5, 15, 16, 30, 31, 32, 33, 40, 63, 64, UMAX];

export const SPECIAL_F = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.5, -2.5, 255.9, 65535.5, 16777215, 16777216, 33554432, 1e9, 2147483520, 2147483648, -2147483648, -2147483904, 3e9, 4294967040, 4294967296, 5e9, 1e10, 1e20, -1e20, 3.4028235e38, -3.4028235e38];

export const bitLen = (x: number) => (x === 0 ? 0 : Math.floor(Math.log2(Math.abs(x))) + 1);

export function makeRows(T: 'i32' | 'u32', nin: number, shift: boolean, nRandom: number, seed: number): number[][] {
  const V = T === 'i32' ? IV : UV, rows: number[][] = [];
  if (nin === 1) { for (const a of V) rows.push([a]); }
  else if (nin === 2) { for (const a of V) for (const b of shift ? SH : V) rows.push([a, b]); }
  else { for (const a of V) for (const b of V) for (const c of [V[0]!, V[1]!, V[3]!, V[V.length >> 1]!, V[V.length - 1]!]) rows.push([a, b, c]); }
  const r = rng(seed), signed = T === 'i32';
  for (let i = 0; i < nRandom; i++) {
    const row: number[] = [];
    for (let j = 0; j < nin; j++) {
      if (shift && j === 1) row.push(Math.floor(r() * 70));
      else row.push(randBand(r, Math.floor(r() * (signed ? 32 : 33)), signed));
    }
    rows.push(row);
  }
  return rows;
}

export interface SweepResult {
  op: string; type: string; n: number; contract: string;
  gpuErr?: string;
  gpuVsOracle: { mismatches: number; samples: Any[] };
  cpuVsOracle: { mismatches: number; nonInteger: number; outOfRange: number; inRangeButDifferent: number; samples: Any[] };
  cpuStoredVsOracle: { mismatches: number; samples: Any[] };
  cpuVsGpuRaw: { mismatches: number; samples: Any[] };
  byBits?: Record<string, { n: number; gpuWrong: number }>;
  maxAbsErr?: number; minBitsOfGpuWrong?: number | null;
  rows?: { rows: number[][]; oracle: (number | null)[]; cpu: (number | string)[]; gpu: number[] };
}

const toNum = (x: bigint | number | null) => (x === null ? null : Number(x));

export async function sweepOp(op: Op, T: 'i32' | 'u32', rowsIn: number[][], keep = false): Promise<SweepResult> {
  const kinds = op.ins(T), outK = op.out(T);
  const rows = rowsIn.filter((r) => !(op.skip?.(T, r.map(BigInt)) ?? false));
  const oracle = rows.map((r) => toNum(op.oracle(T, r.map(BigInt))));
  const ins: GpuIn[] = kinds.map((k, j) => ({ k, values: rows.map((r) => r[j]!) }));
  const g = await gpuMap(op.fn, ins, outK);
  const cpu = cpuMap(op.fn, ins);
  const res: SweepResult = {
    op: op.name, type: T, n: rows.length, contract: op.contract,
    gpuVsOracle: { mismatches: 0, samples: [] }, cpuVsOracle: { mismatches: 0, nonInteger: 0, outOfRange: 0, inRangeButDifferent: 0, samples: [] },
    cpuStoredVsOracle: { mismatches: 0, samples: [] }, cpuVsGpuRaw: { mismatches: 0, samples: [] },
  };
  if ('error' in g) { res.gpuErr = g.error; return res; }
  const gpu = g.out;
  const byBits: Record<string, { n: number; gpuWrong: number }> = {};
  let maxAbsErr = 0, minBits: number | null = null;
  rows.forEach((r, i) => {
    const o = oracle[i], c = cpu[i]!, gv = gpu[i]!;
    const bits = Math.max(...r.slice(0, 2).map((v) => bitLen(v)));
    const bb = (byBits[bits] ??= { n: 0, gpuWrong: 0 });
    bb.n++;
    const rec = { in: r, oracle: o, cpu: c, gpu: gv };
    if (o !== null && gv !== o) {
      res.gpuVsOracle.mismatches++; bb.gpuWrong++;
      if (res.gpuVsOracle.samples.length < 6) res.gpuVsOracle.samples.push(rec);
      maxAbsErr = Math.max(maxAbsErr, Math.abs(gv - o));
      minBits = minBits === null ? bits : Math.min(minBits, bits);
    }
    if (typeof c === 'number') {
      if (o !== null && c !== o) {
        res.cpuVsOracle.mismatches++;
        if (!Number.isInteger(c)) res.cpuVsOracle.nonInteger++;
        else if (!inRange(outK, c)) res.cpuVsOracle.outOfRange++;
        else res.cpuVsOracle.inRangeButDifferent++;
        if (res.cpuVsOracle.samples.length < 8 && (res.cpuVsOracle.mismatches <= 3 || (Number.isInteger(c) && inRange(outK, c)))) res.cpuVsOracle.samples.push(rec);
        if (storedAs(outK, c) !== o) { res.cpuStoredVsOracle.mismatches++; if (res.cpuStoredVsOracle.samples.length < 6) res.cpuStoredVsOracle.samples.push({ ...rec, stored: storedAs(outK, c) }); }
      }
      if (c !== gv) { res.cpuVsGpuRaw.mismatches++; if (res.cpuVsGpuRaw.samples.length < 4) res.cpuVsGpuRaw.samples.push(rec); }
    } else {
      res.cpuVsOracle.mismatches++; res.cpuVsOracle.nonInteger++;
      if (res.cpuVsOracle.samples.length < 8) res.cpuVsOracle.samples.push(rec);
    }
  });
  res.byBits = byBits; res.maxAbsErr = maxAbsErr; res.minBitsOfGpuWrong = minBits;
  if (keep) res.rows = { rows, oracle, cpu, gpu };
  return res;
}

const satTrunc = (lo: number, hi: number, x: number) => Math.min(Math.max(Math.trunc(x), lo), hi);
export function divModelAllows(T: 'i32' | 'u32', a: number, b: number, G: number): boolean {
  const lo = T === 'i32' ? MIN : 0, hi = T === 'i32' ? MAX : UMAX, ceilGpu = T === 'i32' ? 2147483520 : 4294967040;
  const ca = f32Candidates(a), cb = f32Candidates(b), qs = [ca[0] / cb[0], ca[0] / cb[1], ca[1] / cb[0], ca[1] / cb[1]];
  let qmin = Math.min(...qs), qmax = Math.max(...qs);
  qmin -= 2.5 * ulp32(qmin); qmax += 2.5 * ulp32(qmax);
  const gLo = satTrunc(lo, hi, qmin), gHi = satTrunc(lo, hi, qmax);
  if (G >= gLo && G <= gHi) return true;
  return G === ceilGpu && gHi >= ceilGpu;
}
export function modModelAllows(T: 'i32' | 'u32', a: number, b: number, G: number): boolean {
  const ca = f32Candidates(a), cb = f32Candidates(b);
  for (const x of ca) for (const y of cb) {
    const r = x % y;
    if (Number.isFinite(r) && Math.trunc(r) === G) return true;
  }
  return false;
}
export type { K };
