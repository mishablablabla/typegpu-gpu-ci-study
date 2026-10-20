import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { createJiti } from 'jiti';
import { createServer, createServerModuleRunner } from 'vite';
import { installGpu, captureResources, fromHalf } from './lib/gpu.mjs';
import { installDom, interact, FRAME_MS, TIME_BASE } from './lib/dom.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const ROOT = path.resolve(args.root ?? process.env.TYPEGPU_ROOT ?? ''); const EX = args.example; const OUT = path.resolve(args.out);
const FRAMES = (args.frames ?? '3,30').split(',').map(Number); const SEED = Number(args.seed ?? 1234); const BUDGET = Number(args['timeout-ms'] ?? 150000);
const WANT_PNG = args.png === '1'; const FRAME_QUIET_MS = Number(process.env.EX_FRAME_QUIET_MS ?? 40);
if (!EX || !fs.existsSync(path.join(ROOT, 'apps/typegpu-docs/src/examples', EX))) { console.error(`bad --example/--root: ${EX} @ ${ROOT}`); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const DOCS = path.join(ROOT, 'apps/typegpu-docs'); const EXDIR = path.join(DOCS, 'src/examples', EX);
const t0 = Date.now();
const realSetTimeout = globalThis.setTimeout;

const state = {
  example: EX, stage: 'setup', adapter: null, adapterRequests: [], deviceRequests: [], devices: [], canvases: [], gpuErrors: [], deviceLost: [], unavailable: [], degraded: new Set(),
  shimFixes: { float16Array: 0 }, jsErrors: [], consoleLines: [], consoleCount: 0, submits: 0, lastActivity: Date.now(), hiddenFeatures: [],
};
const R = { example: EX, repeat: Number(args.repeat ?? 1), seed: SEED, frames: FRAMES, node: process.version, platform: `${process.platform}-${process.arch}`, final: false, checkpoints: {} };

for (const lvl of ['log', 'info', 'warn', 'error', 'debug']) {
  const orig = console[lvl].bind(console);
  console[lvl] = (...a) => {
    state.consoleCount++;
    const text = a.map((x) => { try { return typeof x === 'string' ? x : x instanceof Error ? x.stack ?? String(x) : JSON.stringify(x); } catch { return String(x); } }).join(' ');
    if (state.consoleLines.length < 300) state.consoleLines.push({ level: lvl, text: text.slice(0, 600) });
    if (state.consoleCount <= 400) orig(`[console.${lvl}] ${text.slice(0, 1000)}`);
  };
}
const recordJsError = (where, e) => state.jsErrors.push({ stage: state.stage, where, message: String(e?.message ?? e).slice(0, 800), name: e?.name ?? null, stack: String(e?.stack ?? '').split('\n').slice(0, 8).join('\n') });
process.on('uncaughtException', (e) => recordJsError('uncaughtException', e));
process.on('unhandledRejection', (e) => recordJsError('unhandledRejection', e));

const publicDir = path.join(DOCS, 'public');
state.gpuProxy = installGpu(state);
installDom(state, { publicDir, seed: SEED });

function snapshotResult() {
  const gpuErrByDevice = state.gpuErrors;
  Object.assign(R, {
    adapter: state.adapter, hiddenFeatures: state.hiddenFeatures, adapterRequests: state.adapterRequests, deviceRequests: state.deviceRequests,
    devices: state.devices.map((d) => ({ idx: d.idx, buffers: d.buffers.length, textures: d.textures.length, shaderModules: d.shaderModules.length, submits: d.submits, lost: d.lostInfo })),
    shaderModules: state.devices.flatMap((d) => d.shaderModules.map((m) => ({ dev: d.idx, stage: m.stage, label: m.label, sha256: m.sha256, length: m.length, compileErrors: m.compileErrors }))),
    shaderCompileErrors: state.devices.flatMap((d) => d.shaderModules.flatMap((m) => m.compileErrors)).length,
    shaderCompileErrorsPrimary: state.devices.flatMap((d) => d.shaderModules.filter((m) => !['interact', 'post-interact', 'cleanup'].includes(m.stage)).flatMap((m) => m.compileErrors)).length,
    gpuErrorCount: gpuErrByDevice.length, gpuErrors: gpuErrByDevice.slice(0, 30), gpuErrorsPerStage: gpuErrByDevice.reduce((a, e) => ((a[e.stage] = (a[e.stage] ?? 0) + 1), a), {}),
    deviceLost: state.deviceLost, jsErrors: state.jsErrors.slice(0, 20), jsErrorCount: state.jsErrors.length,
    unavailable: [...new Map(state.unavailable.map((u) => [u.api + '|' + u.detail, u])).values()], degraded: [...state.degraded],
    fetches: state.fetches?.slice(0, 80), console: { count: state.consoleCount, lines: state.consoleLines.slice(0, 60) },
    shimFixes: state.shimFixes, submits: state.submits, wallMs: Date.now() - t0, stage: state.stage,
  });
  fs.writeFileSync(path.join(OUT, 'result.json.tmp'), JSON.stringify(R, null, 1)); fs.renameSync(path.join(OUT, 'result.json.tmp'), path.join(OUT, 'result.json'));
}
snapshotResult();

const sleep = (ms) => new Promise((r) => realSetTimeout(r, ms));
const over = () => Date.now() - t0 > BUDGET;
async function gpuIdle() { await Promise.all(state.devices.filter((d) => !d.lostInfo).map((d) => d.dev.queue.onSubmittedWorkDone().catch(() => {}))); }

async function runFrame(frame, waitFirstMs) {
  const tw = Date.now();
  while (state.raf.length === 0 && Date.now() - tw < waitFirstMs && !over()) await sleep(10);
  if (state.raf.length === 0) return false;
  state.time = TIME_BASE + frame * FRAME_MS;
  for (const c of state.canvases) c.fresh = true;
  const cbs = state.raf.splice(0);
  for (const { cb } of cbs) { try { const r = cb(state.time); if (r && typeof r.then === 'function') await r; } catch (e) { recordJsError('requestAnimationFrame callback', e); } }
  await gpuIdle(); await sleep(0);
  await settle(FRAME_QUIET_MS);
  return true;
}
async function settle(quietMs = 400) {
  const start = Date.now();
  for (;;) {
    await gpuIdle();
    const quiet = Date.now() - state.lastActivity > quietMs, timersOk = (state.pendingShort.size === 0 || Date.now() - start > 3000) && (state.pending === 0 || Date.now() - start > 20000);
    if ((quiet && timersOk) || over()) break;
    await sleep(25); if (Date.now() - start > BUDGET) break;
  }
}

function toPng(file, c, data) {
  const w = c.width, h = c.height; const rgba = Buffer.alloc(w * h * 4);
  if (c.format === 'bgra8unorm' || c.format === 'bgra8unorm-srgb') for (let i = 0; i < w * h; i++) { rgba[i * 4] = data[i * 4 + 2]; rgba[i * 4 + 1] = data[i * 4 + 1]; rgba[i * 4 + 2] = data[i * 4]; rgba[i * 4 + 3] = c.alphaMode === 'premultiplied' || true ? 255 : data[i * 4 + 3]; }
  else if (c.format.startsWith('rgba8')) for (let i = 0; i < w * h; i++) { rgba.set(data.subarray(i * 4, i * 4 + 3), i * 4); rgba[i * 4 + 3] = 255; }
  else if (c.format === 'rgba16float') { const u = new Uint16Array(data.buffer, data.byteOffset, data.length / 2); for (let i = 0; i < w * h * 4; i++) { const v = i % 4 === 3 ? 1 : Math.max(0, Math.min(1, fromHalf(u[i]))); rgba[i] = Math.round(v * 255); } }
  else return false;
  const png = new PNG({ width: w, height: h }); rgba.copy(png.data); fs.writeFileSync(file, PNG.sync.write(png)); return true;
}

async function checkpoint(label) {
  const dir = path.join(OUT, `cp${label}`); fs.mkdirSync(dir, { recursive: true });
  const prevStage = state.stage; state.stage = 'readback';
  let cap;
  try { cap = await captureResources(state); } catch (e) { recordJsError('captureResources', e); cap = { res: { canvases: [], buffers: [], textures: [], readbackErrors: [`captureResources threw: ${e?.message}`] }, dumps: [] }; }
  for (const d of cap.dumps) {
    fs.writeFileSync(path.join(dir, d.name + '.bin.gz'), zlib.gzipSync(d.data, { level: 6 }));
    if (d.png && WANT_PNG) try { toPng(path.join(dir, d.name + '.png'), d.meta, d.data); } catch (e) { cap.res.readbackErrors.push('png: ' + e.message); }
  }
  const doc = state.dom.window.document;
  const text = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const html = doc.body?.innerHTML ?? '';
  R.checkpoints[label] = {
    ...cap.res, dom: { textLength: text.length, text: text.slice(0, 4000), htmlLength: html.length, htmlSha256: (await import('node:crypto')).createHash('sha256').update(html).digest('hex') },
    randomCalls: state.randomCalls, gpuErrorsAtCheckpoint: state.gpuErrors.length, jsErrorsAtCheckpoint: state.jsErrors.length, time: state.time, atMs: Date.now() - t0,
  };
  state.stage = prevStage; snapshotResult();
}

let server, runner;
const hardKill = setTimeout(() => { R.hardTimeout = true; try { snapshotResult(); } catch {} console.error('[run-example] hard timeout inside child'); process.exit(124); }, BUDGET + 20000);
hardKill.unref();
try {
  state.stage = 'vite';
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const requireDocs = (await import('node:module')).createRequire(path.join(DOCS, 'package.json'));
  const typegpuPlugin = await jiti.import(requireDocs.resolve('unplugin-typegpu/vite'), { default: true });
  server = await createServer({
    root: DOCS, configFile: false, logLevel: 'silent', appType: 'custom', cacheDir: path.join(OUT, '.vite-cache'),
    plugins: [typegpuPlugin({ include: [/\.m?[jt]sx?/] })],
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    define: { 'import.meta.env.DEV': 'true' },
    ssr: { noExternal: [/^@typegpu\//, /^typegpu/, /^unplugin-typegpu/] },
  });
  runner = createServerModuleRunner(server.environments.ssr, { hmr: false });
  R.viteMs = Date.now() - t0;

  const htmlFile = path.join(EXDIR, 'index.html');
  if (fs.existsSync(htmlFile)) state.dom.window.document.body.innerHTML = fs.readFileSync(htmlFile, 'utf8');
  const entry = ['index.ts', 'index.tsx'].map((f) => path.join(EXDIR, f)).find((f) => fs.existsSync(f));

  state.stage = 'import';
  let mod;
  const tImp = Date.now();
  const imp = runner.import(entry).then((m) => ({ ok: true, m }), (e) => ({ ok: false, e }));
  for (;;) {
    const r = await Promise.race([imp, sleep(200).then(() => null)]);
    if (r) { if (r.ok) mod = r.m; else { R.importError = { message: String(r.e?.message ?? r.e).slice(0, 1000), name: r.e?.name, stack: String(r.e?.stack ?? '').split('\n').slice(0, 10).join('\n') }; } break; }
    if (over()) { R.importError = { message: `import did not finish within ${BUDGET} ms`, name: 'Timeout' }; R.importTimeout = true; break; }
  }
  R.importMs = Date.now() - tImp; R.importOk = !!mod; R.exports = mod ? Object.keys(mod) : [];
  snapshotResult();

  if (mod) {
    state.stage = 'init-controls';
    try {
      const ctl = mod.controls && typeof mod.controls === 'object' ? mod.controls : {}; const done = [];
      for (const [name, c] of Object.entries(ctl)) {
        if (!c || typeof c !== 'object') continue;
        let r;
        try {
          if ('onSelectChange' in c) r = c.onSelectChange(c.initial);
          else if ('onToggleChange' in c) r = c.onToggleChange(c.initial);
          else if ('onSliderChange' in c) r = c.onSliderChange(c.initial);
          else if ('onVectorSliderChange' in c) r = c.onVectorSliderChange(c.initial);
          else if ('onColorChange' in c) r = c.onColorChange(c.initial);
          else if ('onTextChange' in c) r = c.onTextChange(c.initial);
          else continue;
          done.push(name);
          if (r && typeof r.then === 'function') await Promise.race([r, sleep(20000).then(() => { throw new Error('initial control handler timed out (20s)'); })]);
        } catch (e) { recordJsError(`control "${name}" initial handler`, e); }
      }
      R.initControls = done;
    } catch (e) { recordJsError('init-controls', e); }
    state.stage = 'frames';
    let frame = 0, noLoop = false;
    await settle(300);
    let first = true;
    for (const target of FRAMES) {
      while (frame < target && !noLoop && !over()) {
        const ran = await runFrame(frame + 1, first ? 4000 : 1500); first = false;
        if (!ran) { noLoop = true; break; }
        frame++;
        if (frame === 1 || state.devices.length === 0) await settle(150);
      }
      await settle(300);
      R.framesDriven = frame; R.noFrameLoop = noLoop;
      await checkpoint(String(target));
      if (target === FRAMES[0] && !over()) {
        state.stage = 'interact';
        try { R.interaction = await interact(state, mod); } catch (e) { R.interaction = { errors: [String(e?.message ?? e)] }; }
        state.stage = 'post-interact';
      }
      if (over()) { R.budgetExceeded = true; break; }
    }
    R.framesDriven = frame; R.noFrameLoop = noLoop; R.frameLoopRan = frame > 0;
  }

  state.stage = 'cleanup'; snapshotResult();
  if (mod?.onCleanup) { try { await Promise.race([Promise.resolve(mod.onCleanup()), sleep(15000).then(() => { throw new Error('onCleanup timed out (15s)'); })]); R.cleanup = { ok: true }; } catch (e) { R.cleanup = { ok: false, message: String(e?.message ?? e).slice(0, 400) }; recordJsError('onCleanup', e); } await sleep(50); }
  state.stage = 'done';
} catch (e) { recordJsError('runner', e); R.runnerError = String(e?.stack ?? e).slice(0, 1500); }
R.final = true; snapshotResult();
fs.writeFileSync(path.join(OUT, 'wgsl.json.gz'), zlib.gzipSync(JSON.stringify(state.devices.flatMap((d) => d.shaderModules.map((m) => ({ dev: d.idx, label: m.label, sha256: m.sha256, code: m.code }))))));
process.exit(0); // hard exit: dawn.node teardown + live vite handles must not delay or kill the batch
