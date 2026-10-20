import { expect, test } from 'vitest';
import { EXAMPLES, els, nums, pinRandom, rec, wait } from './helpers.ts';
test('matrix-multiplication (Math.random pinned) equals JS reference', async () => {
  pinRandom(42); const ex: any = await import(`${EXAMPLES}/algorithms/matrix-multiplication/index.ts`);
  await wait(() => !!els().get('.matrix-result')?.innerHTML);
  const A = nums(els().get('.matrix-a').innerHTML), B = nums(els().get('.matrix-b').innerHTML), C = nums(els().get('.matrix-result').innerHTML);
  const exp: number[] = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { let s = 0; for (let k = 0; k < 4; k++) s += A[i * 4 + k]! * B[k * 2 + j]!; exp.push(s); }
  rec('matrix-multiplication', { A, B, C, expected: exp, equal: JSON.stringify(C) === JSON.stringify(exp) }); expect(C).toEqual(exp); ex.onCleanup();
});
test('matrix-next: gpu-optimized / gpu-simple vs cpu strategy', async () => {
  pinRandom(1); const ex: any = await import(`${EXAMPLES}/algorithms/matrix-next/index.ts`); const out: Record<string, number[]> = {};
  for (const s of ['gpu-optimized', 'gpu-simple', 'cpu']) { ex.controls.strategy.onSelectChange(s); await ex.controls.Compute.onButtonClick(); out[s] = nums(els().get('.matrix-result').innerHTML); }
  rec('matrix-next', { ...out, optimizedEqCpu: JSON.stringify(out['gpu-optimized']) === JSON.stringify(out.cpu), simpleEqCpu: JSON.stringify(out['gpu-simple']) === JSON.stringify(out.cpu) });
  expect(out['gpu-optimized']).toEqual(out.cpu); expect(out['gpu-simple']).toEqual(out.cpu); ex.onCleanup();
});
