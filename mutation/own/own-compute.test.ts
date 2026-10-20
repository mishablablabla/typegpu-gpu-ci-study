import { describe, expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { srgbToLinear } from '@typegpu/color';
import { opSmoothUnion } from '@typegpu/sdf';
import { root, run, T } from '../harness.ts';

describe('own: std / codegen', () => {
  it('M36 atomicSub: 30 threads each subtract 1 from an atomic<u32> holding 100', async () => {
    const counter = root.createMutable(d.atomic(d.u32));
    counter.write(100);
    root.createGuardedComputePipeline(() => { 'use gpu'; std.atomicSub(counter.$, 1); }).dispatchThreads(30);
    expect(await counter.read()).toBe(70);
    counter.buffer.destroy();
  });
  it('M40 srgbToLinear matches the sRGB EOTF (gamma 2.4 piecewise)', async () => {
    const v = d.vec3f(0.5, 0.25, 0.9);
    const got = await run((a: any) => { 'use gpu'; return srgbToLinear(a); }, [v]);
    const ref = [0.5, 0.25, 0.9].map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(ref[i]!, 5);
  });
  it('M41 opSmoothUnion matches the quadratic smooth-min polynomial', async () => {
    const got = await run((a: any, b: any, k: any) => { 'use gpu'; return opSmoothUnion(a, b, k); }, [T(d.f32, 1.0), T(d.f32, 1.25), T(d.f32, 1.0)], d.f32);
    const h = Math.max(1 - Math.abs(1.0 - 1.25), 0) / 1; expect(got).toBeCloseTo(Math.min(1.0, 1.25) - h * h * 1 * 0.25, 6);
  });
  it('M45 rotationY4 rotates +x by +90 degrees about y onto -z (right-handed)', async () => {
    const got = await run((a: any) => { 'use gpu'; return std.mul(std.rotationY4(a), d.vec4f(1, 0, 0, 1)); }, [T(d.f32, Math.PI / 2)], d.vec4f);
    expect(got.x).toBeCloseTo(0, 5); expect(got.y).toBeCloseTo(0, 5); expect(got.z).toBeCloseTo(-1, 5); expect(got.w).toBeCloseTo(1, 5);
  });
  it('M03 tgpu.unroll(std.range(-3, 0)) unrolls three iterations (range ends at 0)', async () => {
    const got = await run(() => { 'use gpu'; let r = 0; for (const i of tgpu.unroll(std.range(-3, 0))) { r += i; } return r; }, [], d.i32);
    expect(got).toBe(-6);
  });
  it('M31 for-of over std.range(4) runs exactly 4 iterations', async () => {
    const c = await run(() => { 'use gpu'; let r = 0; for (const _i of std.range(4)) { r += 1; } return r; }, [], d.i32);
    expect(c).toBe(4);
  });
  it('M07 an integer-valued f32 literal >= 2^63 (FLT_MAX) compiles and round-trips', async () => {
    const got = await run(() => { 'use gpu'; return d.f32(3.4028234663852886e38); }, [], d.f32);
    expect(got).toBe(Math.fround(3.4028234663852886e38));
  });
  it('M17 resource named like a WGSL template enumerant (read) next to a read-only storage buffer', async () => {
    const a = root.createMutable(d.u32, 7).$name('read'); const b = root.createReadonly(d.u32, 5); const o = root.createMutable(d.u32);
    root.createGuardedComputePipeline(() => { 'use gpu'; o.$ = a.$ + b.$; }).dispatchThreads(1);
    expect(await o.read()).toBe(12);
  });
});
