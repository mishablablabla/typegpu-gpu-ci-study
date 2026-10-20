import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { root } from '../../harness.ts';
import { CONST_BODIES } from './const-bodies.ts';

type Any = any;
const MAX = 2147483647, MIN = -2147483648, UMAX = 4294967295;
const wrapI = (x: bigint) => Number(BigInt.asIntN(32, x));
const wrapU = (x: bigint) => Number(BigInt.asUintN(32, x));

const IV = [MAX, MIN, -1, 0, 1, 2, 65536, 46341, 94906267, -7, 1073741824];
const UV = [UMAX, 2147483648, 2147483647, 0, 1, 2, 65536, 3037000500, 94906267, 7, 2654435761];
const SH = [0, 1, 5, 31, 32, 33];

type Kind = 'i32' | 'u32';
const wrap = (k: Kind, x: bigint) => (k === 'i32' ? wrapI(x) : wrapU(x));
const sc = (k: Kind) => (k === 'i32' ? d.i32 : d.u32);
const vv = (k: Kind) => (k === 'i32' ? d.vec2i : d.vec2u);
const vSchema = (k: Kind) => (k === 'i32' ? d.vec2i : d.vec2u);

interface Op { name: string; fn: Any; orc: (k: Kind, a: bigint, b: bigint) => bigint | null; shift?: boolean; skipVec?: boolean; skipScalar?: boolean }
const OPS: Op[] = [
  { name: 'std.add', fn: (a: Any, b: Any) => { 'use gpu'; return std.add(a, b); }, orc: (_k, a, b) => a + b },
  { name: 'std.sub', fn: (a: Any, b: Any) => { 'use gpu'; return std.sub(a, b); }, orc: (_k, a, b) => a - b },
  { name: 'std.mul', fn: (a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); }, orc: (_k, a, b) => a * b },
  { name: 'a * b', fn: (a: Any, b: Any) => { 'use gpu'; return a * b; }, orc: (_k, a, b) => a * b },
  { name: 'a + b', fn: (a: Any, b: Any) => { 'use gpu'; return a + b; }, orc: (_k, a, b) => a + b },
  { name: 'a - b', fn: (a: Any, b: Any) => { 'use gpu'; return a - b; }, orc: (_k, a, b) => a - b },
  { name: 'std.min', fn: (a: Any, b: Any) => { 'use gpu'; return std.min(a, b); }, orc: (_k, a, b) => (a < b ? a : b) },
  { name: 'std.max', fn: (a: Any, b: Any) => { 'use gpu'; return std.max(a, b); }, orc: (_k, a, b) => (a > b ? a : b) },
  { name: 'a / b', fn: (a: Any, b: Any) => { 'use gpu'; return a / b; }, orc: (k, a, b) => (b === 0n ? null : (k === 'i32' && a === -(2n ** 31n) && b === -1n ? a : a / b)) },
  { name: 'a % b', fn: (a: Any, b: Any) => { 'use gpu'; return a % b; }, orc: (k, a, b) => (b === 0n ? null : (k === 'i32' && a === -(2n ** 31n) && b === -1n ? 0n : a % b)) },
  { name: 'a & b', fn: (a: Any, b: Any) => { 'use gpu'; return a & b; }, orc: (_k, a, b) => BigInt.asIntN(64, a) & BigInt.asIntN(64, b) },
  { name: 'a | b', fn: (a: Any, b: Any) => { 'use gpu'; return a | b; }, orc: (_k, a, b) => a | b },
  { name: 'a ^ b', fn: (a: Any, b: Any) => { 'use gpu'; return a ^ b; }, orc: (_k, a, b) => a ^ b },
  { name: 'a << b', fn: (a: Any, b: Any) => { 'use gpu'; return a << b; }, orc: (_k, a, b) => a << (b & 31n), shift: true },
  { name: 'a >> b', fn: (a: Any, b: Any) => { 'use gpu'; return a >> b; }, orc: (k, a, b) => (k === 'i32' ? BigInt.asIntN(32, a) >> (b & 31n) : BigInt.asUintN(32, a) >> (b & 31n)), shift: true },
  { name: 'std.bitShiftLeft', fn: (a: Any, b: Any) => { 'use gpu'; return std.bitShiftLeft(a, b); }, orc: (_k, a, b) => a << (b & 31n), shift: true, skipScalar: true },
  { name: 'std.bitShiftRight', fn: (a: Any, b: Any) => { 'use gpu'; return std.bitShiftRight(a, b); }, orc: (k, a, b) => (k === 'i32' ? BigInt.asIntN(32, a) >> (b & 31n) : BigInt.asUintN(32, a) >> (b & 31n)), shift: true, skipScalar: true },
];

const pairsFor = (k: Kind, op: Op): [number, number][] => {
  const V = k === 'i32' ? IV : UV, out: [number, number][] = [];
  for (const a of V) for (const b of op.shift ? SH : V) out.push([a, b]);
  return out;
};

const dev = () => root.device as Any;
async function readRaw(buf: Any, n: number, k: Kind, lanes: number): Promise<number[][]> {
  const src = (root as Any).unwrap(buf) as GPUBuffer;
  const stg = dev().createBuffer({ size: src.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = dev().createCommandEncoder(); enc.copyBufferToBuffer(src, 0, stg, 0, src.size); dev().queue.submit([enc.finish()]);
  await stg.mapAsync(GPUMapMode.READ);
  const arr = new (k === 'i32' ? Int32Array : Uint32Array)(stg.getMappedRange().slice(0)); stg.unmap(); stg.destroy();
  return Array.from({ length: n }, (_, i) => Array.from({ length: lanes }, (_, l) => arr[i * lanes + l]!));
}
const lanesRows = (a: number, b: number, vec: boolean) => (vec ? { x: [a, b], y: [b, a] } : { x: [a], y: [b] });

async function runtimeBatch(op: Op, k: Kind, vec: boolean, pairs: [number, number][], yKind: Kind): Promise<(number[] | string)[]> {
  const n = pairs.length, lanes = vec ? 2 : 1;
  const X = vec ? vSchema(k) : sc(k), Y = vec ? vSchema(yKind) : sc(yKind);
  const bx: Any = root.createMutable(d.arrayOf(X, n)), by: Any = root.createMutable(d.arrayOf(Y, n)), out: Any = root.createMutable(d.arrayOf(X, n));
  const Ax = new (k === 'i32' ? Int32Array : Uint32Array)(n * lanes), Ay = new (yKind === 'i32' ? Int32Array : Uint32Array)(n * lanes);
  pairs.forEach(([a, b], i) => { const r = lanesRows(a, b, vec); r.x.forEach((v, l) => (Ax[i * lanes + l] = v)); r.y.forEach((v, l) => (Ay[i * lanes + l] = v)); });
  dev().queue.writeBuffer((root as Any).unwrap(bx), 0, Ax); dev().queue.writeBuffer((root as Any).unwrap(by), 0, Ay);
  try {
    const f = op.fn;
    root.createGuardedComputePipeline((i) => { 'use gpu'; out.$[i] = f(bx.$[i], by.$[i]); }).dispatchThreads(n);
    return await readRaw(out, n, k, lanes);
  } catch (e) { return pairs.map(() => `error: ${(e as Error).message.split('\n')[0]}`); }
  finally { for (const b of [bx, by, out]) b.buffer.destroy(); }
}

async function constCase(op: Op, k: Kind, vec: boolean, a: number, b: number, yKind: Kind): Promise<{ gpu: number[] | string; wgsl: string }> {
  const r = lanesRows(a, b, vec);
  const lanes = vec ? 2 : 1, schema = vec ? vSchema(k) : sc(k);
  const S: Any = sc(k), SY: Any = sc(yKind), xa = r.x[0]!, yb = r.y[0]!;
  const X = vec ? (vv(k) as Any)(...r.x) : xa, Y = vec ? (vv(yKind) as Any)(...r.y) : yb;
  const out: Any = root.createMutable(schema);
  const dv = dev(), cb = CONST_BODIES[op.name]!;
  const value = vec ? cb.vec(X, Y) : cb.scalar(X, Y, S, SY);
  try {
    const body = () => { 'use gpu'; out.$ = value(); };
    const wgsl = (() => { try { return tgpu.resolve([body as Any]).replace(/\s+/g, ' '); } catch (e) { return `resolve error: ${(e as Error).message.split('\n')[0]}`; } })();
    dv.pushErrorScope('validation');
    root.createGuardedComputePipeline(() => { 'use gpu'; out.$ = value(); }).dispatchThreads(1);
    const err = await dv.popErrorScope();
    if (err) return { gpu: `error: ${String(err.message).split('\n')[0]}`, wgsl };
    const rows = await readRaw(out, 1, k, lanes);
    return { gpu: rows[0]!, wgsl };
  } catch (e) { return { gpu: `error: ${(e as Error).message.split('\n')[0]}`, wgsl: '' }; }
  finally { out.buffer.destroy(); }
}

function cpuCase(op: Op, k: Kind, vec: boolean, a: number, b: number, yKind: Kind): number[] | string {
  const r = lanesRows(a, b, vec);
  try {
    const X = vec ? (vv(k) as Any)(...r.x) : (sc(k) as Any)(r.x[0]), Y = vec ? (vv(yKind) as Any)(...r.y) : (sc(yKind) as Any)(r.y[0]);
    const v = op.fn(X, Y);
    return vec ? Array.from(v as ArrayLike<number>) : [Number(v)];
  } catch (e) { return `threw: ${(e as Error).message.split('\n')[0]}`; }
}

interface Row { wgsl: string; op: string; type: string; a: number; b: number; oracle: number[] | null; cpu: number[] | string; runtime: number[] | string; const: number[] | string; leak: boolean; cpuWrong: boolean; runtimeWrong: boolean; constWrong: boolean }
const rows: Row[] = [];
const eq = (x: Any, y: Any) => JSON.stringify(x) === JSON.stringify(y);

describe('comptime (captured-constant) vs runtime (buffer) evaluation of integer ops', () => {
  for (const k of ['i32', 'u32'] as Kind[]) for (const vec of [true, false]) for (const op of OPS) {
    if ((vec && op.skipVec) || (!vec && op.skipScalar)) continue;
    const tname = vec ? (k === 'i32' ? 'vec2i' : 'vec2u') : k;
    it(`${op.name} ${tname}`, async () => {
      const yKind: Kind = op.shift ? 'u32' : k;
      const pairs = pairsFor(k, op);
      const runtime = await runtimeBatch(op, k, vec, pairs, yKind);
      const pick = pairs.map((p, i) => [p, i] as const).filter(([, i]) => i % 4 === 0 || pairs.length < 40);
      for (const [[a, b], i] of pick) {
        const r = lanesRows(a, b, vec);
        const lane = r.x.map((xv, l) => op.orc(k, BigInt(xv), BigInt(r.y[l]!)));
        if (lane.some((v) => v === null)) continue;
        const orcLanes = lane.map((v) => wrap(k, v!));
        const c = await constCase(op, k, vec, a, b, yKind);
        const cpu = cpuCase(op, k, vec, a, b, yKind);
        const rt = runtime[i]!;
        rows.push({ op: op.name, type: tname, a, b, oracle: orcLanes, cpu, runtime: rt, const: c.gpu,
          wgsl: c.wgsl.slice(-200), leak: !eq(c.gpu, rt), cpuWrong: !eq(cpu, orcLanes), runtimeWrong: !eq(rt, orcLanes), constWrong: !eq(c.gpu, orcLanes) });
      }
      expect(rows.length).toBeGreaterThan(0);
    }, 120000);
  }

  afterAll(() => {
    const by = new Map<string, Row[]>();
    for (const r of rows) { const key = `${r.op} | ${r.type}`; (by.get(key) ?? by.set(key, []).get(key)!).push(r); }
    const isErr = (r: Row) => typeof r.const === 'string';
    const summary = [...by.entries()].map(([key, rs]) => ({ key, cases: rs.length, cpuWrong: rs.filter((r) => r.cpuWrong).length,
      runtimeWrong: rs.filter((r) => r.runtimeWrong).length,
      constRejected: rs.filter(isErr).length,
      constSilentWrong: rs.filter((r) => !isErr(r) && r.constWrong).length,
      leaksSilent: rs.filter((r) => !isErr(r) && r.leak).length }));
    const out = fileURLToPath(new URL('./results.json', import.meta.url));
    writeFileSync(out, JSON.stringify({ summary, examples: rows.filter((r) => !(typeof r.const === 'string') && (r.constWrong || r.leak)).slice(0, 80), total: rows.length }, null, 1));
    console.log('\nCOMPTIME SUMMARY (cases | cpuWrong | runtimeWrong | rejected | silentWrong | silentLeak)');
    for (const s of summary) console.log(`${s.key.padEnd(30)} ${String(s.cases).padStart(4)} ${String(s.cpuWrong).padStart(4)} ${String(s.runtimeWrong).padStart(4)} ${String(s.constRejected).padStart(4)} ${String(s.constSilentWrong).padStart(4)} ${String(s.leaksSilent).padStart(4)}`);
  });
});
