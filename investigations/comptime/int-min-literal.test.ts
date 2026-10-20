import { it } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { root } from '../../harness.ts';
type Any = any;
it('[observation] i32 INT_MIN as a constant inside a shader', async () => {
  const dev = root.device as Any;
  const MINI = -2147483648;
  const tests: [string, () => Any, Any][] = [
    ['scalar external i32(INT_MIN)', () => { 'use gpu'; return d.i32(MINI); }, d.i32],
    ['scalar inline literal d.i32(-2147483648)', () => { 'use gpu'; return d.i32(-2147483648); }, d.i32],
    ['vec2i inline literal', () => { 'use gpu'; return d.vec2i(-2147483648, 5); }, d.vec2i],
    ['vec2i from external', () => { 'use gpu'; return d.vec2i(MINI, 5); }, d.vec2i],
    ['plain const x = -2147483648', () => { 'use gpu'; const x = -2147483648; return d.i32(x); }, d.i32],
  ];
  for (const [name, f, schema] of tests) {
    const out: Any = root.createMutable(schema);
    const body = () => { 'use gpu'; out.$ = f(); };
    let wgsl = ''; try { wgsl = tgpu.resolve([body as Any]).replace(/\s+/g, ' ').slice(-140); } catch (e) { wgsl = 'resolve error: ' + (e as Error).message.split('\n')[0]; }
    dev.pushErrorScope('validation');
    root.createGuardedComputePipeline(() => { 'use gpu'; out.$ = f(); }).dispatchThreads(1);
    const err = await dev.popErrorScope();
    console.log(`${name}\n   ${wgsl}\n   ${err ? 'REJECTED: ' + err.message.split('\n')[0] : 'ok -> ' + JSON.stringify(Array.from([await out.read()].flat() as Any))}`);
  }
});
