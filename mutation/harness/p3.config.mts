import path from 'node:path';
import { defineConfig } from 'vitest/config';
import typegpu from 'unplugin-typegpu/vite';
const W = process.env.P3_WORK!, R = path.join(W, 'repo'), P = path.join(W, 'pool'), POOL = process.env.P3_POOL!;
const T = R + '/packages/typegpu';
const srcRe = /\/repo\/packages\/typegpu\/src\//;
const pools: Record<string, { root: string; include: string[]; timeout: number; setup?: string[]; globalSetup?: string[] }> = {
  ex: { root: P + '/typegpu-examples', include: ['*.test.ts'], timeout: 1_200_000, setup: ['./setup.ts'] },
  'inv-bitops': { root: P + '/investigations/bitops', include: ['*.test.ts'], timeout: 120000, globalSetup: ['./global-teardown.ts'] },
  'inv-vector-fns': { root: P + '/investigations/vector-fns', include: ['*.test.ts'], timeout: 180000 },
  'inv-mul-paths': { root: P + '/investigations/mul-paths', include: ['*.test.ts'], timeout: 120000 },
  'inv-scalar-int': { root: P + '/investigations/scalar-int', include: ['*.test.ts'], timeout: 300000 },
  'inv-integer-mul': { root: P + '/investigations/integer-mul', include: ['reproducer.ts', 'integer-boundaries.test.ts'], timeout: 30000 },
  'inv-comptime': { root: P + '/investigations/comptime', include: ['*.test.ts'], timeout: 120000 },
  full: { root: P, include: ['*.test.ts', 'ported/*.test.ts', 'ported/auto/*.test.ts', 'diff/*.test.ts', 'selftest/*.test.ts'], timeout: 30000 },
  own: { root: P + '/own', include: ['*.test.ts'], timeout: 120000 },
};
const c = pools[POOL]; if (!c) throw new Error('unknown pool ' + POOL);
export default defineConfig({
  root: c.root,
  cacheDir: process.env.P3_CACHE ?? path.join(W, '.vite-' + POOL),
  plugins: [
    { name: 'tap', enforce: 'pre', transform(code: string, id: string) {
        if (id.endsWith('algorithms/bitonic-sort/index.ts')) return code + '\nexport const __tap = { get buffer() { return buffer; }, root, state };';
        if (id.endsWith('algorithms/mnist-inference/index.ts')) return code + '\nexport const __tap = { network, hasShaderF16, hasSubgroups, root };';
        if (id.endsWith('algorithms/jump-flood-voronoi/index.ts')) return code + '\nexport const __tap = { get resources() { return resources; }, root, get sourceIdx() { return sourceIdx; } };';
      } },
    typegpu({ include: srcRe, forceTgpuAlias: 'tgpu', earlyPruning: false }),
    typegpu({ exclude: srcRe }),
  ],
  resolve: { alias: [
    { find: /^typegpu$/, replacement: T + '/src/index.js' },
    { find: /^typegpu\/data$/, replacement: T + '/src/data/index.ts' },
    { find: /^typegpu\/std$/, replacement: T + '/src/std/index.ts' },
    { find: /^typegpu\/common$/, replacement: T + '/src/common/index.ts' },
    { find: /^typegpu\/~internal$/, replacement: T + '/src/internal.ts' },
    { find: /^typegpu\/package\.json$/, replacement: T + '/package.json' },
    { find: /^@typegpu\/(noise|sort|sdf|color|geometry)$/, replacement: R + '/packages/typegpu-$1/src/index.ts' },
    { find: /^tinyest$/, replacement: R + '/packages/tinyest/src/index.ts' },
  ] },
  server: { fs: { strict: false } },
  test: {
    environment: 'node', include: c.include, testTimeout: c.timeout, hookTimeout: 120_000, fileParallelism: false,
    setupFiles: [path.join(W, 'p3/fp-setup.ts'), ...(c.setup ?? [])], globalSetup: c.globalSetup,
  },
});
