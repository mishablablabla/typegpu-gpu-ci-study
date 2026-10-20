import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from 'typegpu/data';
import { isCloseTo } from 'typegpu/std';
import { g } from '../harness.ts';

describe('cosh (GPU)', () => {
  it('computes cosh of a number', async () => {
    expect(await g.cosh(0)).toBeCloseTo(1);
    expect(await g.cosh(1)).toBeCloseTo(Math.cosh(1));
    expect(await g.cosh(-1)).toBeCloseTo(Math.cosh(-1));
  });
  it('computes cosh of vec2f', async () => {
    expect(isCloseTo(await g.cosh(vec2f(0, 1)), vec2f(Math.cosh(0), Math.cosh(1)))).toBe(true);
  });
  it('computes cosh of vec3f', async () => {
    expect(isCloseTo(await g.cosh(vec3f(0, 1, -1)), vec3f(Math.cosh(0), Math.cosh(1), Math.cosh(-1)))).toBe(true);
  });
  it('computes cosh of vec4f', async () => {
    expect(
      isCloseTo(await g.cosh(vec4f(0, 1, -1, 2)), vec4f(Math.cosh(0), Math.cosh(1), Math.cosh(-1), Math.cosh(2))),
    ).toBe(true);
  });
});
