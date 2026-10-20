import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { EXAMPLES, els, pinRandom, rec, wait } from './helpers.ts';
test('bitonic-sort: sorted + permutation for 3 orders (n=1000, padded)', async () => {
  pinRandom(5); (globalThis as any).__installCanvas(); const ex: any = await import(`${EXAMPLES}/algorithms/bitonic-sort/index.ts`); const { __tap } = ex;
  const orders: Record<string, (a: number, b: number) => boolean> = { ascending: (a, b) => a < b, descending: (a, b) => a > b, 'xor-scatter': (a, b) => (a ^ 0xaa) < (b ^ 0xaa) }; const res: Record<string, unknown> = {};
  ex.controls['Array Size'].onSelectChange(1000);
  for (const [name, lt] of Object.entries(orders)) { ex.controls['Sort Order'].onSelectChange(name); ex.controls.Reshuffle.onButtonClick(); const before: number[] = await __tap.buffer.read(); await ex.controls.Sort.onButtonClick(); const after: number[] = await __tap.buffer.read();
    const sorted = after.every((v, i) => i === 0 || !lt(v, after[i - 1]!)); const perm = [...before].sort().join() === [...after].sort().join(); res[name] = { n: after.length, sorted, permutation: perm, sha1: createHash('sha1').update(after.join(',')).digest('hex') }; expect(sorted && perm).toBe(true); }
  rec('bitonic-sort', res); ex.onCleanup();
});
test('concurrent-chart calculator (needs timestamp-query)', async () => {
  const { tgpu } = await import('typegpu'); const { performCalculationsWithTime } = await import(`${EXAMPLES}/algorithms/concurrent-chart/calculator.ts`);
  const root = await tgpu.init({ device: { requiredFeatures: ['timestamp-query'] } }); const arr = Array.from({ length: 21037 }, (_, i) => (i * 7) % 13);
  const r = await performCalculationsWithTime(root, arr); rec('concurrent-chart', { success: r.success }); expect(r.success).toBe(true); root.destroy();
});
test('prefix-scan (self-checking, includes 16.7M-element cases)', async () => {
  const t = Date.now(); const ex: any = await import(`${EXAMPLES}/tests/prefix-scan/index.ts`);
  await wait(() => !!els().get('.result')?.innerText); const v = els().get('.result').innerText; rec('prefix-scan', { result: v, ms: Date.now() - t }); expect(v).toMatch(/succe/i); ex.onCleanup();
});
