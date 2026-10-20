import { expect, test } from 'vitest';
import { EXAMPLES, bitsOf, els, pinRandom, rec } from './helpers.ts';
test('prng-cpu-gpu (CPU vs GPU generators; BPETER has no CPU implementation by design)', async () => {
  pinRandom(7); const ex: any = await import(`${EXAMPLES}/tests/prng-cpu-gpu/index.ts`);
  const html: string = els().get('#results').innerHTML; const rows = html.split('</tr>').map((r) => r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  rec('prng-cpu-gpu', { rows }); expect(rows.length).toBeGreaterThan(0); ex.onCleanup();
});
test('probability: 13 distributions x 1000 samples (bit patterns recorded)', async () => {
  pinRandom(3); const { tgpu } = await import('typegpu');
  const { Executor } = await import(`${EXAMPLES}/algorithms/probability/executor.ts`); const { getPRNG } = await import(`${EXAMPLES}/algorithms/probability/helpers.ts`); const { distributions } = await import(`${EXAMPLES}/algorithms/probability/constants.ts`);
  const root = await tgpu.init(); const ex = new Executor(root); ex.count = 1000; const out: Record<string, { n: number; bits: string[]; finite: boolean }> = {};
  for (const dist of distributions) { const s: any[] = await ex.executeMoreWorkers(getPRNG(dist).prng); const flat = s.flatMap((v) => Array.from(v as ArrayLike<number>)); out[String(dist)] = { n: s.length, bits: bitsOf(flat), finite: flat.every(Number.isFinite) }; }
  rec('probability', out); expect(Object.keys(out).length).toBe(distributions.length); root.destroy();
});
