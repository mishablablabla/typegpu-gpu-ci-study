import { create, globals } from 'webgpu';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
Object.assign(globalThis, globals);
const gpu: any = create([]);
(globalThis as any).__gpu = gpu; // dawn.node crashes ("mutex lock failed") if the create() result is garbage collected: keep it referenced

const hide = new Set((process.env.HIDE_FEATURES ?? '').split(',').filter(Boolean));
const realRequest = gpu.requestAdapter.bind(gpu);
const gpuProxy = new Proxy(gpu, { get(t, p) {
  if (p === 'requestAdapter') return async (o?: any) => {
    const a: any = await realRequest(o);
    if (!a) return a; (globalThis as any).__adapterInfo = { vendor: a.info.vendor, architecture: a.info.architecture, device: a.info.device, description: a.info.description, features: [...a.features].sort(), hidden: [...hide] };
    if (!hide.size) return a;
    const feats = new Set([...a.features].filter((f: any) => !hide.has(f)));
    return new Proxy(a, { get(at, ap) { if (ap === 'features') return feats; const v = Reflect.get(at, ap); return typeof v === 'function' ? v.bind(at) : v; } });
  };
  const v = Reflect.get(t, p); return typeof v === 'function' ? v.bind(t) : v;
} });
Object.defineProperty(globalThis.navigator, 'gpu', { value: gpuProxy, configurable: true });

const noop: any = new Proxy(function () {}, { get: () => noop, apply: () => noop, set: () => true });
const els = new Map<string, any>();
export const getEl = (sel: string) => { if (!els.has(sel)) els.set(sel, { style: {}, innerHTML: '', innerText: '', textContent: '', hidden: false, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {}, setAttribute() {} }); return els.get(sel); };
export function installCanvas(w = 256, h = 256) {
  const c: any = getEl('canvas'); c.width = w; c.height = h; c.clientWidth = w; c.clientHeight = h; c.parentElement = { appendChild() {} };
  c.getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h }); let dev: any, fmt: any, tex: any;
  c.getContext = (type: string) => type === 'webgpu' ? { configure(o: any) { dev = o.device; fmt = o.format; }, getCurrentTexture() { return tex ??= dev.createTexture({ size: [c.width, c.height], format: fmt, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING }); }, get texture() { return tex; } } : noop;
  return c;
}
(globalThis as any).__els = els;
(globalThis as any).document = { querySelector: getEl, querySelectorAll: () => [], getElementById: getEl, createElement: () => getEl('x' + Math.random()) };
(globalThis as any).window = { innerWidth: 1024, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
(globalThis as any).requestAnimationFrame = (cb: any) => { (globalThis as any).__raf = cb; return 1; };
(globalThis as any).cancelAnimationFrame = () => {};
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
(globalThis as any).__installCanvas = installCanvas;
(globalThis as any).__record = (name: string, data: unknown) => { const dir = process.env.EX_OUT ?? path.join(process.cwd(), 'out-local'); mkdirSync(dir, { recursive: true }); writeFileSync(path.join(dir, name.replace(/[^\w.-]+/g, '_') + '.json'), JSON.stringify({ test: name, adapter: (globalThis as any).__adapterInfo, data }, null, 1)); };
