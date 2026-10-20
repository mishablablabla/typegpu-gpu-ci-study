import { describe, expect, it } from 'vitest';
import { vec3f } from 'typegpu/data';
import { isCloseTo } from 'typegpu/std';
import { g } from '../harness.ts';

describe('sign (GPU)', () => {
  it('computes sign of numeric value', async () => {
    expect(await g.sign(-1000)).toBe(-1);
    expect(await g.sign(0)).toBe(0);
    expect(await g.sign(2000)).toBe(1);
  });
  it('computes sign of a numeric vector', async () => {
    expect(isCloseTo(await g.sign(vec3f(-1000, 0, 2000)), vec3f(-1, 0, 1))).toBe(true);
  });
});
