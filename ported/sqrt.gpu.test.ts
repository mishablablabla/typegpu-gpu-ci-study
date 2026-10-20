import { describe, expect, it } from 'vitest';
import { d } from 'typegpu';
import { g } from '../harness.ts';

describe('sqrt (GPU)', () => {
  it('computes square roots of scalars and float vectors', async () => {
    expect(await g.sqrt(4)).toBe(2);
    expect(await g.sqrt(d.vec2f(4, 9))).toStrictEqual(d.vec2f(2, 3));
  });
  it.skip('throws on invalid arguments (CPU-only signature check, n/a on GPU)', () => {});
});
