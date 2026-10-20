import { describe, expect, it } from 'vitest';
import { d } from 'typegpu';
import { g } from '../harness.ts';

describe('clamp (GPU)', () => {
  it('clamps scalars', async () => {
    expect(await g.clamp(5, 0, 1)).toBe(1);
    expect(await g.clamp(-5, 0, 1)).toBe(0);
    expect(await g.clamp(0.5, 0, 1)).toBe(0.5);
  });
  it('clamps vectors component-wise', async () => {
    expect(await g.clamp(d.vec2f(5, -5), d.vec2f(0), d.vec2f(1))).toStrictEqual(d.vec2f(1, 0));
  });
  it.skip('throws on invalid arguments (CPU-only signature check, n/a on GPU)', () => {});
});

describe('saturate (GPU)', () => {
  it('saturates vectors component-wise', async () => {
    expect(await g.saturate(d.vec3f(-0.5, 0.25, 1.5))).toStrictEqual(d.vec3f(0, 0.25, 1));
  });
});
