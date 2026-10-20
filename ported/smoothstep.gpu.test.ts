// Ported from packages/typegpu/tests/std/numeric/smoothstep.test.ts
// NOTE: WGSL says smoothstep(edge0, edge1, x) is only defined for edge0 < edge1, so the
// "equal edges" and "reversed edges" cases are expected to be unreliable on a real GPU.
import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from 'typegpu/data';
import { isCloseTo } from 'typegpu/std';
import { afterAll } from 'vitest';
import { smoothstepGpu as smoothstep } from '../harness.ts';
import { flush, knownDivergence } from '../lib/report.ts';

afterAll(() => flush('ported-smoothstep'));
const WHY = 'WGSL: smoothstep(edge0, edge1, x) with edge0 == edge1 is an indeterminate value at runtime (and a shader-creation error for const edges); the CPU implementation returns 0';

describe('smoothstep (GPU)', () => {
  it('returns 0 when x is less than or equal to edge0', async () => {
    expect(await smoothstep(0, 1, -0.5)).toBe(0);
    expect(await smoothstep(0, 1, 0)).toBe(0);
  });
  it('returns 1 when x is greater than or equal to edge1', async () => {
    expect(await smoothstep(0, 1, 1)).toBe(1);
    expect(await smoothstep(0, 1, 1.5)).toBe(1);
  });
  it('returns smoothly interpolated value between 0 and 1 when x is between edge0 and edge1', async () => {
    expect(await smoothstep(0, 1, 0.25)).toBeCloseTo(0.15625);
    expect(await smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(await smoothstep(0, 1, 0.75)).toBeCloseTo(0.84375);
  });
  it('works with vec2f', async () => {
    expect(isCloseTo(await smoothstep(vec2f(0.3, 0.5), vec2f(0.8, 0.9), vec2f(0.1, 0.2)), vec2f(0, 0))).toBe(true);
    expect(isCloseTo(await smoothstep(vec2f(0.3, 0.5), vec2f(0.8, 0.9), vec2f(0.9, 1.0)), vec2f(1, 1))).toBe(true);
    expect(isCloseTo(await smoothstep(vec2f(0.3, 0.5), vec2f(0.8, 0.9), vec2f(0.55, 0.7)), vec2f(0.5, 0.5))).toBe(true);
    expect(isCloseTo(await smoothstep(vec2f(0.3, 0.5), vec2f(0.8, 0.9), vec2f(0.2, 0.95)), vec2f(0, 1))).toBe(true);
  });
  it('works with vec3f', async () => {
    const r = await smoothstep(vec3f(0.1, 0.2, 0.3), vec3f(0.6, 0.7, 0.8), vec3f(0.35, 0.7, 0.55));
    expect(isCloseTo(r, vec3f(0.5, 1, 0.5))).toBe(true);
  });
  it('works with vec4f', async () => {
    const r = await smoothstep(vec4f(0.0, 0.1, 0.2, 0.3), vec4f(1.0, 0.9, 0.8, 0.7), vec4f(0.0, 0.5, 0.8, 0.7));
    expect(isCloseTo(r, vec4f(0, 0.5, 1, 1))).toBe(true);
  });
  it('works with vector edges with same values for all components', async () => {
    const r = await smoothstep(vec3f(0.3, 0.3, 0.3), vec3f(0.7, 0.7, 0.7), vec3f(0.2, 0.5, 0.8));
    expect(isCloseTo(r, vec3f(0, 0.5, 1))).toBe(true);
  });
  it('handles edge case with equal edge values (undefined in WGSL)', async () => {
    for (const x of [0.4, 0.5, 0.6]) {
      const r = await smoothstep(0.5, 0.5, x);
      knownDivergence(`smoothstep(0.5, 0.5, ${x}) == 0`, WHY, () => expect(r).toBe(0));
    }
    const r = await smoothstep(vec2f(0.5, 0.3), vec2f(0.5, 0.3), vec2f(0.4, 0.3));
    knownDivergence('isCloseTo(smoothstep(equal edges vec2f), (0,1)) == false', WHY, () => expect(isCloseTo(r, vec2f(0, 1))).toBe(false));
  });
  it('handles reversed edge values (edge0 > edge1) (undefined in WGSL)', async () => {
    expect(await smoothstep(0.8, 0.2, 0.5)).toBeCloseTo(0.5);
    const r = await smoothstep(vec2f(0.8, 0.7), vec2f(0.2, 0.3), vec2f(0.5, 0.5));
    expect(isCloseTo(r, vec2f(0.5, 0.5))).toBe(true);
  });
  it('handles negative values correctly', async () => {
    expect(await smoothstep(-2, -1, -1.5)).toBeCloseTo(0.5);
    expect(await smoothstep(-10, -5, -20)).toBe(0);
    expect(await smoothstep(-10, -5, 0)).toBe(1);
    const r = await smoothstep(vec3f(-1, 0, -10), vec3f(1, 1, -5), vec3f(0, 0.5, -7.5));
    expect(isCloseTo(r, vec3f(0.5, 0.5, 0.5))).toBe(true);
  });
  it('handles very small differences between edges', async () => {
    expect(await smoothstep(0.5, 0.5001, 0.50005)).toBeCloseTo(0.5);
    const r = await smoothstep(vec2f(0.1, 0.2), vec2f(0.1001, 0.2001), vec2f(0.1, 0.20005));
    expect(isCloseTo(r, vec2f(0, 0.5))).toBe(true);
  });
  it('handles extreme values', async () => {
    expect(await smoothstep(1000, 2000, 1500)).toBeCloseTo(0.5);
    expect(await smoothstep(0.00001, 0.00002, 0.000015)).toBeCloseTo(0.5);
    const r = await smoothstep(vec3f(0.00001, 1000, 0), vec3f(0.00002, 2000, 1), vec3f(0.000015, 1500, 0.5));
    expect(isCloseTo(r, vec3f(0.5, 0.5, 0.5))).toBe(true);
  });
  it.skip('throws on invalid arguments (CPU-only signature check, n/a on GPU)', () => {});
});
