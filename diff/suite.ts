import { afterAll, describe, it } from 'vitest';
import { hasF16 } from '../harness.ts';
import { formatFailures, runGroup } from '../lib/engine.ts';
import { OPS } from '../lib/ops.ts';
import { flush, recordGroup } from '../lib/report.ts';
import { TY } from '../lib/types.ts';

export function defineSuite(group: 'float' | 'int' | 'f16', reportName: string) {
  afterAll(() => flush(reportName));
  for (const op of OPS.filter((o) => o.group === group)) {
    describe(`[${op.semantics}] ${op.name}`, () => {
      for (const typeName of op.types) {
        it(typeName, async (ctx) => {
          if (TY[typeName]!.elem === 'f16' && !hasF16) {
            recordGroup({ op: op.name, type: typeName, semantics: op.semantics, policy: { id: '-', basis: '-', describe: '-' }, total: 0, pass: 0, fail: 0, knownDivergence: 0, investigate: 0,
              unsupported: { side: 'gpu', reason: 'adapter has no shader-f16' }, rows: [] });
            ctx.skip('adapter has no shader-f16');
          }
          const g = await runGroup(op, typeName);
          recordGroup(g);
          if (g.unsupported?.side === 'gpu') ctx.skip(`unsupported on GPU: ${g.unsupported.reason}`);
          if (g.fail > 0) throw new Error('\n' + formatFailures(g));
        });
      }
    });
  }
}
