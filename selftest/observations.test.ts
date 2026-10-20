import { afterAll, describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';
import { adapterFeatures, adapterInfo, hasF16, root, run, T } from '../harness.ts';
import { flush, recordObservation } from '../lib/report.ts';

type Any = any;
afterAll(() => flush('selftest-observations'));
const dev = root.device as Any;

function captureWgsl(): { stop: () => string } {
  const orig = dev.createShaderModule.bind(dev);
  const code: string[] = [];
  dev.createShaderModule = (x: Any) => { code.push(x.code); return orig(x); };
  return { stop: () => { dev.createShaderModule = orig; return code.join('\n'); } };
}

describe('[environment]', () => {
  it('records the adapter and device features', () => {
    const info = { vendor: adapterInfo.vendor, architecture: adapterInfo.architecture, device: adapterInfo.device, description: adapterInfo.description, isFallbackAdapter: adapterInfo.isFallbackAdapter };
    recordObservation('adapter', info);
    recordObservation('adapterFeatures', adapterFeatures);
    recordObservation('shader-f16', hasF16);
    expect(typeof info.isFallbackAdapter).toBe('boolean');
  });
});

describe('[TypeGPU] how integer std.div / std.mod / std.intdiv are compiled (explains the "int via f32" policy)', () => {
  const emitted = async (title: string, f: Any, a: Any, b: Any, out: Any) => {
    const cap = captureWgsl();
    try { await run(f, [a, b], out); } finally { }
    const code = cap.stop();
    recordObservation(`wgsl:${title}`, code.split('\n').filter((l) => /return|^fn item_/.test(l.trim())).map((l) => l.trim()));
    return code;
  };
  it('std.div(i32, i32) is emitted as an f32 division', async () => {
    expect(await emitted('std.div i32', (a: Any, b: Any) => { 'use gpu'; return std.div(a, b); }, T(d.i32, 7), T(d.i32, 2), d.i32)).toContain('(f32(a) / f32(b))');
  });
  it('std.mod(i32, i32) is emitted as an f32 remainder', async () => {
    expect(await emitted('std.mod i32', (a: Any, b: Any) => { 'use gpu'; return std.mod(a, b); }, T(d.i32, 7), T(d.i32, 2), d.i32)).toContain('(f32(a) % f32(b))');
  });
  it('std.intdiv(i32, i32) is emitted as an integer division', async () => {
    expect(await emitted('std.intdiv i32', (a: Any, b: Any) => { 'use gpu'; return std.intdiv(a, b); }, T(d.i32, 7), T(d.i32, 2), d.i32)).toContain('(a / b)');
  });
  it('every shader enables f16 when the device has shader-f16, even for f32-only code', async () => {
    const cap = captureWgsl();
    await run((a: Any) => { 'use gpu'; return a + 1; }, [1], d.f32);
    const has = /^enable f16;/m.test(cap.stop());
    recordObservation('wgsl-enables-f16-for-f32-code', has);
    expect(has).toBe(hasF16);
  });
});

describe('[TypeGPU] inf / NaN handling (Finite Math Assumption)', () => {
  it('vector constructors reject inf/NaN on the CPU', () => {
    let msg = '';
    try { d.vec2f(NaN, 1); } catch (e) { msg = (e as Error).message.split('\n')[0]!; }
    recordObservation('cpu-vec2f(NaN)', msg || 'accepted');
    expect(msg).toMatch(/Finite Math Assumption/);
  });
  it('comptime-known infinity is rejected when generating WGSL (1e30 * 1e30 is folded at compile time)', async () => {
    const out: Any = root.createMutable(d.vec2f);
    let msg = '';
    try {
      root.createGuardedComputePipeline(() => { 'use gpu'; out.$ = d.vec2f(1e30, 1) * d.vec2f(1e30, 1); }).dispatchThreads();
    } catch (e) { msg = (e as Error).message.split('\n').slice(0, 6).join(' | '); }
    recordObservation('comptime inf in shader', msg || 'accepted');
    expect(msg).toMatch(/Finite Math Assumption/);
  });
  it('reading a vector buffer that contains a RUNTIME-computed inf throws in buffer.read() (the harness therefore reads raw bytes)', async () => {
    const input: Any = root.createMutable(d.vec2f, d.vec2f(1e30, 1));
    const out: Any = root.createMutable(d.vec2f);
    root.createGuardedComputePipeline(() => { 'use gpu'; out.$ = input.$ * input.$; }).dispatchThreads();
    let msg = '';
    try { await out.read(); } catch (e) { msg = (e as Error).message.split('\n')[0]!; }
    recordObservation('gpu-read-vec2f-with-inf', msg || 'returned normally');
    expect(msg).toMatch(/Finite Math Assumption/);
  });
});

describe('[TypeGPU] CPU implementation quirks', () => {
  it('scalar f32 arithmetic on the CPU is f64 (not rounded to f32)', async () => {
    const cpu = std.add(16777216, 1);
    const gpu = await run((a: Any, b: Any) => { 'use gpu'; return a + b; }, [16777216, 1], d.f32);
    recordObservation('f32 16777216+1', { cpu, gpu });
    expect(cpu).toBe(16777217);
    expect(gpu).toBe(16777216);
  });
  it('std.intdiv is not available for vectors (TypeGPU rejects the signature)', async () => {
    let msg = '';
    try { await run((a: Any, b: Any) => { 'use gpu'; return std.intdiv(a, b); }, [d.vec2i(7, 7), d.vec2i(2, 2)], d.vec2i); } catch (e) { msg = (e as Error).message.split('\n').slice(0, 4).join(' | '); }
    recordObservation('std.intdiv(vec2i)', msg || 'accepted');
    expect(msg).not.toBe('');
  });
  it('integer vector multiply on the CPU loses precision (INT_MAX * INT_MAX)', () => {
    const r = Array.from(std.mul(d.vec2i(2147483647, 3), d.vec2i(2147483647, 3)) as Any)[0];
    recordObservation('cpu vec2i INT_MAX*INT_MAX', { cpu: r, wgslWrapAround: 1 });
    expect(r).toBe(0);
  });
});

describe('[WGSL] smoothstep with equal edges', () => {
  it('const edges are a shader-creation error; runtime edges compile (spec: indeterminate result)', async () => {
    const constMod = dev.createShaderModule({ code: `@group(0) @binding(0) var<storage, read_write> o: f32;
      @compute @workgroup_size(1) fn main() { o = smoothstep(0.5, 0.5, 0.4); }` });
    const constMsgs = (await constMod.getCompilationInfo()).messages.map((m: Any) => `${m.type}: ${m.message}`);
    const rtMod = dev.createShaderModule({ code: `@group(0) @binding(0) var<storage, read_write> o: f32;
      @group(0) @binding(1) var<storage, read> e: f32;
      @compute @workgroup_size(1) fn main() { o = smoothstep(e, e, 0.4); }` });
    const rtMsgs = (await rtMod.getCompilationInfo()).messages.map((m: Any) => `${m.type}: ${m.message}`);
    recordObservation('smoothstep(const equal edges)', constMsgs);
    recordObservation('smoothstep(runtime equal edges)', rtMsgs);
    expect(constMsgs.join()).toMatch(/error/);
    expect(rtMsgs).toEqual([]);
  });
});
