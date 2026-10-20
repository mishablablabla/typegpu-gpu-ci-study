import { describe, expect, it } from 'vitest';
import { vec2f, vec3h } from 'typegpu/data';
import { g, hasF16 } from '../harness.ts';

describe('distance (GPU)', () => {
  it('computes distance between two points (f32)', async () => {
    expect(await g.distance(vec2f(0, 0), vec2f(0, 0))).toBeCloseTo(0);
    expect(await g.distance(vec2f(0, 0), vec2f(1, 0))).toBeCloseTo(1);
    expect(await g.distance(vec2f(0, 0), vec2f(0, 1))).toBeCloseTo(1);
    expect(await g.distance(vec2f(0, 0), vec2f(1, 1))).toBeCloseTo(Math.sqrt(2));
    expect(await g.distance(0, 2)).toBeCloseTo(2);
    expect(await g.distance(-233, 87)).toBeCloseTo(320);
  });
  it.skipIf(!hasF16)('computes distance between two points (f16)', async () => {
    expect(await g.distance(vec3h(0, 0, 0), vec3h(0, 0, 0))).toBeCloseTo(0);
    expect(await g.distance(vec3h(0, 0, 0), vec3h(1, 0, 0))).toBeCloseTo(1);
    expect(await g.distance(vec3h(0, 0, 0), vec3h(0, 1, 0))).toBeCloseTo(1);
    expect(await g.distance(vec3h(0, 0, 0), vec3h(0, 0, 1))).toBeCloseTo(1);
    expect(await g.distance(vec3h(0, 0, 0), vec3h(1, 1, 1))).toBeCloseTo(Math.sqrt(3));
  });
  it.skip('does not accept different types (CPU-only signature check, n/a on GPU)', () => {});
});
