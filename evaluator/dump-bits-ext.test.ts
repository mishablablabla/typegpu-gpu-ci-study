import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { OPS } from '../lib/ops.ts';
import { TY } from '../lib/types.ts';
import { fround } from '../lib/num.ts';
import { runGroup } from './engine-allrows.ts';

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const f64 = new Float64Array(1), u64 = new BigUint64Array(f64.buffer);
const bits64 = (v: unknown): unknown => (typeof v === 'number' ? ((f64[0] = v), u64[0]!.toString(16).padStart(16, '0')) : v === null ? 'null' : v);
const bits = (v: unknown): unknown => (typeof v === 'number' ? ((f32[0] = v), u32[0]!.toString(16).padStart(8, '0')) : v === null ? 'null' : v);
const bitsArr = (a: unknown): unknown => (Array.isArray(a) ? a.map(bits) : a);
const WANT = (process.env.EXT_OPS ?? 'add,sub,mul,neg').split(',');
it('dump all rows (bit exact) for the extension ops', async () => {
  const out: any = { schema: 'allrows-bits-ext/2', ops: WANT, encoding: 'inputs/cpu/gpu: f32 bit pattern (8 hex); want: f64 bit pattern (16 hex); strings kept as is', groups: [] };
  for (const op of OPS) {
    if (op.group !== 'float' || !WANT.includes(op.name)) continue;
    for (const typeName of op.types) {
      if (typeName === 'f16' || typeName.endsWith('h')) continue;
      const g = await runGroup(op, typeName);
      if (g.unsupported && g.unsupported.side !== 'cpu') throw new Error(`unsupported ${op.name}/${typeName}: ${JSON.stringify(g.unsupported)}`);
      if (g.rows.length !== g.total) throw new Error(`rows not all kept for ${op.name}/${typeName}: ${g.rows.length} of ${g.total}`);
      const t = TY[typeName]!; const argTypes = op.argTypes ? op.argTypes(t) : Array(op.arity).fill(t); const fn = op.fn(t);
      let cpuMismatch = 0, cpuCompared = 0, cpuThrew = 0;
      const rows = g.rows.map((r: any) => {
        let again: number[] | string;
        try { again = t.lanesOf(fn(...argTypes.map((at: any, k: number) => at.make(r.inputs[k])))).map((x: number) => fround(x)); } catch (e) { again = `CPU threw: ${(e as Error).message.split('\n')[0]}`; }
        if (typeof r.cpu === 'string' || typeof again === 'string') { if (typeof r.cpu !== typeof again) cpuMismatch++; else if (r.cpu !== again) cpuMismatch++; cpuThrew += typeof r.cpu === 'string' ? 1 : 0; }
        else { cpuCompared++; if (r.cpu.some((x: number, l: number) => !(Object.is(x, (again as number[])[l]) || (Number.isNaN(x) && Number.isNaN((again as number[])[l]))))) cpuMismatch++; }
        return { id: r.id, inputs: r.inputs.map(bitsArr), cpu: bitsArr(r.cpu), gpu: bitsArr(r.gpu), want: Array.isArray(r.want) ? r.want.map(bits64) : r.want, status: r.status, issues: r.issues.map((i: any) => [i.lane, i.target, i.verdict]) };
      });
      out.groups.push({ op: op.name, type: typeName, unsupported: g.unsupported ?? null, policy: g.policy.id, basis: g.policy.basis, total: g.total, pass: g.pass, fail: g.fail, investigate: g.investigate, knownDivergence: g.knownDivergence, cpuRecompute: { compared: cpuCompared, threw: cpuThrew, mismatches: cpuMismatch }, rows });
    }
  }
  writeFileSync(process.env.BD_OUT!, JSON.stringify(out));
});
