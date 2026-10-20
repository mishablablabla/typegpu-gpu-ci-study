import { describe, expect, it } from 'vitest';
import { tgpu, d, std } from 'typegpu';
import { run, T } from '../harness.ts';

type Any = any;

describe('min / max (same tgpu.fn on CPU and GPU)', () => {
  it('min: one, two and four arguments', async () => {
    const min1 = tgpu.fn([d.f32], d.f32)((a: number) => { 'use gpu'; return std.min(a); });
    const min2 = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => { 'use gpu'; return std.min(a, b); });
    const min4 = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((a, b, c, e) => { 'use gpu'; return std.min(a, b, c, e); });
    expect(min1(6)).toBe(6);
    expect(await run(min1, [6], d.f32)).toBe(6);
    expect(min2(1, 2)).toBe(1);
    expect(await run(min2, [1, 2], d.f32)).toBe(1);
    expect(min4(2, 1, 4, 5)).toBe(1);
    expect(await run(min4, [2, 1, 4, 5], d.f32)).toBe(1);
  });

  it('max: two and four arguments, vec3u', async () => {
    const max2 = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => { 'use gpu'; return std.max(a, b); });
    const max4 = tgpu.fn([d.f32, d.f32, d.f32, d.f32], d.f32)((a, b, c, e) => { 'use gpu'; return std.max(a, b, c, e); });
    const maxV = tgpu.fn([d.vec3u, d.vec3u], d.vec3u)((a, b) => { 'use gpu'; return std.max(a, b); });
    expect(max2(1, 2)).toBe(2);
    expect(await run(max2, [1, 2], d.f32)).toBe(2);
    expect(max4(2, 1, 4, 5)).toBe(5);
    expect(await run(max4, [2, 1, 4, 5], d.f32)).toBe(5);
    expect(maxV(d.vec3u(1, 2, 3), d.vec3u(3, 2, 1))).toStrictEqual(d.vec3u(3, 2, 3));
    expect(await run(maxV, [d.vec3u(1, 2, 3), d.vec3u(3, 2, 1)], d.vec3u)).toStrictEqual(d.vec3u(3, 2, 3));
  });
});

describe('intdiv (CPU vs GPU, runtime operands)', () => {
  const idiv = (outS: Any) => (a: Any, b: Any) => run((x: Any, y: Any) => { 'use gpu'; return std.intdiv(x, y); }, [a, b], outS);
  it('i32 truncates toward zero', async () => {
    for (const [a, b, want] of [[101, 10, 10], [-12, 5, -2], [-7, 2, -3], [7, -2, -3], [7, 2, 3]]) {
      expect(await idiv(d.i32)(T(d.i32, a!), T(d.i32, b!))).toBe(want);
      expect(std.intdiv(a!, b!)).toBe(want);
    }
  });
  it('u32 floors', async () => {
    for (const [a, b, want] of [[101, 10, 10], [7, 2, 3], [0, 5, 0]]) {
      expect(await idiv(d.u32)(T(d.u32, a!), T(d.u32, b!))).toBe(want);
    }
  });
});

describe('bit shifts: GPU vs JS operator semantics', () => {
  const shl = (outS: Any, a: Any, b: Any) => run((x: Any, y: Any) => { 'use gpu'; return x << y; }, [a, b], outS);
  const shr = (outS: Any, a: Any, b: Any) => run((x: Any, y: Any) => { 'use gpu'; return x >> y; }, [a, b], outS);

  it('i32: shift left / arithmetic shift right', async () => {
    for (const x of [256, -256, 1, -1, 2147483647, -2147483648]) {
      for (const s of [0, 1, 4, 31]) {
        expect(await shl(d.i32, T(d.i32, x), T(d.u32, s)), `${x} << ${s}`).toBe((x << s) | 0);
        expect(await shr(d.i32, T(d.i32, x), T(d.u32, s)), `${x} >> ${s}`).toBe(x >> s);
      }
    }
  });

  it('u32: shift left / logical shift right', async () => {
    for (const x of [1, 255, 4294967295, 2147483648]) {
      for (const s of [0, 1, 4, 31]) {
        expect(await shl(d.u32, T(d.u32, x), T(d.u32, s)), `${x} << ${s}`).toBe((x << s) >>> 0);
        expect(await shr(d.u32, T(d.u32, x), T(d.u32, s)), `${x} >> ${s}`).toBe(x >>> s);
      }
    }
  });

  it('shift amounts >= 32 behave like JS (amount mod 32)', async () => {
    for (const s of [32, 33, 40]) {
      expect(await shl(d.u32, T(d.u32, 1), T(d.u32, s)), `1 << ${s}`).toBe((1 << s) >>> 0);
      expect(await shr(d.u32, T(d.u32, 256), T(d.u32, s)), `256 >> ${s}`).toBe(256 >>> s);
    }
  });
});
