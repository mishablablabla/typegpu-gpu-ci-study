import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { hasF16, adapterFeatures } from '../harness.ts';
import { OPS } from '../lib/ops.ts';
import { TY } from '../lib/types.ts';
import { f16round } from '../lib/num.ts';
import { runGroup } from './engine-allrows.ts';

const f64 = new Float64Array(1), u64 = new BigUint64Array(f64.buffer);
const bits64 = (v: unknown): unknown => (typeof v === 'number' ? ((f64[0] = v), u64[0]!.toString(16).padStart(16, '0')) : v === null ? 'null' : v);
const h16 = new Float16Array(1), u16 = new Uint16Array(h16.buffer);
const bits16 = (v: unknown): unknown => (typeof v === 'number' ? ((h16[0] = v), u16[0]!.toString(16).padStart(4, '0')) : v === null ? 'null' : v);
const bitsArr16 = (a: unknown): unknown => (Array.isArray(a) ? a.map(bits16) : a);
const WANT = (process.env.EXT_OPS ?? 'add,sub,mul').split(',');
it('dump all rows (bit exact, f16) for the extension ops', async () => {
  const out: any = { schema: 'allrows-bits-ext/3-f16', ops: WANT, encoding: 'inputs/cpu/gpu: f16 bit pattern (4 hex); want: f64 bit pattern (16 hex); strings kept as is', shaderF16: { adapterHasFeature: hasF16, adapterFeatures }, groups: [] };
  if (!hasF16) throw new Error('adapter has no shader-f16: f16 group cannot run (record as capability blocker)');
  for (const op of OPS) {
    if (op.group !== 'f16' || !WANT.includes(op.name)) continue;
    for (const typeName of op.types) {
      if (!(typeName === 'f16' || typeName.endsWith('h'))) continue;
      const g = await runGroup(op, typeName);
      if (g.unsupported && g.unsupported.side !== 'cpu') throw new Error(`unsupported ${op.name}/${typeName}: ${JSON.stringify(g.unsupported)}`);
      if (g.rows.length !== g.total) throw new Error(`rows not all kept for ${op.name}/${typeName}: ${g.rows.length} of ${g.total}`);
      const t = TY[typeName]!; const argTypes = op.argTypes ? op.argTypes(t) : Array(op.arity).fill(t); const fn = op.fn(t);
      let cpuMismatch = 0, cpuCompared = 0, cpuThrew = 0;
      const rows = g.rows.map((r: any) => {
        let again: number[] | string;
        try { again = t.lanesOf(fn(...argTypes.map((at: any, k: number) => at.make(r.inputs[k])))).map((x: number) => f16round(x)); } catch (e) { again = `CPU threw: ${(e as Error).message.split('\n')[0]}`; }
        if (typeof r.cpu === 'string' || typeof again === 'string') { if (typeof r.cpu !== typeof again || r.cpu !== again) cpuMismatch++; cpuThrew += typeof r.cpu === 'string' ? 1 : 0; }
        else { cpuCompared++; if (r.cpu.some((x: number, l: number) => !(Object.is(x, (again as number[])[l]) || (Number.isNaN(x) && Number.isNaN((again as number[])[l]))))) cpuMismatch++; }
        return { id: r.id, inputs: r.inputs.map(bitsArr16), cpu: bitsArr16(r.cpu), gpu: bitsArr16(r.gpu), want: Array.isArray(r.want) ? r.want.map(bits64) : r.want, status: r.status, issues: r.issues.map((i: any) => [i.lane, i.target, i.verdict]) };
      });
      out.groups.push({ op: op.name, type: typeName, unsupported: g.unsupported ?? null, policy: g.policy.id, basis: g.policy.basis, total: g.total, pass: g.pass, fail: g.fail, investigate: g.investigate, knownDivergence: g.knownDivergence, cpuRecompute: { compared: cpuCompared, threw: cpuThrew, mismatches: cpuMismatch }, rows });
    }
  }
  writeFileSync(process.env.BD_OUT!, JSON.stringify(out));
});
