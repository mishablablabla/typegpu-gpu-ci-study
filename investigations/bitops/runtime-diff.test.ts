import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { crossCases, compare, cpuMap, gpuMap, inRange, shapeCases, td, type Any } from './lib.ts';
import { OPS } from './ops.ts';

const results: Any[] = [];
afterAll(() => { mkdirSync(new URL('./raw', import.meta.url).pathname, { recursive: true }); writeFileSync(new URL('./raw/runtime-diff.json', import.meta.url).pathname, JSON.stringify(results, null, 1)); });

describe('[runtime] CPU vs GPU vs BigInt oracle', () => {
  for (const op of OPS) {
    for (const tn of op.types) {
      const t = td(tn);
      it(`${op.name} on ${tn}`, async () => {
        const argTs = op.argTs(t);
        const cases = shapeCases(crossCases(op.lists(t), t.lanes), argTs);
        const outT = op.outT?.(t) ?? t;
        const oracle = (args: number[]) => op.oracle(t.elem, args);
        const skip = op.unverified;

        const gpu = await gpuMap(op.fn, argTs, cases, outT);
        const g = compare(cases, gpu, oracle, t.lanes, skip);

        const cpu = cpuMap(op.fn, argTs, cases, t.lanes);
        const threw = cpu.filter((r) => r.threw);
        const c = threw.length === cpu.length ? undefined : compare(cases, cpu.map((r) => r.lanes), oracle, t.lanes, skip);
        const outOfRange = cpu.filter((r) => r.lanes && r.lanes.some((v) => !inRange(t.elem, v))).length;
        const wrongKind = t.lanes > 1 ? cpu.filter((r) => r.lanes && r.kind !== t.name).length : 0;
        const jsTypes = [...new Set(cpu.map((r) => r.jsType))];
        results.push({
          op: op.name, type: tn, cases: cases.length, laneChecks: g.checked, unverifiedLanes: g.unverified,
          gpu: { mismatches: g.mismatches, first: g.first },
          cpu: threw.length === cpu.length ? { status: 'throws', message: threw[0]!.threw } : { status: 'computes', mismatches: c!.mismatches, outOfTypeRange: outOfRange, wrongVectorKind: wrongKind, jsTypes, first: c!.first, threwCases: threw.length },
        });
        expect(g.mismatches, JSON.stringify(g.first)).toBe(0);
        expect(g.checked).toBeGreaterThan(0);
      });
    }
  }
});
