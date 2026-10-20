import { d } from 'typegpu';
import { root } from '../harness.ts';
import { f16round, fmt, fround, ulp32 } from '../lib/num.ts';
import type { OpSpec } from '../lib/ops.ts';
import type { Policy, Verdict } from '../lib/policy.ts';
import { TY, type TypeDesc } from '../lib/types.ts';

type Any = any;

export interface LaneIssue { lane: number; target: 'gpu' | 'cpu'; verdict: 'fail' | 'investigate'; detail?: string; known?: string }
export interface Row {
  id: string;
  inputs: number[][];
  cpu: number[] | string;
  gpu: number[];
  want: number[];
  status: 'pass' | 'fail' | 'known-divergence' | 'investigate';
  issues: LaneIssue[];
}
export interface GroupResult {
  op: string; type: string; semantics: string;
  policy: { id: string; basis: string; describe: string };
  total: number; pass: number; fail: number; knownDivergence: number; investigate: number;
  cpuVsGpu?: { compared: number; identical: number; differ: number; maxUlpDiff: number | null };
  unsupported?: { side: 'cpu' | 'gpu'; reason: string };
  rows: Row[];
  truncated?: number;
}

const MAX_KEEP = 1e9;

export function buildRows(lists: number[][], types: TypeDesc[]): number[][][] {
  if (types.every((t) => !t.vec)) {
    const [a, b] = lists;
    if (lists.length === 1) return a!.map((x) => [[x]]);
    const rows: number[][][] = [];
    for (const x of a!) for (const y of b!) rows.push([[x], [y]]);
    return rows;
  }
  const rows: number[][][] = [];
  const at = (k: number, i: number) => lists[k]![((i % lists[k]!.length) + lists[k]!.length) % lists[k]!.length]!;
  if (types.length === 1) {
    for (let i = 0; i < lists[0]!.length; i++) rows.push([Array.from({ length: types[0]!.lanes }, (_, l) => at(0, i + l * 3))]);
    return rows;
  }
  for (let i = 0; i < lists[0]!.length; i++) {
    for (let j = 0; j < lists[1]!.length; j++) {
      rows.push(types.map((t, k) => Array.from({ length: t.lanes }, (_, l) => at(k, (k === 0 ? i : j) + l * (3 + 2 * k)))));
    }
  }
  return rows;
}

const normalizeCpu = (elem: string, x: number) => (elem === 'f32' ? fround(x) : elem === 'f16' ? f16round(x) : x);

function cpuEval(op: OpSpec, t: TypeDesc, argTypes: TypeDesc[], outType: TypeDesc, rows: number[][][]) {
  const fn = op.fn(t);
  return rows.map((row): number[] | string => {
    try {
      const v = fn(...argTypes.map((at, k) => at.make(row[k]!)));
      return outType.lanesOf(v).map((x) => normalizeCpu(outType.elem, x));
    } catch (e) {
      return `CPU threw: ${(e as Error).message.split('\n')[0]}`;
    }
  });
}

const TYPED: Record<string, any> = { f32: Float32Array, i32: Int32Array, u32: Uint32Array, f16: (globalThis as any).Float16Array };
const strideElems = (t: TypeDesc) => (t.lanes === 3 ? 4 : t.lanes);
function padded(t: TypeDesc, n: number) {
  const Arr = TYPED[t.elem];
  const elems = n * strideElems(t);
  const bytes = Math.ceil((elems * Arr.BYTES_PER_ELEMENT) / 4) * 4;
  return new Arr(bytes / Arr.BYTES_PER_ELEMENT);
}
function pack(t: TypeDesc, lanesList: number[][]) {
  const stride = strideElems(t);
  const arr = padded(t, lanesList.length);
  lanesList.forEach((lanes, i) => lanes.forEach((v, k) => { arr[i * stride + k] = v; }));
  return arr;
}
async function readRaw(buf: any, t: TypeDesc, n: number): Promise<number[][]> {
  const device = root.device as any;
  const src = (root as any).unwrap(buf) as GPUBuffer;
  const staging = device.createBuffer({ size: src.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(src, 0, staging, 0, src.size);
  device.queue.submit([enc.finish()]);
  await staging.mapAsync(GPUMapMode.READ);
  const arr = new TYPED[t.elem](staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  const stride = strideElems(t);
  return Array.from({ length: n }, (_, i) => Array.from({ length: t.lanes }, (_, k) => Number(arr[i * stride + k])));
}

async function gpuEval(op: OpSpec, t: TypeDesc, argTypes: TypeDesc[], outType: TypeDesc, rows: number[][][]): Promise<number[][]> {
  const fn = op.fn(t);
  const n = rows.length;
  const ins = argTypes.map((at, k) => {
    const buf = root.createMutable(d.arrayOf(at.schema, n));
    (root.device as any).queue.writeBuffer((root as any).unwrap(buf), 0, new Uint8Array(pack(at, rows.map((r) => r[k]!)).buffer));
    return buf;
  });
  const out = root.createMutable(d.arrayOf(outType.schema, n));
  const a: Any = ins[0];
  const b: Any = ins[1];
  try {
    const pipeline =
      argTypes.length === 1
        ? root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(a.$[i]); })
        : root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = fn(a.$[i], b.$[i]); });
    pipeline.dispatchThreads(n);
    return await readRaw(out, outType, n);
  } finally {
    for (const buf of [...ins, out]) (buf as Any).buffer.destroy();
  }
}

export async function runGroup(op: OpSpec, typeName: string): Promise<GroupResult> {
  const t = TY[typeName]!;
  const argTypes = op.argTypes ? op.argTypes(t) : Array(op.arity).fill(t);
  const outType = t;
  const policy: Policy = op.policy(t);
  const rows = buildRows(op.lists(t), argTypes);
  const head: GroupResult = {
    op: op.name, type: typeName, semantics: op.semantics,
    policy: { id: policy.id, basis: policy.basis, describe: policy.describe },
    total: rows.length, pass: 0, fail: 0, knownDivergence: 0, investigate: 0, rows: [],
  };

  const cpu = cpuEval(op, t, argTypes, outType, rows);
  const cpuAllThrew = cpu.every((c) => typeof c === 'string');
  let gpu: number[][];
  try {
    gpu = await gpuEval(op, t, argTypes, outType, rows);
  } catch (e) {
    head.unsupported = { side: 'gpu', reason: String((e as Error).message).split('\n').slice(0, 3).join(' ') };
    return head;
  }
  if (cpuAllThrew) head.unsupported = { side: 'cpu', reason: String(cpu[0]) };
  const divergence = op.cpuDivergence?.(t);

  const keep: Row[] = [];
  let passKept = 0;
  const cmp = { compared: 0, identical: 0, differ: 0, maxUlpDiff: null as number | null };
  rows.forEach((row, r) => {
    const issues: LaneIssue[] = [];
    const want: number[] = [];
    for (let l = 0; l < outType.lanes; l++) {
      const args = argTypes.map((at, k) => row[k]![at.vec ? l : 0]!);
      const w = op.oracle(args, t);
      want.push(w);
      const ctx = { type: t, args, oracle: (a: number[]) => op.oracle(a, t) };
      const g = policy.check(gpu[r]![l]!, w, ctx);
      if (g.verdict !== 'pass') issues.push({ lane: l, target: 'gpu', verdict: g.verdict as 'fail' | 'investigate', detail: g.detail });
      const c = cpu[r]!;
      if (typeof c !== 'string') {
        const cr = policy.check(c[l]!, w, ctx);
        if (cr.verdict !== 'pass') issues.push({ lane: l, target: 'cpu', verdict: cr.verdict as 'fail' | 'investigate', detail: cr.detail, known: cr.verdict === 'fail' ? divergence : undefined });
      }
    }
    const c0 = cpu[r]!;
    let rowGap = 0;
    if (typeof c0 !== 'string') {
      cmp.compared++;
      const same = c0.every((x, l) => Object.is(x, gpu[r]![l]!) || (x === 0 && gpu[r]![l] === 0));
      if (same) cmp.identical++;
      else {
        cmp.differ++;
        const tiny = (x: number) => x !== 0 && Math.abs(x) < 2 ** -126;
        const nearFlush = (x: number, y: number) => (x === 0 || y === 0) && Math.max(Math.abs(x), Math.abs(y)) < 2 ** -125;
        const flushRelated = row.some((a) => a.some(tiny)) || c0.some(tiny) || gpu[r]!.some(tiny) || c0.some((x, l) => nearFlush(x, gpu[r]![l]!));
        const ulpMeaningful = !/abs|remainder/.test(policy.id);
        if (outType.elem === 'f32' && ulpMeaningful && !flushRelated) {
          for (let l = 0; l < outType.lanes; l++) {
            const x = c0[l]!, y = gpu[r]![l]!;
            if (Number.isFinite(x) && Number.isFinite(y) && x !== y) rowGap = Math.max(rowGap, Math.abs(x - y) / ulp32(Math.max(Math.abs(x), Math.abs(y))));
          }
        }
      }
    }
    const gpuFail = issues.some((i) => i.target === 'gpu' && i.verdict === 'fail');
    const cpuFailUnknown = issues.some((i) => i.target === 'cpu' && i.verdict === 'fail' && !i.known);
    const cpuFailKnown = issues.some((i) => i.target === 'cpu' && i.verdict === 'fail' && i.known);
    const status: Row['status'] = gpuFail || cpuFailUnknown ? 'fail' : cpuFailKnown ? 'known-divergence' : issues.length ? 'investigate' : 'pass';
    head[status === 'known-divergence' ? 'knownDivergence' : status]++;
    if (status === 'pass' && rowGap > 0) cmp.maxUlpDiff = Math.max(cmp.maxUlpDiff ?? 0, rowGap);
    if (true) {
      if (status === 'pass') passKept++;
      if (true) {
        keep.push({ id: `${op.name}:${typeName}:${r}`, inputs: row, cpu: cpu[r]!, gpu: gpu[r]!, want, status, issues });
      }
    }
  });
  head.rows = keep;
  if (cmp.compared) head.cpuVsGpu = cmp;
  head.truncated = head.fail + head.knownDivergence + head.investigate - keep.filter((k) => k.status !== 'pass').length;
  return head;
}

const tup = (a: number[]) => (a.length === 1 ? fmt(a[0]!) : `(${a.map(fmt).join(', ')})`);

export function formatFailures(g: GroupResult, limit = 6): string {
  const bad = g.rows.filter((r) => r.status === 'fail').slice(0, limit);
  const lines = [`[${g.semantics}] ${g.op} · ${g.type} — ${g.fail} of ${g.total} cases FAIL  (policy: ${g.policy.id}, basis: ${g.policy.basis})`, `  rule: ${g.policy.describe}`];
  for (const r of bad) {
    lines.push(`  case ${r.id}  inputs: ${r.inputs.map(tup).join('  ,  ')}`);
    lines.push(`    cpu=${typeof r.cpu === 'string' ? r.cpu : tup(r.cpu)}  gpu=${tup(r.gpu)}  spec-oracle=${tup(r.want)}`);
    for (const i of r.issues.filter((x) => x.verdict === 'fail')) lines.push(`    ${i.target.toUpperCase()} lane ${i.lane}: ${i.detail}${i.known ? ` [expected: ${i.known}]` : ''}`);
  }
  if (g.fail > bad.length) lines.push(`  … ${g.fail - bad.length} more (see reports/report.json)`);
  return lines.join('\n');
}
