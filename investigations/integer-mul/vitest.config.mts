import { fileURLToPath } from 'node:url';
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite-integer-mul', import.meta.url)),
  plugins: [typegpu({})],
  test: { environment: 'node', include: ['reproducer.ts', 'integer-boundaries.test.ts'], fileParallelism: false, testTimeout: 30000 },
});
