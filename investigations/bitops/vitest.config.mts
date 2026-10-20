import { fileURLToPath } from 'node:url';
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite-bitops', import.meta.url)),
  plugins: [typegpu({})],
  test: { globalSetup: [fileURLToPath(new URL('./global-teardown.ts', import.meta.url))], environment: 'node', include: ['*.test.ts'], fileParallelism: false, testTimeout: 120000 },
});
