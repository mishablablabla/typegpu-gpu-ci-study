import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import typegpu from 'unplugin-typegpu/vite';
const here = path.dirname(fileURLToPath(import.meta.url));
const NM = path.resolve(here, '../node_modules'), V = path.join(here, 'vendor/packages');
export default defineConfig({
  root: here,
  cacheDir: path.join(NM, '.vite-typegpu-examples'),
  plugins: [
    { name: 'tap', enforce: 'pre', transform(code: string, id: string) {
        if (id.endsWith('algorithms/bitonic-sort/index.ts')) return code + '\nexport const __tap = { get buffer() { return buffer; }, root, state };';
        if (id.endsWith('algorithms/mnist-inference/index.ts')) return code + '\nexport const __tap = { network, hasShaderF16, hasSubgroups, root };';
        if (id.endsWith('algorithms/jump-flood-voronoi/index.ts')) return code + '\nexport const __tap = { get resources() { return resources; }, root, get sourceIdx() { return sourceIdx; } };';
      } },
    typegpu({}),
  ],
  resolve: { alias: [
    { find: /^@typegpu\/noise$/, replacement: V + '/typegpu-noise/src/index.ts' },
    { find: /^@typegpu\/sort$/, replacement: V + '/typegpu-sort/src/index.ts' },
    { find: /^@typegpu\/sdf$/, replacement: V + '/typegpu-sdf/src/index.ts' },
    { find: /^typegpu$/, replacement: NM + '/typegpu/index.js' },
    { find: /^typegpu\/(.*)$/, replacement: NM + '/typegpu/$1/index.js' },
  ] },
  server: { fs: { strict: false } },
  test: { environment: 'node', include: ['*.test.ts'], testTimeout: 1_200_000, hookTimeout: 120_000, fileParallelism: false, setupFiles: ['./setup.ts'] },
});
