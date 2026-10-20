import { describe, expect, it } from 'vitest';
import { vec2f, vec2h, vec3f, vec3h, vec4f, vec4h } from 'typegpu/data';
import { isCloseTo } from 'typegpu/std';
import { g, hasF16 } from '../harness.ts';

describe('exp2 (GPU)', () => {
  it('computes exp2 of a number', async () => {
    expect(await g.exp2(0)).toBeCloseTo(1);
    expect(await g.exp2(1)).toBeCloseTo(2);
    expect(await g.exp2(2)).toBeCloseTo(4);
    expect(await g.exp2(-1)).toBeCloseTo(0.5);
    expect(await g.exp2(-2)).toBeCloseTo(0.25);
  });
  it('computes exp2 of vec2f', async () => {
    expect(isCloseTo(await g.exp2(vec2f(0, 1)), vec2f(2 ** 0, 2 ** 1))).toBe(true);
  });
  it('computes exp2 of vec3f', async () => {
    expect(isCloseTo(await g.exp2(vec3f(0, 1, -1)), vec3f(2 ** 0, 2 ** 1, 2 ** -1))).toBe(true);
  });
  it('computes exp2 of vec4f', async () => {
    expect(isCloseTo(await g.exp2(vec4f(0, 1, -1, 2)), vec4f(2 ** 0, 2 ** 1, 2 ** -1, 2 ** 2))).toBe(true);
  });
  it.skipIf(!hasF16)('computes exp2 of vec2h', async () => {
    const r = await g.exp2(vec2h(0, 1));
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(2);
  });
  it.skipIf(!hasF16)('computes exp2 of vec3h', async () => {
    const r = await g.exp2(vec3h(0, 1, -1));
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(2);
    expect(r.z).toBeCloseTo(0.5);
  });
  it.skipIf(!hasF16)('computes exp2 of vec4h', async () => {
    const r = await g.exp2(vec4h(0, 1, -1, 2));
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(2);
    expect(r.z).toBeCloseTo(0.5);
    expect(r.w).toBeCloseTo(4);
  });
});
