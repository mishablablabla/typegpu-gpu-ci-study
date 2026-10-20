import { describe, expect, it } from 'vitest';
import { vec2f, vec3f } from 'typegpu/data';
import { g } from '../harness.ts';

describe('dot (GPU)', () => {
  it('computes dot product of two vec2f', async () => {
    expect(await g.dot(vec2f(0, 0), vec2f(0, 0))).toBe(0);
    expect(await g.dot(vec2f(1, 0), vec2f(1, 0))).toBe(1);
    expect(await g.dot(vec2f(-1, 1), vec2f(1, 0))).toBe(-1);
  });
  it('computes dot product of two vec3f', async () => {
    expect(await g.dot(vec3f(0, 0, 0), vec3f(0, 1, 0))).toBe(0);
    expect(await g.dot(vec3f(1, 0, 0), vec3f(1, 0, 0))).toBe(1);
    expect(await g.dot(vec3f(-1, 1, 0), vec3f(1, 0, 1))).toBe(-1);
  });
  it('dot of the same vec2f is its length squared', async () => {
    const v1 = vec2f(2, 2);
    const v2 = vec2f(-1, 1);
    expect(await g.dot(v1, v1)).toBe(8);
    expect(await g.dot(v2, v2)).toBe(2);
  });
  it.skip('throws on invalid arguments (CPU-only signature check, n/a on GPU)', () => {});
});
