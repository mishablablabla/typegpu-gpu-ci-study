import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from 'typegpu/data';
import { g } from '../harness.ts';

describe('length (GPU)', () => {
  it('computes length of vec2f', async () => {
    expect(await g.length(vec2f(0, 0))).toBe(0);
    expect(await g.length(vec2f(1, 0))).toBe(1);
    expect(await g.length(vec2f(-1, 0))).toBe(1);
    expect(await g.length(vec2f(0, 1))).toBe(1);
    expect(await g.length(vec2f(0, -1))).toBe(1);
    expect(await g.length(vec2f(3, 4))).toBe(5);
  });
  it('computes length of vec3f', async () => {
    expect(await g.length(vec3f(0, 0, 0))).toBe(0);
    expect(await g.length(vec3f(1, 0, 0))).toBe(1);
    expect(await g.length(vec3f(-1, 0, 0))).toBe(1);
    expect(await g.length(vec3f(3, 4, 0))).toBe(5);
    expect(await g.length(vec3f(1, 1, 1))).toBeCloseTo(Math.sqrt(3));
  });
  it('computes length of vec4f', async () => {
    expect(await g.length(vec4f(0, 0, 0, 0))).toBe(0);
    expect(await g.length(vec4f(1, 1, 1, 1))).toBe(2);
    expect(await g.length(vec4f(1, 0, 0, 0))).toBe(1);
    expect(await g.length(vec4f(-1, 0, 0, 0))).toBe(1);
  });
  it.skip('throws on invalid arguments (CPU-only signature check, n/a on GPU)', () => {});
});
