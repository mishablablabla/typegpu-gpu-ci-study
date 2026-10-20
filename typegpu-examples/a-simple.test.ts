import { expect, test } from 'vitest';
import { EXAMPLES, els, rec, wait } from './helpers.ts';
test('increment', async () => {
  const ex: any = await import(`${EXAMPLES}/simple/increment/index.ts`);
  await ex.controls.Increment.onButtonClick(); await ex.controls.Increment.onButtonClick();
  const v = els().get('.counter').innerText; rec('increment', { counter: v }); expect(v).toBe('2'); ex.onCleanup();
});
test('tgsl-parsing-test', async () => {
  const ex: any = await import(`${EXAMPLES}/tests/tgsl-parsing-test/index.ts`);
  await wait(() => !!els().get('.result')?.innerText); const v = els().get('.result').innerText; rec('tgsl-parsing-test', { result: v }); expect(v).toMatch(/succe/i); ex.onCleanup();
});
test('dispatch (self-checking: 0d-3d dispatch, atomics, bind groups, slots)', async () => {
  const ex: any = await import(`${EXAMPLES}/tests/dispatch/index.ts`);
  await wait(() => !!els().get('.result')?.innerText); const v = els().get('.result').innerText; rec('dispatch', { result: v }); expect(v).toBe('Tests succeeded.'); ex.onCleanup();
});
