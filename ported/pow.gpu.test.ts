// Ported from packages/typegpu/tests/std/numeric/pow.test.ts
// NOTE: the original uses exact equality (toBe / toStrictEqual). On a GPU, pow() is not guaranteed
// to be bit-exact, so failures here show where the CPU tests' exactness assumption does not hold.
import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4h } from 'typegpu/data';
import { afterAll } from 'vitest';
import { g, hasF16 } from '../harness.ts';
import { flush, knownDivergence } from '../lib/report.ts';

afterAll(() => flush('ported-pow'));
const WHY = 'the source test asserts bit-exact equality; WGSL defines pow accuracy only as inherited from exp2(y*log2(x)), so GPUs need not be exact (see the pow-derived policy in diff/)';

describe('pow (GPU)', () => {
  it('should return the correct power', async () => {
    expect(await g.pow(2, 3)).toBe(8);
  });
  it('should return the correct power for vectors', async () => {
    const r = await g.pow(vec2f(2, 3), vec2f(4, 5));
    knownDivergence('pow(vec2f(2,3), vec2f(4,5)) == (16,243)', WHY, () => expect(r).toStrictEqual(vec2f(16, 243)));
  });
  it('should handle exponent zero for scalars', async () => {
    expect(await g.pow(5, 0)).toBe(1);
  });
  it('should handle exponent one for scalars', async () => {
    expect(await g.pow(7, 1)).toBe(7);
  });
  it('should return correct power for vec3f with mixed exponents', async () => {
    const r = await g.pow(vec3f(2, 3, 4), vec3f(2, 3, 0));
    knownDivergence('pow(vec3f(2,3,4), vec3f(2,3,0)) == (4,27,1)', WHY, () => expect(r).toStrictEqual(vec3f(4, 27, 1)));
  });
  it('should return correct power for float vectors with non integer values', async () => {
    const r = await g.pow(vec3f(2, 3.3, 4), vec3f(2.5, 3.5, 0.5));
    knownDivergence('pow(vec3f(2,3.3,4), vec3f(2.5,3.5,0.5)) == CPU values', WHY, () => expect(r).toStrictEqual(vec3f(2 ** 2.5, 3.3 ** 3.5, 4 ** 0.5)));
  });
  it.skipIf(!hasF16)('should return correct power for half precision vectors', async () => {
    expect(await g.pow(vec4h(2, 3, 4, 5), vec4h(2, 3, 0, 1))).toStrictEqual(vec4h(4, 27, 1, 5));
  });
  it.skip('throws on invalid arguments (CPU-only signature check, n/a on GPU)', () => {});
});
