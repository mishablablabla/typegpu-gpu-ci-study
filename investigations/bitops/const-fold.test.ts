import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { tgpu, d } from 'typegpu';
import { root } from '../../harness.ts';
import { bits, cpuMap, crossCases, inRange, oneLine, shapeCases, td, type Any, type TD } from './lib.ts';
import { OPS, type OpDef } from './ops.ts';
import { CONST_BODIES } from './const-bodies.ts';

const dev = () => root.device as Any;
const OUT: Any[] = [];
afterAll(() => { mkdirSync(new URL('./raw', import.meta.url).pathname, { recursive: true }); writeFileSync(new URL('./raw/const-fold.json', import.meta.url).pathname, JSON.stringify(OUT, null, 1)); });

function specConstError(op: OpDef, e: 'i32' | 'u32', a: number[]): string | undefined {
  const n = op.name;
  if (['a <<= s', 'a >>= s', 'a >>>= s'].includes(n) && a[1]! >= 32) return 'shift amount >= bit width';
  if (['a << s', 'a >> s', 'a >>> s', 'std.bitShiftLeft', 'std.bitShiftRight'].includes(n)) {
    const [x, s] = a as [number, number];
    if (s >= 32) return 'shift amount >= bit width';
    if (n === 'a << s' || n === 'std.bitShiftLeft') {
      const u = bits(x);
      if (e === 'u32') { if (s > 0 && (u >> BigInt(32 - s)) !== 0n) return 'shl overflow (unsigned)'; }
      else { const top = u >> BigInt(31 - s); if (top !== 0n && top !== (1n << BigInt(s + 1)) - 1n) return 'shl overflow (signed)'; }
    }
  }
  if ((n === 'std.extractBits' && a[1]! + a[2]! > 32) || (n === 'std.insertBits' && a[2]! + a[3]! > 32)) return 'offset + count > 32';
  if (n === 'std.clamp' && a[1]! > a[2]!) return 'low > high';
  return undefined;
}

async function gpuConst(body: () => unknown, t: TD): Promise<{ value?: number[]; error?: string; wgsl: string }> {
  const out: Any = root.createMutable(t.schema);
  let wgsl = '';
  try { wgsl = oneLine(tgpu.resolve([(() => { 'use gpu'; out.$ = body(); }) as Any])); } catch (e) { return { error: 'resolve: ' + String((e as Error).message).split('\n').filter((l) => l.trim()).slice(-1)[0], wgsl }; }
  try {
    dev().pushErrorScope('validation');
    const pipe = root.createGuardedComputePipeline(() => { 'use gpu'; out.$ = body(); });
    pipe.dispatchThreads(1);
    const err = await dev().popErrorScope();
    if (err) return { error: 'dawn: ' + String(err.message).split('\n')[0], wgsl };
    const v = await out.read();
    return { value: t.lanes === 1 ? [Number(v)] : Array.from(v as ArrayLike<number>), wgsl };
  } catch (e) { return { error: 'throw: ' + String((e as Error).message).split('\n')[0], wgsl }; }
  finally { out.buffer.destroy(); }
}

const TYPES = ['i32', 'u32', 'vec3i', 'vec3u'];
describe('[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle', () => {
  for (const op of OPS) {
    const builder = CONST_BODIES[op.name];
    for (const tn of TYPES.filter((x) => op.types.includes(x))) {
      it(`${op.name} on ${tn}`, async () => {
        expect(builder, `no const body for ${op.name}`).toBeTruthy();
        const t = td(tn), argTs = op.argTs(t);
        const cases = shapeCases(crossCases(op.lists(t), t.lanes, 36), argTs);
        const tally = { ok: 0, wrong: 0, rejectedExpected: 0, rejectedUnexpected: 0, acceptedAlthoughSpecError: 0, folded: 0, emittedCall: 0 };
        const examples: Any = { wrong: [], rejectedUnexpected: [], acceptedAlthoughSpecError: [], rejectedExpected: [] };
        const errKinds: Record<string, number> = {};
        let sampleWgsl = '';
        for (const c of cases) {
          const caps = argTs.map((at, i) => (at.lanes === 1 ? c[i]![0]! : (d as Any)[at.name](...c[i]!)));
          const wr = argTs.map((at) => at.schema);
          const body = builder!(caps[0], caps[1], caps[2], caps[3], wr[0], wr[1], wr[2], wr[3]);
          const r = await gpuConst(body, t);
          if (!sampleWgsl) sampleWgsl = r.wgsl;
          const laneArgs = (l: number) => c.map((a) => (a.length === 1 ? a[0]! : a[l]!));
          const want = Array.from({ length: t.lanes }, (_, l) => op.oracle(t.elem, laneArgs(l)));
          const specErr = Array.from({ length: t.lanes }, (_, l) => specConstError(op, t.elem as Any, laneArgs(l))).find(Boolean);
          const argDesc = c.map((a) => a.slice());
          if (r.error) {
            const ek = r.error.replace(/\d+[iu]?/g, 'N').slice(0, 110); errKinds[`${specErr ?? 'no spec error'} :: ${ek}`] = (errKinds[`${specErr ?? 'no spec error'} :: ${ek}`] ?? 0) + 1;
            if (specErr) { tally.rejectedExpected++; if (examples.rejectedExpected.length < 2) examples.rejectedExpected.push({ args: argDesc, specErr, error: r.error }); }
            else { tally.rejectedUnexpected++; if (examples.rejectedUnexpected.length < 4) examples.rejectedUnexpected.push({ args: argDesc, error: r.error, wgsl: r.wgsl.slice(-120) }); }
            continue;
          }
          const got = r.value!;
          const returnLine = r.wgsl.replace(/^.*?return /, 'return ');
          const emitsCall = /[a-zA-Z]+\(.*\)|[&|^~]|<<|>>/.test(returnLine.replace(/\b(vec[234][iuf])\(/g, '').replace(/^return /, '')) && !/^return (-?\d+[iu]?|vec\d[iu]\([-\d, ]+\));/.test(returnLine);
          if (emitsCall) tally.emittedCall++; else tally.folded++;
          if (specErr) { tally.acceptedAlthoughSpecError++; if (examples.acceptedAlthoughSpecError.length < 4) examples.acceptedAlthoughSpecError.push({ args: argDesc, specErr, got, wgsl: returnLine.slice(0, 100) }); }
          if (got.every((v, i) => v === want[i])) { if (!specErr) tally.ok++; } else { tally.wrong++; if (examples.wrong.length < 4) examples.wrong.push({ args: argDesc, got, want, wgsl: returnLine.slice(0, 100) }); }
        }
        OUT.push({ op: op.name, type: tn, cases: cases.length, ...tally, errKinds, sampleWgsl: sampleWgsl.slice(-160), examples });
        expect(tally.wrong, JSON.stringify(examples.wrong)).toBe(0);
      });
    }
  }
});
export { inRange, cpuMap };
