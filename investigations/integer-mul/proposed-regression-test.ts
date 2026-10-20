import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

const MAX = 2147483647;
const MIN = -2147483648;
const UMAX = 4294967295;
const wrapI32 = (x: bigint) => Number(BigInt.asIntN(32, x));
const wrapU32 = (x: bigint) => Number(BigInt.asUintN(32, x));

const I32_VALUES = [MAX, MIN, -1, 0, 1, 2, 65535, 65536, 46341, -2147483647, 94906265, 94906267, 134217727, 67108865];
const U32_VALUES = [UMAX, 4294967294, 2147483648, 0, 1, 2, 65536, 3037000499, 2654435761, 94906265, 94906267, 134217727];

const lanesOf = (values: number[], i: number, count: number, step: number) =>
  Array.from({ length: count }, (_, l) => values[(i + l * step) % values.length]!);

describe('mul on integer vectors wraps modulo 2^32 (like WGSL)', () => {
  it('vec2i(INT_MAX) * vec2i(INT_MAX) is 1, not 0', () => {
    expect(std.mul(d.vec2i(MAX), d.vec2i(MAX))).toStrictEqual(d.vec2i(1));
  });

  it('vec2u(UINT_MAX) * vec2u(UINT_MAX) is 1, not 0', () => {
    expect(std.mul(d.vec2u(UMAX), d.vec2u(UMAX))).toStrictEqual(d.vec2u(1));
  });

  it.each([
    ['vec2i', 2, false],
    ['vec3i', 3, false],
    ['vec4i', 4, false],
    ['vec2u', 2, true],
    ['vec3u', 3, true],
    ['vec4u', 4, true],
  ] as const)('%s: every pair of boundary values, component-wise', (name, count, unsigned) => {
    const values = unsigned ? U32_VALUES : I32_VALUES;
    const wrap = unsigned ? wrapU32 : wrapI32;
    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < values.length; j++) {
        const a = lanesOf(values, i, count, 3);
        const b = lanesOf(values, j, count, 5);
        const expected = a.map((x, l) => wrap(BigInt(x) * BigInt(b[l]!)));
        expect(Array.from(std.mul(d[name](...a), d[name](...b)))).toStrictEqual(expected);
      }
    }
  });

  it('vector * integer scalar and integer scalar * vector', () => {
    expect(std.mul(d.vec2i(MAX, 7), MAX)).toStrictEqual(d.vec2i(1, wrapI32(7n * BigInt(MAX))));
    expect(std.mul(MAX, d.vec2i(MAX, 7))).toStrictEqual(d.vec2i(1, wrapI32(7n * BigInt(MAX))));
    expect(std.mul(d.vec2u(UMAX, 7), UMAX)).toStrictEqual(d.vec2u(1, wrapU32(7n * BigInt(UMAX))));
  });

  it('the operator form `a * b` inside a GPU function behaves the same on the CPU', () => {
    const f = (a: d.v2i, b: d.v2i) => {
      'use gpu';
      return a * b;
    };
    expect(f(d.vec2i(MAX, 3), d.vec2i(MAX, 5))).toStrictEqual(d.vec2i(1, 15));
  });

  it('products that fit in 2^53 and float vectors are unchanged', () => {
    expect(std.mul(d.vec2i(94906265, -3), d.vec2i(94906265, 7))).toStrictEqual(
      d.vec2i(wrapI32(94906265n * 94906265n), -21),
    );
    const a = d.vec2f(0.1, 0.2);
    const b = d.vec2f(3, 7);
    expect(std.mul(a, b)).toStrictEqual(d.vec2f(a.x * b.x, a.y * b.y));
  });

  it('sub on integer vectors keeps wrapping correctly (implemented as add(lhs, mul(-1, rhs)))', () => {
    expect(std.sub(d.vec2i(MIN, MAX), d.vec2i(MAX, MIN))).toStrictEqual(d.vec2i(1, -1));
    expect(std.sub(d.vec2u(0, 5), d.vec2u(1, UMAX))).toStrictEqual(d.vec2u(UMAX, 6));
  });

  it('a non-integer scalar keeps the previous (truncating) behaviour', () => {
    expect(std.mul(d.vec2i(3, 4), 1.5)).toStrictEqual(d.vec2i(4, 6));
  });
});
