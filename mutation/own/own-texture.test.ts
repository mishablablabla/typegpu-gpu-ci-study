import { describe, expect, it } from 'vitest';
import { root } from '../harness.ts';

describe('own: texture upload', () => {
  it('M37 raw write of a 4x4 rg8unorm texture reads back byte-exact (bytes per texel = 2)', async () => {
    const tex: any = root.createTexture({ size: [4, 4], format: 'rg8unorm' });
    const data = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 255); tex.write(data);
    const dev: any = root.device; const gt: GPUTexture = root.unwrap(tex);
    const buf = dev.createBuffer({ size: 256 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = dev.createCommandEncoder(); enc.copyTextureToBuffer({ texture: gt }, { buffer: buf, bytesPerRow: 256 }, [4, 4, 1]); dev.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ); const all = new Uint8Array(buf.getMappedRange().slice(0)); buf.unmap();
    const rows = [0, 1, 2, 3].map((y) => Array.from(all.slice(y * 256, y * 256 + 8)));
    expect(rows.flat()).toEqual(Array.from(data)); tex.destroy();
  });
});
