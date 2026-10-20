import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { OPS } from '../../lib/ops.ts';
import { runGroup } from '../engine-allrows.ts';

const WANT = ['mod', 'log', 'log2', 'pow'];
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const bits = (v: unknown): unknown => (typeof v === 'number' ? ((f32[0] = v), u32[0]!.toString(16).padStart(8, '0')) : v === null ? 'null' : v);
const bitsArr = (a: unknown): unknown => (Array.isArray(a) ? a.map(bits) : a);
it('dump all rows, bit exact', async () => {
  const out: any = { schema: 'allrows-bits/1', encoding: 'f32 bit pattern, lowercase hex; non-numbers kept as is', groups: [] };
  for (const op of OPS) {
    if (op.group !== 'float' || !WANT.includes(op.name)) continue;
    for (const t of op.types) {
      if (t === 'f16' || t.endsWith('h')) continue;
      const g = await runGroup(op, t);
      out.groups.push({ op: op.name, type: t, total: g.total, pass: g.pass, fail: g.fail, investigate: g.investigate, knownDivergence: g.knownDivergence,
        rows: g.rows.map((r: any) => ({ id: r.id, inputs: r.inputs.map(bitsArr), cpu: bitsArr(r.cpu), gpu: bitsArr(r.gpu), want: bitsArr(r.want), status: r.status, issues: r.issues.map((i: any) => [i.lane, i.target, i.verdict]) })) });
    }
  }
  writeFileSync(process.env.BD_OUT!, JSON.stringify(out));
});
