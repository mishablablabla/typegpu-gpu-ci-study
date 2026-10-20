import { describe, expect, it } from 'vitest';
import { d, tgpu } from 'typegpu';
import { root } from '../../harness.ts';
type Any = any;
const dev = root.device as Any;

async function validationError(body: () => Any, schema: Any): Promise<string | null> {
  const out: Any = root.createMutable(schema);
  dev.pushErrorScope('validation');
  root.createGuardedComputePipeline(() => { 'use gpu'; out.$ = body(); }).dispatchThreads(1);
  const err = await dev.popErrorScope();
  return err ? String(err.message).split('\n')[0]! : null;
}

describe('[PROBABLE DEFECT D6] i32 INT_MIN constant inside a shader', () => {
  it.fails('d.i32(-2147483648) must resolve to WGSL that validates', async () => {
    const err = await validationError(() => { 'use gpu'; return d.i32(-2147483648); }, d.i32);
    expect(err).toBeNull();
  });

  it('[control] vec2i(-2147483648, 5) validates', async () => {
    expect(await validationError(() => { 'use gpu'; return d.vec2i(-2147483648, 5); }, d.vec2i)).toBeNull();
  });
  it('[control] d.i32(-2147483647) validates', async () => {
    expect(await validationError(() => { 'use gpu'; return d.i32(-2147483647); }, d.i32)).toBeNull();
  });
  it('[control] the emitted literal is exactly the one Dawn rejects (-2147483648i)', () => {
    const f = () => { 'use gpu'; return d.i32(-2147483648); };
    const wgsl = tgpu.resolve([f] as Any).replace(/\s+/g, ' ');
    expect(wgsl).toContain('return -2147483648i;');
  });
});
