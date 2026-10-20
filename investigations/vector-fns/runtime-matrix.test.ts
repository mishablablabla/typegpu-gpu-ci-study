import { afterAll, describe, expect, it } from 'vitest';
import { EDGE, INTS, evaluate, genRows, type Stats } from './engine.ts';
import { SPECS } from './specs.ts';
import { saveSection } from './store.ts';

const all: Stats[] = [];
describe('runtime matrix: CPU vs GPU vs oracle', () => {
  for (const spec of SPECS) for (const dim of spec.dims) {
    const type = dim === 0 ? 'f32' : `vec${dim}f`;
    it(`${spec.name}${spec.body === 'selectS' || spec.body === 'selectV' ? '' : ''}${spec.shapes[2] === 'S' && spec.name === 'mix' ? '_s' : ''} ${type}`, async () => {
      const lists = Array.isArray(spec.list)
        ? [{ tag: 'edge' as const, L: spec.list }, { tag: 'rand' as const, L: [] }]
        : [{ tag: 'edge' as const, L: EDGE }, { tag: 'int' as const, L: INTS }, { tag: 'rand' as const, L: [] }];
      const rows = genRows(spec, dim, lists, spec.shapes.length);
      const { stats } = await evaluate(spec, dim, rows);
      all.push(stats);
      expect(stats.gpuExactFail, `[WGSL] GPU exact-semantics failures; first: ${JSON.stringify(stats.examples.gpuExactFail[0])}`).toBe(0);
      expect(stats.gpuBoundFail, `[WGSL] GPU bound failures; first: ${JSON.stringify(stats.examples.gpuBoundFail[0])}`).toBe(0);
      expect(stats.cpuExactFail, `[TypeGPU] CPU exact-semantics failures; first: ${JSON.stringify(stats.examples.cpuExactFail[0])}`).toBe(0);
      for (const msg of Object.keys(stats.cpuThrowMessages)) expect(msg).toMatch(/not implemented yet|Finite Math Assumption/);
    });
  }
});
afterAll(() => saveSection('runtimeMatrix', all));
