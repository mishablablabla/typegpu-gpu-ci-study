import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { crossCases, compare, gpuMap, shapeCases, td, valuesOf, OFFSETS, COUNTS, O, type Any } from './lib.ts';
import { OPS } from './ops.ts';

const results: Any[] = [];
afterAll(() => { mkdirSync(new URL('./raw', import.meta.url).pathname, { recursive: true }); writeFileSync(new URL('./raw/extract-insert-overflow.json', import.meta.url).pathname, JSON.stringify(results, null, 1)); });

describe('[observation] offset+count > 32 with runtime values', () => {
  for (const name of ['std.extractBits', 'std.insertBits']) {
    const op = OPS.find((o) => o.name === name)!;
    for (const tn of ['i32', 'u32', 'vec3i', 'vec3u']) {
      it(`${name} on ${tn} (offset+count>32 region only)`, async () => {
        const t = td(tn), argTs = op.argTs(t);
        const all = shapeCases(crossCases(op.lists(t), t.lanes), argTs);
        const oracle = (a: number[]) => op.oracle(t.elem, a);
        const gpu = await gpuMap(op.fn, argTs, all, t);
        const r = compare(all, gpu, oracle, t.lanes, (args) => !(op.unverified!(args)));
        results.push({ op: name, type: tn, overflowLaneChecks: r.unverified === 0 ? r.checked : r.checked, mismatchesVsSpecFormula: r.mismatches, first: r.first });
        expect(r.checked).toBeGreaterThan(0);
      });
    }
  }
});
export { O, valuesOf, OFFSETS, COUNTS };
