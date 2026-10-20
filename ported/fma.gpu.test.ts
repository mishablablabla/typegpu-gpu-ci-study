import { describe, expect, it } from 'vitest';
import { g } from '../harness.ts';

describe('fma (GPU)', () => {
  it('computes e1 * e2 + e3 for scalars', async () => {
    expect(await g.fma(2, 3, 4)).toBe(10);
  });
  it.skip('throws on invalid arguments (CPU-only signature check, n/a on GPU)', () => {});
});
