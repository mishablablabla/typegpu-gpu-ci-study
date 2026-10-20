import { expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { EXAMPLES, bitsOf, pinRandom, rec } from './helpers.ts';
test('mnist-inference: logits (default path and non-subgroup path)', async () => {
  vi.stubGlobal('fetch', async (u: string) => new Response(readFileSync('./vendor/apps/typegpu-docs/public/assets/mnist-weights/' + u.split('/').pop())));
  (globalThis as any).__installCanvas(); const ex: any = await import(`${EXAMPLES}/algorithms/mnist-inference/index.ts`); const { network, hasShaderF16, hasSubgroups } = ex.__tap;
  const input = Array.from({ length: 784 }, (_, i) => { const x = i % 28, y = Math.floor(i / 28); return (x >= 13 && x <= 15 && y >= 4 && y <= 24 ? 255 : 0) / 255 * 3.24 - 0.42; });
  const out: Record<string, unknown> = { hasShaderF16, hasSubgroups }; const arg = (a: number[]) => a.indexOf(Math.max(...a));
  if (hasSubgroups) { const r: number[] = await network.inference(input); out.subgroups = { logits: r, bits: bitsOf(r), argmax: arg(r) }; ex.controls['Use Subgroups'].onToggleChange(false); }
  const d: number[] = await network.inference(input); out.default = { logits: d, bits: bitsOf(d), argmax: arg(d) }; rec('mnist-inference', out); expect(d.length).toBe(10); ex.onCleanup();
});
test('log-test: shader console.log captured for 4 controls', async () => {
  (globalThis as any).__installCanvas(); const logs: string[] = []; vi.spyOn(console, 'log').mockImplementation((...a: any[]) => { logs.push(a.map(String).join(' ')); });
  const ex: any = await import(`${EXAMPLES}/tests/log-test/index.ts`); const out: Record<string, string[]> = {};
  for (const k of ['One argument', 'Multiple arguments', 'String literals', 'Two logs']) { logs.length = 0; await ex.controls[k].onButtonClick(); await new Promise((r) => setTimeout(r, 400)); out[k] = [...logs]; }
  vi.restoreAllMocks(); rec('log-test', out); expect(Object.values(out).every((v) => v.length > 0)).toBe(true); ex.onCleanup();
});
test('jump-flood-voronoi: rendered 64x64 pixels (sha1)', async () => {
  vi.spyOn(performance, 'now').mockReturnValue(1234.5); pinRandom(11); const c = (globalThis as any).__installCanvas(64, 64);
  const ex: any = await import(`${EXAMPLES}/algorithms/jump-flood-voronoi/index.ts`); ex.controls['Step delay (ms)'].onSliderChange(0); await new Promise((r) => setTimeout(r, 2500));
  const dev = ex.__tap.root.device; const tex = c.getContext('webgpu').texture; const buf = dev.createBuffer({ size: 64 * 4 * 64, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = dev.createCommandEncoder(); enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: 256 }, [64, 64]); dev.queue.submit([enc.finish()]); await buf.mapAsync(GPUMapMode.READ);
  const px = new Uint8Array(buf.getMappedRange().slice(0)); rec('jump-flood-voronoi', { bytes: px.length, nonzero: px.filter((v) => v !== 0).length, sha1: createHash('sha1').update(px).digest('hex') }); expect(px.some((v) => v !== 0)).toBe(true); ex.onCleanup();
});
