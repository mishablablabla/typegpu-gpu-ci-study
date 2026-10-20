import { create, globals } from 'webgpu';
import { tgpu, d } from 'typegpu';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

Object.assign(globalThis, globals);

describe('TypeGPU on a real device (dawn.node)', () => {
  let device: GPUDevice;
  let root: ReturnType<typeof tgpu.initFromDevice>;

  beforeAll(async () => {
    const gpu = create([]);
    const adapter = await gpu.requestAdapter();
    if (!adapter) throw new Error('requestAdapter returned null');
    console.log('adapter:', adapter.info.vendor, adapter.info.architecture, adapter.info.device, 'fallback=', adapter.info.isFallbackAdapter);
    device = await adapter.requestDevice();
    root = tgpu.initFromDevice({ device });
  });

  afterAll(() => {
    root.destroy();
    device.destroy();
  });

  it('increments a u32 (guarded pipeline, no threads)', async () => {
    const counter = root.createMutable(d.u32);
    const pipeline = root.createGuardedComputePipeline(() => {
      'use gpu';
      counter.$ += 1;
    });
    pipeline.dispatchThreads();
    pipeline.dispatchThreads();
    expect(await counter.read()).toBe(2);
  });

  it('writes x*2 into 64 u32 (64 threads)', async () => {
    const data = root.createMutable(d.arrayOf(d.u32, 64));
    const pipeline = root.createGuardedComputePipeline((x) => {
      'use gpu';
      data.$[x] = x * 2;
    });
    pipeline.dispatchThreads(64);
    const result = await data.read();
    expect(Array.from(result)).toEqual(Array.from({ length: 64 }, (_, i) => i * 2));
  });
});
