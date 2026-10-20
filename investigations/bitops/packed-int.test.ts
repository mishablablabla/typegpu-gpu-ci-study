import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { root } from '../../harness.ts';
import { cpuMap, gpuMap, td, UINT_MAX, INT_MIN, INT_MAX, oneLine, type Any } from './lib.ts';

const OUT: Any[] = [];
afterAll(() => { mkdirSync(new URL('./raw', import.meta.url).pathname, { recursive: true }); writeFileSync(new URL('./raw/packed-int.json', import.meta.url).pathname, JSON.stringify(OUT, null, 1)); });

const u8 = (x: number, i: number) => (x >>> (8 * i)) & 0xff;
const i8 = (x: number, i: number) => (u8(x, i) << 24) >> 24;
const oracle = {
  pack4xI8: (v: number[]) => v.reduce((acc, c, i) => acc + (Number(BigInt.asUintN(8, BigInt(c))) << (8 * i)) * 1, 0) >>> 0,
  pack4xU8: (v: number[]) => v.reduce((acc, c, i) => acc + Number(BigInt.asUintN(8, BigInt(c))) * 2 ** (8 * i), 0),
  pack4xI8Clamp: (v: number[]) => oracle.pack4xI8(v.map((c) => Math.min(127, Math.max(-128, c)))),
  pack4xU8Clamp: (v: number[]) => oracle.pack4xU8(v.map((c) => Math.min(255, Math.max(0, c)))),
  unpack4xI8: (x: number) => [0, 1, 2, 3].map((i) => i8(x, i)),
  unpack4xU8: (x: number) => [0, 1, 2, 3].map((i) => u8(x, i)),
  dot4U8Packed: (a: number, b: number) => [0, 1, 2, 3].reduce((s, i) => s + u8(a, i) * u8(b, i), 0),
  dot4I8Packed: (a: number, b: number) => [0, 1, 2, 3].reduce((s, i) => s + i8(a, i) * i8(b, i), 0),
};
const f = {
  pack4xI8: (a: Any) => { 'use gpu'; return std.pack4xI8(a); }, pack4xU8: (a: Any) => { 'use gpu'; return std.pack4xU8(a); },
  pack4xI8Clamp: (a: Any) => { 'use gpu'; return std.pack4xI8Clamp(a); }, pack4xU8Clamp: (a: Any) => { 'use gpu'; return std.pack4xU8Clamp(a); },
  unpack4xI8: (a: Any) => { 'use gpu'; return std.unpack4xI8(a); }, unpack4xU8: (a: Any) => { 'use gpu'; return std.unpack4xU8(a); },
  dot4U8Packed: (a: Any, b: Any) => { 'use gpu'; return std.dot4U8Packed(a, b); }, dot4I8Packed: (a: Any, b: Any) => { 'use gpu'; return std.dot4I8Packed(a, b); },
};
const IV = [0, 1, -1, 127, 128, -128, -129, 255, 256, -256, 0x7fff, INT_MAX, INT_MIN, 100000, -100000, 0x12345678];
const UV = [0, 1, 127, 128, 255, 256, 65535, 0x7fffffff, 0x80000000, UINT_MAX, 0x12345678, 1000];
const WORDS = [0, 1, 0x7f, 0x80, 0xff, 0x01020304, 0x80ff7f01, 0xdeadbeef, UINT_MAX, 0x7f7f7f7f, 0x80808080, 0xff00ff00];
const quads = (vals: number[]) => { const out: number[][] = []; for (let i = 0; i < vals.length; i++) out.push([0, 1, 2, 3].map((k) => vals[(i + k * 5) % vals.length]!)); for (const a of vals) out.push([a, a, a, a]); return out; };

interface Spec { name: keyof typeof f; argTs: string[]; outT: string; cases: number[][][]; ora: (args: number[][]) => number[] }
const SPECS: Spec[] = [
  { name: 'pack4xI8', argTs: ['vec4i'], outT: 'u32', cases: quads(IV).map((q) => [q]), ora: ([q]) => [oracle.pack4xI8(q!)] },
  { name: 'pack4xI8Clamp', argTs: ['vec4i'], outT: 'u32', cases: quads(IV).map((q) => [q]), ora: ([q]) => [oracle.pack4xI8Clamp(q!)] },
  { name: 'pack4xU8', argTs: ['vec4u'], outT: 'u32', cases: quads(UV).map((q) => [q]), ora: ([q]) => [oracle.pack4xU8(q!)] },
  { name: 'pack4xU8Clamp', argTs: ['vec4u'], outT: 'u32', cases: quads(UV).map((q) => [q]), ora: ([q]) => [oracle.pack4xU8Clamp(q!)] },
  { name: 'unpack4xI8', argTs: ['u32'], outT: 'vec4i', cases: WORDS.map((w) => [[w]]), ora: ([[w]]) => oracle.unpack4xI8(w!) },
  { name: 'unpack4xU8', argTs: ['u32'], outT: 'vec4u', cases: WORDS.map((w) => [[w]]), ora: ([[w]]) => oracle.unpack4xU8(w!) },
  { name: 'dot4U8Packed', argTs: ['u32', 'u32'], outT: 'u32', cases: WORDS.flatMap((a) => WORDS.map((b) => [[a], [b]])), ora: ([[a], [b]]) => [oracle.dot4U8Packed(a!, b!)] },
  { name: 'dot4I8Packed', argTs: ['u32', 'u32'], outT: 'i32', cases: WORDS.flatMap((a) => WORDS.map((b) => [[a], [b]])), ora: ([[a], [b]]) => [oracle.dot4I8Packed(a!, b!)] },
];

describe('[runtime] packed integer functions: CPU vs GPU vs BigInt oracle', () => {
  for (const s of SPECS) {
    it(`${s.name}`, async () => {
      const argTs = s.argTs.map(td), outT = td(s.outT);
      const want = s.cases.map((c) => s.ora(c));
      const gpu = await gpuMap(f[s.name], argTs, s.cases, outT);
      const gpuBad = gpu.filter((g, i) => g.some((v, k) => v !== want[i]![k]));
      const cpu = cpuMap(f[s.name], argTs, s.cases, outT.lanes);
      const threw = cpu.filter((r) => r.threw);
      const cpuBad = cpu.filter((r, i) => r.lanes && r.lanes.some((v, k) => v !== want[i]![k]));
      const cpuRange = cpu.filter((r) => r.lanes && s.outT === 'u32' && r.lanes.some((v) => v < 0 || v > UINT_MAX)).length;
      OUT.push({ fn: s.name, cases: s.cases.length, gpuMismatch: gpuBad.length, gpuFirst: gpuBad.slice(0, 2), cpu: threw.length === cpu.length ? `throws: ${threw[0]!.threw}` : { mismatch: cpuBad.length, threwCases: threw.length, outOfRange: cpuRange, firstBad: cpuBad.slice(0, 2).map((r) => r.lanes), cases: cpuBad.slice(0, 2).map((r) => s.cases[cpu.indexOf(r)]) } });
      expect(gpuBad.length, JSON.stringify(gpuBad.slice(0, 2))).toBe(0);
    });
  }
});

describe('[constants] packed integer functions with captured constants', () => {
  it('fold / const-eval agree with the oracle (spot check of 6 inputs each)', async () => {
    const res: Any[] = [];
    for (const s of SPECS) {
      const picks = s.cases.filter((_, i) => i % Math.ceil(s.cases.length / 6) === 0).slice(0, 6);
      for (const c of picks) {
        const caps = s.argTs.map((tn, i) => (td(tn).lanes === 1 ? c[i]![0]! : (d as Any)[tn](...c[i]!)));
        const schemas = s.argTs.map((tn) => (d as Any)[tn]);
        const fn = f[s.name];
        const body = caps.length === 1 ? () => { 'use gpu'; return fn(schemas[0](caps[0])); } : () => { 'use gpu'; return fn(schemas[0](caps[0]), schemas[1](caps[1])); };
        const outT = td(s.outT);
        const out: Any = root.createMutable(outT.schema);
        let status = 'ok', got: number[] = [], wgsl = '';
        try {
          wgsl = oneLine(tgpu.resolve([(() => { 'use gpu'; out.$ = body(); }) as Any]));
          (root.device as Any).pushErrorScope('validation');
          root.createGuardedComputePipeline(() => { 'use gpu'; out.$ = body(); }).dispatchThreads(1);
          const err = await (root.device as Any).popErrorScope();
          if (err) status = 'dawn rejected: ' + String(err.message).split('\n')[0];
          else { const v = await out.read(); got = outT.lanes === 1 ? [Number(v)] : Array.from(v as ArrayLike<number>); }
        } catch (e) { status = 'threw: ' + String((e as Error).message).split('\n')[0]; }
        out.buffer.destroy();
        const want = s.ora(c);
        const ok = status === 'ok' && got.every((v, k) => v === want[k]);
        res.push({ fn: s.name, args: c, status, got, want, ok, wgsl: wgsl.slice(-100) });
      }
    }
    OUT.push({ constPath: res.map((r) => ({ fn: r.fn, ok: r.ok, status: r.status, args: r.args, got: r.got, want: r.want, wgsl: r.wgsl })).filter((r) => !r.ok).slice(0, 12), constChecked: res.length, constWrongOrRejected: res.filter((r) => !r.ok).length });
    expect(res.filter((r) => r.status === 'ok' && !r.ok), JSON.stringify(res.filter((r) => r.status === 'ok' && !r.ok).slice(0, 3))).toEqual([]);
  });
});
