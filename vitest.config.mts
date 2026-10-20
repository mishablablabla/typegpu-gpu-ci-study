import { defineConfig } from 'vitest/config';
import typegpu from 'unplugin-typegpu/vite';

export default defineConfig({
  plugins: [typegpu({})],
  test: {
    environment: 'node',
    include: ['*.test.ts', 'ported/*.test.ts', 'ported/auto/*.test.ts', 'diff/*.test.ts', 'selftest/*.test.ts'],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
