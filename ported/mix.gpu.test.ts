import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4h } from 'typegpu/data';
import { g, hasF16 } from '../harness.ts';

describe('mix (GPU)', () => {
  it('should blend scalar values correctly', async () => {
    expect(await g.mix(10, 20, 0)).toBe(10);
    expect(await g.mix(10, 20, 1)).toBe(20);
    expect(await g.mix(10, 20, 0.5)).toBe(15);
  });
  it('should blend vector values with vector blending factor correctly', async () => {
    expect(await g.mix(vec2f(1, 2), vec2f(3, 4), vec2f(0, 1))).toStrictEqual(vec2f(1, 4));
  });
  it('should blend vector values with scalar blending factor correctly', async () => {
    expect(await g.mix(vec3f(1, 2, 3), vec3f(4, 5, 6), 0.5)).toStrictEqual(vec3f(2.5, 3.5, 4.5));
  });
  it.skipIf(!hasF16)('should blend higher dimension vectors correctly', async () => {
    expect(await g.mix(vec4h(0, 0, 0, 0), vec4h(1, 1, 1, 1), 0.25)).toStrictEqual(vec4h(0.25, 0.25, 0.25, 0.25));
  });
  it('should blend non-integer scalar values correctly', async () => {
    expect(await g.mix(1.5, 2.5, 0)).toBeCloseTo(1.5);
    expect(await g.mix(1.5, 2.5, 1)).toBeCloseTo(2.5);
    expect(await g.mix(1.5, 2.5, 0.3)).toBeCloseTo(1.8);
  });
  it('should blend vector values with non-integer values and blending factor correctly', async () => {
    const result = await g.mix(vec2f(1.1, 2.2), vec2f(3.3, 4.4), vec2f(0.3, 0.7));
    expect(result.x).toBeCloseTo(1.76);
    expect(result.y).toBeCloseTo(3.74);
  });
  it.skip('throws on invalid arguments (CPU-only signature check, n/a on GPU)', () => {});
});
