import { describe, expect, it } from 'vitest';
import { d } from 'typegpu';
import { createBitonicSorter } from '@typegpu/sort';
import { root, hasF16 } from '../harness.ts';

async function roundTrip<T extends d.AnyWgslData>(schema: T, value: any) {
  const inp = root.createMutable(schema, value); const out = root.createMutable(schema);
  const copy: any = schema; root.createGuardedComputePipeline(() => { 'use gpu'; out.$ = copy(inp.$); }).dispatchThreads(1);
  const r = await out.read(); inp.buffer.destroy(); out.buffer.destroy(); return r;
}
describe('own: memory layout', () => {
  it('M19 array<vec3f, 4> written by the host reads back intact on the GPU (16-byte stride)', async () => {
    const v = [d.vec3f(1, 2, 3), d.vec3f(4, 5, 6), d.vec3f(7, 8, 9), d.vec3f(10, 11, 12)];
    const r: any[] = await roundTrip(d.arrayOf(d.vec3f, 4), v);
    expect(r.map((x) => [x.x, x.y, x.z])).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]]);
  });
  it('M20 array of struct{vec3f} (size 12, align 16 -> stride 16) round-trips', async () => {
    const S = d.struct({ v: d.vec3f });
    const r: any[] = await roundTrip(d.arrayOf(S, 3), [{ v: d.vec3f(1, 2, 3) }, { v: d.vec3f(4, 5, 6) }, { v: d.vec3f(7, 8, 9) }]);
    expect(r.map((x) => [x.v.x, x.v.y, x.v.z])).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  });
  it('M20 array of struct{vec4f, f32} (size 20, align 16 -> stride 32) round-trips', async () => {
    const S = d.struct({ a: d.vec4f, b: d.f32 });
    const r: any[] = await roundTrip(d.arrayOf(S, 3), [0, 1, 2].map((i) => ({ a: d.vec4f(i, i + 0.5, i + 1, i + 2), b: 10 + i })));
    expect(r.map((x) => [x.a.x, x.a.y, x.a.z, x.a.w, x.b])).toEqual([[0, 0.5, 1, 2, 10], [1, 1.5, 2, 3, 11], [2, 2.5, 3, 4, 12]]);
  });
  it.skipIf(!hasF16)('M21 struct{f16, vec3h} (vec3h align 8) round-trips (needs shader-f16)', async () => {
    const S = d.struct({ a: d.f16, v: d.vec3h });
    const r: any = await roundTrip(S, { a: 1.5, v: d.vec3h(2, 3, 4) });
    expect([r.a, r.v.x, r.v.y, r.v.z]).toEqual([1.5, 2, 3, 4]);
  });
});
describe('own: sort package', () => {
  it('M42 createBitonicSorter on 1000 u32 (non power of two) sorts values both below and above 0x7fffffff', async () => {
    const n = 1000; const data = Array.from({ length: n }, (_, i) => (i % 2 ? 0x80000000 + i * 12345 : i * 54321) >>> 0);
    const buf = root.createBuffer(d.arrayOf(d.u32, n), data).$usage('storage');
    const sorter = createBitonicSorter(root, buf); sorter.run();
    const got = Array.from(await buf.read());
    expect(got).toEqual([...data].sort((x, y) => x - y)); buf.destroy();
  });
});
