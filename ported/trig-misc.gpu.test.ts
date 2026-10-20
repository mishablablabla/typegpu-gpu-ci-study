import { describe, expect, it } from 'vitest';
import { d } from 'typegpu';
import { isCloseTo } from 'typegpu/std';
import { g, hasF16 } from '../harness.ts';

const { vec2f, vec3f, vec4f, vec3h, vec2i } = d;

describe('acos (GPU)', () => {
  it('computes acos of numeric value', async () => {
    expect(await g.acos(-1)).toBeCloseTo(Math.PI);
    expect(await g.acos(0)).toBeCloseTo(Math.PI / 2);
    expect(await g.acos(1)).toBeCloseTo(0);
  });
  it('computes acos for vectors', async () => {
    expect(isCloseTo(await g.acos(vec3f(-1, 0, 1)), vec3f(Math.PI, Math.PI / 2, 0))).toBe(true);
  });
});

describe('asin (GPU)', () => {
  it('computes asin of numeric value', async () => {
    expect(await g.asin(-1)).toBeCloseTo(-Math.PI / 2);
    expect(await g.asin(0)).toBeCloseTo(0);
    expect(await g.asin(1)).toBeCloseTo(Math.PI / 2);
  });
  it('computes asin for vectors', async () => {
    expect(isCloseTo(await g.asin(vec3f(-1, 0, 1)), vec3f(-Math.PI / 2, 0, Math.PI / 2))).toBe(true);
  });
});

describe('atan2 (GPU)', () => {
  it('computes atan2 of two values', async () => {
    expect(await g.atan2(0, 1)).toBeCloseTo(0);
    expect(await g.atan2(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(await g.atan2(0, -1)).toBeCloseTo(Math.PI);
    expect(await g.atan2(-1, 0)).toBeCloseTo(-Math.PI / 2);
  });
  it('computes atan2 for two vectors', async () => {
    const r = await g.atan2(vec4f(0, 1, 0, -1), vec4f(1, 0, -1, 0));
    expect(isCloseTo(r, vec4f(0, Math.PI / 2, Math.PI, -Math.PI / 2))).toBe(true);
  });
});

describe('acosh (GPU)', () => {
  it('computes acosh of a number', async () => {
    expect(await g.acosh(1)).toBeCloseTo(0);
    expect(await g.acosh(Math.cosh(1))).toBeCloseTo(1);
    expect(await g.acosh(Math.cosh(-1))).toBeCloseTo(1);
  });
  it('computes acosh of vec2f', async () => {
    expect(isCloseTo(await g.acosh(vec2f(1, Math.cosh(1))), vec2f(Math.acosh(1), 1))).toBe(true);
  });
  it('computes acosh of vec3f', async () => {
    expect(isCloseTo(await g.acosh(vec3f(1, Math.cosh(1), Math.cosh(-1))), vec3f(0, 1, 1))).toBe(true);
  });
  it('computes acosh of vec4f', async () => {
    expect(isCloseTo(await g.acosh(vec4f(1, Math.cosh(1), Math.cosh(-1), Math.cosh(2))), vec4f(0, 1, 1, 2))).toBe(true);
  });
});

describe('log2 (GPU)', () => {
  it('computes base-2 logarithm of numeric value', async () => {
    expect(await g.log2(1)).toBeCloseTo(0);
    expect(await g.log2(2)).toBeCloseTo(1);
    expect(await g.log2(4)).toBeCloseTo(2);
    expect(await g.log2(8)).toBeCloseTo(3);
    expect(await g.log2(16)).toBeCloseTo(4);
    expect(await g.log2(0.5)).toBeCloseTo(-1);
    expect(await g.log2(0.25)).toBeCloseTo(-2);
  });
  it('computes base-2 logarithm for vectors', async () => {
    expect(isCloseTo(await g.log2(vec2f(2, 8)), vec2f(1, 3))).toBe(true);
    expect(isCloseTo(await g.log2(vec3f(2, 4, 16)), vec3f(1, 2, 4))).toBe(true);
    expect(isCloseTo(await g.log2(vec4f(1, 2, 0.5, 0.25)), vec4f(0, 1, -1, -2))).toBe(true);
  });
  it('handles edge cases correctly', async () => {
    expect(await g.log2(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(await g.log2(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(await g.log2(-1))).toBe(true);
  });
});

describe('step (GPU)', () => {
  it('compares scalars', async () => {
    expect(await g.step(2, 3)).toBe(1);
    expect(await g.step(2, 2)).toBe(1);
    expect(await g.step(2, 1)).toBe(0);
  });
});

describe('neg (GPU)', () => {
  it('negates signed vectors', async () => {
    expect(await g.neg(vec2i(1, 2))).toEqual(vec2i(-1, -2));
    expect(await g.neg(vec2f(1, 2))).toEqual(vec2f(-1, -2));
  });
});

describe('reflect (GPU)', () => {
  it('reflects a vec2f vector correctly', async () => {
    expect(await g.reflect(vec2f(1, -1), vec2f(0, 1))).toStrictEqual(vec2f(1, 1));
  });
  it('reflects a vec3f vector correctly', async () => {
    expect(await g.reflect(vec3f(1, -1, 0), vec3f(0, 1, 0))).toStrictEqual(vec3f(1, 1, 0));
  });
  it('reflects a vec2f vector with no angle change when incident angle is zero', async () => {
    expect(await g.reflect(vec2f(3, 4), vec2f(0, 1))).toStrictEqual(vec2f(3, -4));
  });
});

describe('cross (GPU)', () => {
  it('computes cross product of two vec3f', async () => {
    expect(await g.cross(vec3f(0, 0, 0), vec3f(0, 1, 0))).toStrictEqual(vec3f());
    expect(await g.cross(vec3f(1.5, 0, 0), vec3f(1.5, 0, 0))).toStrictEqual(vec3f());
    expect(await g.cross(vec3f(-1, 1, 0), vec3f(1, 0, 1))).toStrictEqual(vec3f(1, 1, -1));
  });
  it.skipIf(!hasF16)('computes cross product of two vec3h', async () => {
    expect(await g.cross(vec3h(0, 0, 0), vec3h(0, 1, 0))).toStrictEqual(vec3h());
    expect(await g.cross(vec3h(1, 0, 0), vec3h(1, 0, 0))).toStrictEqual(vec3h());
    expect(await g.cross(vec3h(-1, 1, 0), vec3h(1, 0, 1))).toStrictEqual(vec3h(1, 1, -1));
    expect(await g.cross(vec3h(2, 2, 0), vec3h(1, 4, 1))).toStrictEqual(vec3h(2, -2, 6));
  });
});

describe('round (GPU)', () => {
  it('rounds to even numbers', async () => {
    expect(await g.round(2.4)).toBe(2);
    expect(await g.round(2.5)).toBe(2);
    expect(await g.round(2.6)).toBe(3);
    expect(await g.round(3.4)).toBe(3);
    expect(await g.round(3.5)).toBe(4);
    expect(await g.round(3.6)).toBe(4);
  });
});

describe('inverseSqrt (GPU)', () => {
  it('computes inverse square root of a number', async () => {
    expect(await g.inverseSqrt(4)).toBe(0.5);
  });
});
