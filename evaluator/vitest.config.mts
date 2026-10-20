import { fileURLToPath } from 'node:url';
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-oracle-extension', import.meta.url)),
  plugins: [typegpu({})],
  test: { environment: 'node', include: ['dump-bits-ext.test.ts', 'dump-bits-ext-f16.test.ts'], fileParallelism: false, testTimeout: 300000 },
});
