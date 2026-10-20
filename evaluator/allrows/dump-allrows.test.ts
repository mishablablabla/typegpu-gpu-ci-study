import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import { OPS } from '../../lib/ops.ts';
import { runGroup } from '../engine-allrows.ts';

const WANT = ['mod', 'log', 'log2', 'pow'];
it('dump all rows', async () => {
  const out: any = { groups: [] };
  for (const op of OPS) {
    if (op.group !== 'float' || !WANT.includes(op.name)) continue;
    for (const t of op.types) {
      if (t === 'f16' || t.endsWith('h')) continue;
      const g = await runGroup(op, t);
      out.groups.push({ op: op.name, type: t, policy: g.policy, total: g.total, pass: g.pass, fail: g.fail, knownDivergence: g.knownDivergence, investigate: g.investigate, rows: g.rows });
    }
  }
  writeFileSync(process.env.BD_OUT ?? fileURLToPath(new URL(`./allrows-${process.env.BD_LABEL ?? 'local'}.json`, import.meta.url)), JSON.stringify(out));
});
