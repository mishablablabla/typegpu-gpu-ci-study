import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from 'typegpu/data';
import { isCloseTo } from 'typegpu/std';
import { g } from '../harness.ts';

describe('log (GPU)', () => {
  it('computes natural logarithm of numeric value', async () => {
    expect(await g.log(1)).toBeCloseTo(0);
    expect(await g.log(Math.E)).toBeCloseTo(1);
    expect(await g.log(Math.E * Math.E)).toBeCloseTo(2);
    expect(await g.log(0.5)).toBeCloseTo(Math.log(0.5));
  });

  it('computes natural logarithm for vec2f', async () => {
    expect(isCloseTo(await g.log(vec2f(1, Math.E)), vec2f(0, 1))).toBe(true);
    expect(isCloseTo(await g.log(vec2f(Math.E * Math.E, 0.5)), vec2f(2, Math.log(0.5)))).toBe(true);
  });

  it('computes natural logarithm for vec3f', async () => {
    expect(isCloseTo(await g.log(vec3f(1, Math.E, Math.E * Math.E)), vec3f(0, 1, 2))).toBe(true);
  });

  it('computes natural logarithm for vec4f', async () => {
    expect(
      isCloseTo(await g.log(vec4f(1, Math.E, Math.E * Math.E, 0.5)), vec4f(0, 1, 2, Math.log(0.5))),
    ).toBe(true);
  });

  it('handles edge cases correctly', async () => {
    expect(await g.log(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(await g.log(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(await g.log(-1))).toBe(true);
  });

  it.skip('throws on invalid arguments (CPU-only signature check, n/a on GPU)', () => {});
});
