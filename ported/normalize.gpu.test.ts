import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from 'typegpu/data';
import { g } from '../harness.ts';

describe('normalize (GPU)', () => {
  it('rounds the results exactly like WGSL would', async () => {
    expect((await g.normalize(vec3f(-1.0, 4.0, -1.0))).x).toBe(-0.2357022613286972);
  });
  it('computes normalized vector from vec2f', async () => {
    expect((await g.normalize(vec2f(1, 1))).x).toBeCloseTo(Math.sqrt(2) / 2);
    expect(await g.normalize(vec2f(3, 4))).toStrictEqual(vec2f(0.6, 0.8));
  });
  it('computes normalized vector from vec3f', async () => {
    expect((await g.normalize(vec3f(1, 1, 0))).y).toBeCloseTo(Math.sqrt(2) / 2);
    expect(await g.normalize(vec3f(0, 3, 4))).toStrictEqual(vec3f(0, 0.6, 0.8));
  });
  it('computes normalized vector from vec4f', async () => {
    expect((await g.normalize(vec4f(1, 0, 1, 0))).z).toBeCloseTo(Math.sqrt(2) / 2);
    expect(await g.normalize(vec4f(0, 3, 0, 4))).toStrictEqual(vec4f(0, 0.6, 0, 0.8));
  });
  it.skip('throws on invalid arguments (CPU-only signature check, n/a on GPU)', () => {});
});
