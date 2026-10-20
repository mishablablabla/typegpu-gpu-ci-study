import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const FRAME_MS = 1000 / 60;
export const TIME_BASE = 5000;
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.obj': 'text/plain', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.npy': 'application/octet-stream', '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream', '.js': 'text/javascript', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };

function deepNoop(extra = {}) {
  const f = function () {};
  const p = new Proxy(f, {
    get(_t, prop) { if (prop in extra) return extra[prop]; if (prop === Symbol.toPrimitive) return () => 0; if (prop === 'then') return undefined; return deepNoop(); },
    set() { return true; }, apply() { return deepNoop(); }, construct() { return deepNoop(); },
  });
  return p;
}
function fake2dContext(canvas, state) {
  state.unavailable.push({ api: 'canvas-2d', detail: 'getContext("2d") -> no-op context (nothing is rasterised; getImageData returns zeros)' });
  state.degraded.add('canvas-2d: no-op context');
  const fields = {};
  const extra = {
    canvas,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }),
    createImageData: (w, h) => (typeof w === 'object' ? { data: new Uint8ClampedArray(w.width * w.height * 4), width: w.width, height: w.height } : { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    measureText: (t) => ({ width: String(t).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: String(t).length * 8, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 3 }),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), createPattern: () => ({}),
    save() {}, restore() {}, isPointInPath: () => false,
  };
  return new Proxy(deepNoop(extra), { get(t, p, r) { if (p in fields) return fields[p]; return Reflect.get(t, p, r); }, set(_t, p, v) { fields[p] = v; return true; } });
}

function readAsset(publicDir, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rels = [];
  const m = clean.match(/^\/?TypeGPU\/(.*)$/); if (m) rels.push(m[1]);
  rels.push(clean.replace(/^\/+/, ''));
  for (const rel of rels) {
    const f = path.join(publicDir, rel);
    if (!f.startsWith(publicDir)) continue;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return { file: f, buf: fs.readFileSync(f) };
  }
  return null;
}

function decodeImage(buf, state) {
  const b = new Uint8Array(buf);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) { const p = PNG.sync.read(Buffer.from(b)); return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data.buffer, p.data.byteOffset, p.data.length) }; }
  if (b[0] === 0xff && b[1] === 0xd8) { const j = jpeg.decode(Buffer.from(b), { useTArray: true, formatAsRGBA: true }); return { width: j.width, height: j.height, data: new Uint8ClampedArray(j.data.buffer, j.data.byteOffset, j.data.length) }; }
  state.unavailable.push({ api: 'image-decode', detail: `unsupported image bytes (head ${Buffer.from(b.slice(0, 4)).toString('hex')}): only PNG and JPEG are decoded` });
  throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
}

class FakeImageBitmap {
  constructor(img) { this.width = img.width; this.height = img.height; this.__rgba = img.data; this.closed = false; }
  close() { this.closed = true; }
}

export function installDom(state, { publicDir, seed }) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost:4321/TypeGPU/', runScripts: 'outside-only' });
  const win = dom.window;
  state.dom = dom;
  const G = globalThis;

  state.time = TIME_BASE;
  const now = () => state.time;
  Object.defineProperty(G.performance, 'now', { value: now, configurable: true, writable: true });
  Object.defineProperty(win.performance, 'now', { value: now, configurable: true, writable: true });
  state.randomCalls = 0; const rnd = mulberry32(seed);
  Math.random = () => { state.randomCalls++; return rnd(); };

  for (const k of ['document', 'Node', 'Element', 'HTMLElement', 'HTMLCanvasElement', 'HTMLVideoElement', 'HTMLImageElement', 'HTMLInputElement', 'HTMLDivElement', 'HTMLButtonElement', 'HTMLSelectElement', 'SVGElement', 'Event', 'CustomEvent', 'UIEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent', 'WheelEvent', 'TouchEvent', 'FocusEvent', 'MutationObserver', 'DOMParser', 'getComputedStyle', 'localStorage', 'sessionStorage', 'location', 'screen', 'DocumentFragment', 'ShadowRoot', 'CSSStyleDeclaration', 'DOMRect', 'DOMRectReadOnly', 'DOMMatrix', 'DOMPoint', 'DOMException', 'ProgressEvent', 'ErrorEvent', 'MessageEvent', 'StorageEvent', 'Text', 'Comment', 'HTMLAnchorElement', 'HTMLScriptElement', 'HTMLStyleElement', 'HTMLLinkElement', 'HTMLTextAreaElement', 'HTMLSpanElement', 'XMLHttpRequest', 'FileReader']) {
    try { Object.defineProperty(G, k, { value: win[k], configurable: true, writable: true }); } catch {}
  }
  Object.defineProperty(G, 'window', { value: win, configurable: true, writable: true });
  Object.defineProperty(G, 'self', { value: win, configurable: true, writable: true });
  win.innerWidth = 1024; win.innerHeight = 768; win.devicePixelRatio = 1; win.outerWidth = 1024; win.outerHeight = 768;
  Object.defineProperty(G, 'devicePixelRatio', { value: 1, configurable: true, writable: true });
  Object.defineProperty(G, 'innerWidth', { value: 1024, configurable: true, writable: true });
  Object.defineProperty(G, 'innerHeight', { value: 768, configurable: true, writable: true });
  for (const m of ['addEventListener', 'removeEventListener', 'dispatchEvent']) { }
  win.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  Object.defineProperty(G, 'matchMedia', { value: win.matchMedia, configurable: true, writable: true });
  Object.defineProperty(G, 'navigator', {
    configurable: true, writable: true,
    value: {
      gpu: state.gpuProxy, userAgent: CHROME_UA, platform: 'MacIntel', language: 'en-US', languages: ['en-US'], hardwareConcurrency: 8, maxTouchPoints: 0, onLine: true, clipboard: {},
      mediaDevices: {
        getUserMedia: async () => { state.unavailable.push({ api: 'camera', detail: 'navigator.mediaDevices.getUserMedia' }); throw new DOMException('Requested device not found', 'NotFoundError'); },
        enumerateDevices: async () => [], addEventListener() {}, removeEventListener() {},
      },
    },
  });
  Object.defineProperty(win, 'navigator', { value: G.navigator, configurable: true });
  document_fonts(win);

  const oAdd = win.EventTarget.prototype.addEventListener;
  win.EventTarget.prototype.addEventListener = function (type, listener, opts) {
    if (opts && typeof opts === 'object' && opts.signal) {
      const sig = opts.signal; if (sig.aborted) return; const { signal, ...rest } = opts;
      oAdd.call(this, type, listener, rest); sig.addEventListener('abort', () => this.removeEventListener(type, listener, rest), { once: true }); return;
    }
    return oAdd.call(this, type, listener, opts);
  };
  for (const m of ['setPointerCapture', 'releasePointerCapture', 'requestPointerLock', 'requestFullscreen']) win.Element.prototype[m] = function () {};
  win.Element.prototype.hasPointerCapture = () => false;
  win.document.exitPointerLock = () => {};

  const canvasState = new WeakMap();
  const cs = (c) => { let s = canvasState.get(c); if (!s) { s = { w: 256, h: 256 }; canvasState.set(c, s); } return s; };
  const proto = win.HTMLCanvasElement.prototype;
  Object.defineProperty(proto, 'width', { get() { return cs(this).w; }, set(v) { cs(this).w = v >>> 0; }, configurable: true });
  Object.defineProperty(proto, 'height', { get() { return cs(this).h; }, set(v) { cs(this).h = v >>> 0; }, configurable: true });
  Object.defineProperty(proto, 'clientWidth', { get: () => 256, configurable: true });
  Object.defineProperty(proto, 'clientHeight', { get: () => 256, configurable: true });
  Object.defineProperty(proto, 'offsetWidth', { get: () => 256, configurable: true });
  Object.defineProperty(proto, 'offsetHeight', { get: () => 256, configurable: true });
  proto.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 256, bottom: 256, width: 256, height: 256 });
  proto.toDataURL = () => 'data:,'; proto.toBlob = (cb) => cb?.(new Blob([]));
  const ctxCache = new WeakMap();
  proto.getContext = function (type) {
    if (ctxCache.has(this) && ctxCache.get(this).type === type) return ctxCache.get(this).ctx;
    let ctx = null;
    if (type === 'webgpu') ctx = makeWebGPUContext(this, state, cs);
    else if (type === '2d') ctx = fake2dContext(this, state);
    else { state.unavailable.push({ api: type, detail: `canvas.getContext("${type}") returns null (no WebGL in the runner)` }); ctx = null; }
    if (ctx) ctxCache.set(this, { type, ctx });
    return ctx;
  };
  class FakeOffscreenCanvas {
    constructor(w, h) { this.width = w; this.height = h; this.__blankCanvas = true; }
    getContext(t) { if (t === '2d') return fake2dContext(this, state); state.unavailable.push({ api: t, detail: 'OffscreenCanvas.getContext' }); return null; }
    async convertToBlob() { state.unavailable.push({ api: 'OffscreenCanvas.convertToBlob', detail: '' }); throw new DOMException('convertToBlob unavailable', 'NotSupportedError'); }
    transferToImageBitmap() { return new FakeImageBitmap({ width: this.width, height: this.height, data: new Uint8ClampedArray(this.width * this.height * 4) }); }
  }
  G.OffscreenCanvas = FakeOffscreenCanvas;
  G.VideoFrame = class VideoFrame {}; G.WebGL2RenderingContext = class WebGL2RenderingContext {}; G.WebGLRenderingContext = class WebGLRenderingContext {}; G.ImageBitmapRenderingContext = class ImageBitmapRenderingContext {};
  G.ImageBitmap = FakeImageBitmap;
  G.ImageData = class ImageData { constructor(a, b, c) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = c ?? a.length / 4 / b; } this.colorSpace = 'srgb'; } };
  G.createImageBitmap = async (src, a, b, c, d, e) => {
    state.lastActivity = Date.now();
    let opts = {}, crop = null;
    if (typeof a === 'number') { crop = [a, b, c, d]; opts = e ?? {}; } else opts = a ?? {};
    let img;
    if (src instanceof FakeImageBitmap) img = { width: src.width, height: src.height, data: src.__rgba };
    else if (src && src.__blankCanvas) img = { width: src.width, height: src.height, data: new Uint8ClampedArray(src.width * src.height * 4) };
    else if (src && src.tagName === 'CANVAS') { state.degraded.add('canvas-2d: HTMLCanvasElement as image source is blank'); img = { width: src.width, height: src.height, data: new Uint8ClampedArray(src.width * src.height * 4) }; }
    else if (src && src.data && src.width) img = { width: src.width, height: src.height, data: src.data };
    else if (src && typeof src.arrayBuffer === 'function') img = decodeImage(await src.arrayBuffer(), state);
    else if (src && src.__rgba) img = { width: src.width, height: src.height, data: src.__rgba };
    else { state.unavailable.push({ api: 'createImageBitmap-source', detail: String(src?.constructor?.name) }); throw new DOMException('createImageBitmap: unsupported source', 'InvalidStateError'); }
    let { width: w, height: h, data } = img;
    if (crop) { const [sx, sy, sw, sh] = crop; const out = new Uint8ClampedArray(sw * sh * 4); for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const si = ((sy + y) * w + sx + x) * 4; out.set(data.subarray(si, si + 4), (y * sw + x) * 4); } data = out; w = sw; h = sh; }
    const rw = opts.resizeWidth ?? (opts.resizeHeight ? Math.round(w * opts.resizeHeight / h) : w), rh = opts.resizeHeight ?? (opts.resizeWidth ? Math.round(h * opts.resizeWidth / w) : h);
    const flip = opts.imageOrientation === 'flipY';
    if (rw !== w || rh !== h || flip) {
      const out = new Uint8ClampedArray(rw * rh * 4);
      for (let y = 0; y < rh; y++) { const sy = Math.min(h - 1, Math.floor((flip ? rh - 1 - y : y) * h / rh)); for (let x = 0; x < rw; x++) { const sx = Math.min(w - 1, Math.floor(x * w / rw)); out.set(data.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * rw + x) * 4); } }
      data = out; w = rw; h = rh;
    }
    if (opts.premultiplyAlpha === 'premultiply') { data = new Uint8ClampedArray(data); for (let i = 0; i < data.length; i += 4) { const a2 = data[i + 3] / 255; data[i] = Math.round(data[i] * a2); data[i + 1] = Math.round(data[i + 1] * a2); data[i + 2] = Math.round(data[i + 2] * a2); } }
    return new FakeImageBitmap({ width: w, height: h, data });
  };
  G.Image = class FakeImage {
    constructor() { this.width = 0; this.height = 0; this.complete = false; this.onload = null; this.onerror = null; this.__src = ''; }
    set src(v) {
      this.__src = v;
      (async () => { try { const r = await G.fetch(v); if (!r.ok) throw new Error('404'); const img = decodeImage(await r.arrayBuffer(), state); this.width = img.width; this.height = img.height; this.__rgba = img.data; this.complete = true; this.onload?.({}); } catch (e) { this.onerror?.(e); } })();
    }
    get src() { return this.__src; }
    async decode() { while (!this.complete) await new Promise((r) => setTimeout(r, 5)); }
    addEventListener(t, f) { if (t === 'load') this.onload = f; if (t === 'error') this.onerror = f; } removeEventListener() {}
  };
  G.Audio = class { play() { return Promise.resolve(); } pause() {} addEventListener() {} };
  G.AudioContext = class { constructor() { state.degraded.add('audio: AudioContext is a no-op fake'); this.destination = {}; this.currentTime = 0; this.state = 'running'; }
    createGain() { return { connect() {}, gain: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {} } }; }
    createBufferSource() { return { buffer: null, loop: false, playbackRate: { value: 0, setTargetAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    async decodeAudioData() { return null; } resume() { return Promise.resolve(); } };
  G.Worker = class { constructor() { state.unavailable.push({ api: 'Worker', detail: '' }); throw new Error('Worker not available in the runner'); } };

  state.pendingShort = new Set();
  const realST = G.setTimeout, realCT = G.clearTimeout;
  const wrapST = function (fn, ms, ...a) {
    if (typeof fn !== 'function') return realST(fn, ms, ...a);
    const short = (Number(ms) || 0) <= 2000; let h;
    h = realST(function () { state.pendingShort.delete(h); return fn.apply(this, arguments); }, ms, ...a);
    if (short) state.pendingShort.add(h); return h;
  };
  const wrapCT = (h) => { state.pendingShort.delete(h); return realCT(h); };
  for (const o of [G, win]) { o.setTimeout = wrapST; o.clearTimeout = wrapCT; }

  G.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe(el) { setTimeout(() => { try { this.cb([{ target: el, contentRect: { width: 256, height: 256, x: 0, y: 0, top: 0, left: 0, right: 256, bottom: 256 }, contentBoxSize: [{ inlineSize: 256, blockSize: 256 }], borderBoxSize: [{ inlineSize: 256, blockSize: 256 }], devicePixelContentBoxSize: [{ inlineSize: 256, blockSize: 256 }] }], this); } catch (e) { state.jsErrors.push({ stage: state.stage, where: 'ResizeObserver callback', message: String(e?.message ?? e), stack: String(e?.stack ?? '').split('\n').slice(0, 6).join('\n') }); } }, 0); } unobserve() {} disconnect() {} };
  win.ResizeObserver = G.ResizeObserver;
  G.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.IntersectionObserver = G.IntersectionObserver;

  state.raf = [];
  let rafId = 0;
  const raf = (cb) => { state.lastActivity = Date.now(); state.raf.push({ id: ++rafId, cb }); return rafId; };
  const caf = (id) => { const i = state.raf.findIndex((r) => r.id === id); if (i >= 0) state.raf.splice(i, 1); };
  for (const o of [G, win]) { o.requestAnimationFrame = raf; o.cancelAnimationFrame = caf; }
  win.HTMLVideoElement.prototype.requestVideoFrameCallback = function () { state.unavailable.push({ api: 'video', detail: 'requestVideoFrameCallback' }); return 0; };
  win.HTMLVideoElement.prototype.cancelVideoFrameCallback = () => {};
  win.HTMLMediaElement.prototype.play = function () { state.unavailable.push({ api: 'video', detail: 'HTMLMediaElement.play' }); return Promise.reject(new DOMException('play() unavailable in the runner', 'NotSupportedError')); };
  win.HTMLMediaElement.prototype.pause = function () {};
  win.HTMLMediaElement.prototype.load = function () {};

  const realFetch = G.fetch;
  state.fetches = [];
  G.fetch = async (input, init) => {
    state.lastActivity = Date.now();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url ?? String(input);
    if (/^(data|blob):/.test(url)) return realFetch(input, init);
    let p = url;
    try { const u = new URL(url, 'http://localhost:4321/TypeGPU/'); if (u.hostname === 'localhost') p = u.pathname; else { state.fetches.push({ url, status: 'network-blocked' }); state.unavailable.push({ api: 'network', detail: u.hostname }); return new Response(null, { status: 404, statusText: 'offline (runner has no network)' }); } } catch {}
    const a = readAsset(publicDir, p);
    if (!a) { state.fetches.push({ url, status: 404 }); return new Response(null, { status: 404, statusText: 'not found in public dir' }); }
    state.fetches.push({ url, status: 200, bytes: a.buf.length });
    return new Response(a.buf, { status: 200, headers: { 'Content-Type': MIME[path.extname(a.file).toLowerCase()] ?? 'application/octet-stream' } });
  };
  win.fetch = G.fetch;
  const RealRequest = G.Request;
  G.Request = class Request extends RealRequest { constructor(i, o) { super(typeof i === 'string' && !/^[a-z][a-z0-9+.-]*:/i.test(i) ? new URL(i, 'http://localhost:4321/TypeGPU/').href : i, o); } };
  return { win };
}

function document_fonts(win) { Object.defineProperty(win.document, 'fonts', { value: { load: async () => [{}], ready: Promise.resolve(), check: () => true, add() {}, addEventListener() {} }, configurable: true }); }

function makeWebGPUContext(canvas, state, cs) {
  const c = { idx: state.canvases.length, device: null, format: 'bgra8unorm', alphaMode: 'opaque', tex: null, fresh: true, frames: 0, usage: 0 };
  state.canvases.push(c);
  return {
    canvas,
    configure(o) { c.device = o.device; c.format = o.format; c.alphaMode = o.alphaMode ?? 'opaque'; c.usage = o.usage ?? GPUTextureUsage.RENDER_ATTACHMENT; c.tex = null; c.fresh = true; c.cfg = { format: o.format, alphaMode: o.alphaMode, usage: o.usage, viewFormats: o.viewFormats, colorSpace: o.colorSpace, toneMapping: o.toneMapping }; },
    unconfigure() { c.device = null; },
    getCurrentTexture() {
      if (!c.device) throw new DOMException('canvas context is not configured', 'InvalidStateError');
      const w = cs(canvas).w || 1, h = cs(canvas).h || 1;
      if (c.fresh || !c.tex || c.tex.width !== w || c.tex.height !== h) {
        c.tex = c.device.createTexture({ label: '__canvas__', size: [w, h], format: c.format, usage: c.usage | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT, viewFormats: c.cfg?.viewFormats });
        c.fresh = false; c.frames++;
      }
      return c.tex;
    },
    getConfiguration() { return c.cfg ?? null; },
  };
}

export async function interact(state, mod) {
  const win = state.dom.window; const errs = [];
  const canvases = [...win.document.querySelectorAll('canvas')];
  const mk = (Ctor, type, init) => new Ctor(type, { bubbles: true, cancelable: true, composed: true, view: win, ...init });
  const fire = (el, ev) => { try { el.dispatchEvent(ev); } catch (e) { errs.push(`dispatch ${ev.type}: ${e?.message}`); } };
  const PE = win.PointerEvent ?? win.MouseEvent;
  for (const cv of canvases.slice(0, 2)) {
    const pt = (x, y, extra = {}) => ({ clientX: x, clientY: y, offsetX: x, offsetY: y, pageX: x, pageY: y, screenX: x, screenY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, ...extra });
    fire(cv, mk(PE, 'pointermove', pt(128, 128))); fire(cv, mk(win.MouseEvent, 'mousemove', pt(128, 128)));
    fire(cv, mk(PE, 'pointerdown', pt(128, 128, { buttons: 1 }))); fire(cv, mk(win.MouseEvent, 'mousedown', pt(128, 128, { buttons: 1 })));
    for (let i = 1; i <= 3; i++) { fire(cv, mk(PE, 'pointermove', pt(128 + 10 * i, 128 + 6 * i, { buttons: 1, movementX: 10, movementY: 6 }))); fire(cv, mk(win.MouseEvent, 'mousemove', pt(128 + 10 * i, 128 + 6 * i, { buttons: 1, movementX: 10, movementY: 6 }))); }
    fire(cv, mk(PE, 'pointerup', pt(158, 146))); fire(cv, mk(win.MouseEvent, 'mouseup', pt(158, 146)));
    fire(cv, mk(win.WheelEvent, 'wheel', { deltaY: 100, clientX: 128, clientY: 128 }));
  }
  for (const k of ['w', 'a', 's', 'd', ' ']) { for (const t of [win, win.document]) { fire(t, mk(win.KeyboardEvent, 'keydown', { key: k, code: k === ' ' ? 'Space' : 'Key' + k.toUpperCase() })); fire(t, mk(win.KeyboardEvent, 'keyup', { key: k, code: k === ' ' ? 'Space' : 'Key' + k.toUpperCase() })); } }
  fire(win, mk(win.Event, 'resize', {}));
  const controls = mod?.controls && typeof mod.controls === 'object' ? mod.controls : {};
  const names = [];
  for (const [name, c] of Object.entries(controls)) {
    if (!c || typeof c !== 'object') continue;
    try {
      let r;
      if (typeof c.onButtonClick === 'function') { r = c.onButtonClick(); names.push(`${name}:button`); }
      else if (typeof c.onSelectChange === 'function' && Array.isArray(c.options)) { const o = c.options.find((x) => x !== c.initial) ?? c.options[0]; r = c.onSelectChange(o); names.push(`${name}:select=${String(o).slice(0, 20)}`); }
      else if (typeof c.onToggleChange === 'function') { r = c.onToggleChange(!c.initial); names.push(`${name}:toggle`); }
      else if (typeof c.onSliderChange === 'function' && typeof c.initial === 'number') { const lo = c.min ?? 0, hi = c.max ?? c.initial * 2 + 1; const st = c.step ?? 1; r = c.onSliderChange(lo + Math.round((hi - lo) / 2 / st) * st); names.push(`${name}:slider`); }
      if (r && typeof r.then === 'function') await Promise.race([r, new Promise((_, rej) => setTimeout(() => rej(new Error('control timed out (5s)')), 5000))]);
    } catch (e) { errs.push(`control ${name}: ${String(e?.message ?? e).slice(0, 300)}`); }
  }
  return { controlsTriggered: names, errors: errs };
}
