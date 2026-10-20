import fs from 'node:fs'; import path from 'node:path';
import { createJiti } from 'jiti'; import { createServer, createServerModuleRunner } from 'vite'; import { createRequire } from 'node:module';
import { installGpu, readTexture } from '../src/lib/gpu.mjs'; import { installDom } from '../src/lib/dom.mjs';
const ROOT = path.resolve(process.argv[2]); const OUT = process.argv[3]; const S = Number(process.argv[4] ?? 64), N = Number(process.argv[5] ?? 8);
const DOCS = path.join(ROOT, 'apps/typegpu-docs');
const state = { stage: 'setup', adapter: null, adapterRequests: [], deviceRequests: [], devices: [], canvases: [], gpuErrors: [], deviceLost: [], unavailable: [], degraded: new Set(), jsErrors: [], shimFixes: { float16Array: 0 }, submits: 0, lastActivity: Date.now() };
state.gpuProxy = installGpu(state); installDom(state, { publicDir: path.join(DOCS, 'public'), seed: 1234 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jiti = createJiti(import.meta.url, { interopDefault: true });
const plugin = await jiti.import(createRequire(path.join(DOCS, 'package.json')).resolve('unplugin-typegpu/vite'), { default: true });
const server = await createServer({ root: DOCS, configFile: false, logLevel: 'silent', appType: 'custom', plugins: [plugin({ include: [/\.m?[jt]sx?/] })], server: { middlewareMode: true, hmr: false, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, define: { 'import.meta.env.DEV': 'true' }, ssr: { noExternal: [/^@typegpu\//, /^typegpu/, /^unplugin-typegpu/] } });
const runner = createServerModuleRunner(server.environments.ssr, { hmr: false });
const EX = path.join(DOCS, 'src/examples/simulation/game-of-life');
state.dom.window.document.body.innerHTML = '<canvas></canvas>';
const mod = await runner.import(path.join(EX, 'index.ts'));
const c = mod.controls; const dev = () => state.devices[0];
const idle = async () => { await dev().dev.queue.onSubmittedWorkDone(); await sleep(20); };
c.pause.onToggleChange(true); await idle();
const results = {};
for (const P of ['tiled', 'naive', 'bitpacked']) {
  c.pipeline.onSelectChange(P); c.size.onSelectChange(String(S)); await idle();
  const texs = dev().textures.filter((t) => t.desc.format === 'r32uint' && !t.destroyed).slice(-2);
  const read = async (i) => { const t = texs[i]; const raw = await readTexture(dev().dev, t.tex, t.desc.size.width, t.desc.size.height, 1, 4); return { w: t.desc.size.width, h: t.desc.size.height, u32: new Uint32Array(raw.buffer, raw.byteOffset, raw.length / 4) }; };
  const grid = async (i) => { const r = await read(i); const g = new Uint8Array(S * S); if (r.w === S) for (let k = 0; k < S * S; k++) g[k] = r.u32[k] ? 1 : 0; else for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) g[y * S + x] = (r.u32[y * r.w + (x >> 5)] >>> (x & 31)) & 1; return g; };
  const gens = [await grid(1)];
  for (let n = 1; n <= N; n++) { c.Step.onButtonClick(); await idle(); gens.push(await grid((n + 1) % 2)); }
  results[P] = gens;
}
const live = (g) => g.reduce((a, b) => a + b, 0);
const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };
const torus = (g) => { const o = new Uint8Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += g[((y + dy + S) % S) * S + ((x + dx + S) % S)]; const a = g[y * S + x]; o[y * S + x] = (a && (n === 2 || n === 3)) || (!a && n === 3) ? 1 : 0; } return o; };
const dead = (g) => { const o = new Uint8Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < S && yy < S) n += g[yy * S + xx]; } const a = g[y * S + x]; o[y * S + x] = (a && (n === 2 || n === 3)) || (!a && n === 3) ? 1 : 0; } return o; };
const rep = { size: S, steps: N, adapter: state.adapter && { vendor: state.adapter.vendor, architecture: state.adapter.architecture, description: state.adapter.description }, gpuErrors: state.gpuErrors.length, perStep: [] };
let cpuT = results.tiled[0], cpuD = results.tiled[0];
for (let n = 0; n <= N; n++) {
  if (n > 0) { cpuT = torus(cpuT); cpuD = dead(cpuD); }
  rep.perStep.push({ step: n, live: { tiled: live(results.tiled[n]), naive: live(results.naive[n]), bitpacked: live(results.bitpacked[n]) },
    initialSame: n === 0 ? { tiled_vs_naive: diff(results.tiled[0], results.naive[0]), tiled_vs_bitpacked: diff(results.tiled[0], results.bitpacked[0]) } : undefined,
    gpuVsCpu: { tiled_vs_torus: diff(results.tiled[n], cpuT), bitpacked_vs_torus: diff(results.bitpacked[n], cpuT), naive_vs_deadBorder: diff(results.naive[n], cpuD), naive_vs_torus: diff(results.naive[n], cpuT) },
    pairs: { tiled_vs_bitpacked: diff(results.tiled[n], results.bitpacked[n]), tiled_vs_naive: diff(results.tiled[n], results.naive[n]), naive_vs_bitpacked: diff(results.naive[n], results.bitpacked[n]) } });
}
fs.writeFileSync(OUT, JSON.stringify(rep, null, 1)); console.log(JSON.stringify(rep.perStep.slice(0, 4), null, 0)); process.exit(0);
