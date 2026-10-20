import { create, globals } from 'webgpu';
import crypto from 'node:crypto';

export const sha256 = (u8) => crypto.createHash('sha256').update(u8).digest('hex');

export const FORMAT_BPP = {
  r8unorm: 1, r8snorm: 1, r8uint: 1, r8sint: 1, rg8unorm: 2, rg8snorm: 2, rg8uint: 2, rg8sint: 2,
  rgba8unorm: 4, 'rgba8unorm-srgb': 4, rgba8snorm: 4, rgba8uint: 4, rgba8sint: 4, bgra8unorm: 4, 'bgra8unorm-srgb': 4,
  r16uint: 2, r16sint: 2, r16float: 2, rg16uint: 4, rg16sint: 4, rg16float: 4, rgba16uint: 8, rgba16sint: 8, rgba16float: 8,
  r32uint: 4, r32sint: 4, r32float: 4, rg32uint: 8, rg32sint: 8, rg32float: 8, rgba32uint: 16, rgba32sint: 16, rgba32float: 16,
  rgb10a2unorm: 4, rgb10a2uint: 4, rg11b10ufloat: 4, depth32float: 4,
};
const align = (n, a) => Math.ceil(n / a) * a;

export function installGpu(state) {
  Object.assign(globalThis, globals);
  const gpu = create([]);
  globalThis.__gpu = gpu; // dawn.node crashes ("mutex lock failed") if the create() result is garbage collected
  state.gpu = gpu;
  const hide = new Set((process.env.HIDE_FEATURES ?? '').split(',').filter(Boolean));
  state.hiddenFeatures = [...hide]; state.pending = 0;

  const unavailable = (api, detail) => { state.unavailable.push({ api, detail }); };
  state.markUnavailable = unavailable;

  const gpuProxy = new Proxy(gpu, {
    get(t, p) {
      if (p === 'requestAdapter') return async (opts) => {
        const a = await gpu.requestAdapter(opts);
        state.adapterRequests.push({ opts: opts ?? null, got: !!a });
        if (!a) return a;
        const feats = new Set([...a.features].filter((f) => !hide.has(f)));
        state.adapter = {
          vendor: a.info.vendor, architecture: a.info.architecture, device: a.info.device, description: a.info.description,
          features: [...a.features].sort(), exposedFeatures: [...feats].sort(), hidden: [...hide],
          limits: Object.fromEntries(Object.keys(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(a.limits))).filter((k) => typeof a.limits[k] === 'number').map((k) => [k, a.limits[k]])),
        };
        return new Proxy(a, {
          get(at, ap) {
            if (ap === 'features') return feats;
            if (ap === 'requestDevice') return (desc) => requestDevice(at, desc, hide);
            const v = Reflect.get(at, ap);
            return typeof v === 'function' ? v.bind(at) : v;
          },
        });
      };
      if (p === 'getPreferredCanvasFormat') return () => 'bgra8unorm';
      const v = Reflect.get(t, p);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });

  async function requestDevice(adapter, desc, hide) {
    const rec = {
      requiredFeatures: [...(desc?.requiredFeatures ?? [])], requiredLimits: desc?.requiredLimits ? { ...desc.requiredLimits } : {},
      label: desc?.label ?? null, ok: false, message: null,
    };
    state.deviceRequests.push(rec);
    const bad = rec.requiredFeatures.filter((f) => hide.has(f));
    let dev;
    try {
      if (bad.length) throw new TypeError(`Required feature ${bad.join(',')} is not supported by the adapter (hidden by HIDE_FEATURES)`);
      dev = await adapter.requestDevice(desc);
    } catch (e) { rec.message = String(e?.message ?? e).slice(0, 400); throw e; }
    rec.ok = true; rec.features = [...dev.features].sort();
    instrument(dev, state.devices.length);
    return dev;
  }

  function instrument(dev, idx) {
    const d = { idx, dev, buffers: [], textures: [], shaderModules: [], submits: 0, lostInfo: null };
    state.devices.push(d);
    dev.addEventListener('uncapturederror', (e) => {
      state.gpuErrors.push({ device: idx, stage: state.stage, kind: e.error?.constructor?.name, message: String(e.error?.message ?? e.error).slice(0, 700) });
      state.lastActivity = Date.now();
      try { e.preventDefault(); } catch {}
    });
    dev.lost.then((info) => { d.lostInfo = { reason: info.reason, message: String(info.message).slice(0, 300), stage: state.stage }; state.deviceLost.push({ device: idx, ...d.lostInfo }); }).catch(() => {});

    for (const name of ['createComputePipelineAsync', 'createRenderPipelineAsync']) {
      const o = dev[name]; if (typeof o !== 'function') continue;
      dev[name] = function (...a) { state.pending++; const p = o.apply(this, a); const done = () => { state.pending--; state.lastActivity = Date.now(); }; p.then(done, done); return p; };
    }
    const cb = dev.createBuffer;
    dev.createBuffer = function (desc) {
      const b = cb.call(this, desc);
      const rec = { buf: b, size: desc.size, usage: desc.usage, label: desc.label ?? '', destroyed: false, n: d.buffers.length, mappedAtCreation: !!desc.mappedAtCreation };
      d.buffers.push(rec);
      const od = b.destroy; b.destroy = function () { rec.destroyed = true; return od.call(this); };
      return b;
    };
    const ct = dev.createTexture;
    dev.createTexture = function (desc) {
      const t = ct.call(this, desc);
      const rec = { tex: t, desc: { ...desc, size: normSize(desc.size) }, label: desc.label ?? '', destroyed: false, n: d.textures.length };
      d.textures.push(rec);
      const od = t.destroy; t.destroy = function () { rec.destroyed = true; return od.call(this); };
      return t;
    };
    const csm = dev.createShaderModule;
    dev.createShaderModule = function (desc) {
      const m = csm.call(this, desc);
      const rec = { stage: state.stage, label: desc.label ?? '', sha256: sha256(Buffer.from(desc.code)), length: desc.code.length, code: desc.code, compileErrors: [] };
      d.shaderModules.push(rec);
      try {
        m.getCompilationInfo().then((info) => { for (const msg of info.messages) if (msg.type === 'error') rec.compileErrors.push(`${msg.lineNum}:${msg.linePos} ${msg.message}`.slice(0, 400)); }).catch(() => {});
      } catch {}
      return m;
    };
    const q = dev.queue;
    const osub = q.submit;
    q.submit = function (cbs) { d.submits++; state.submits++; state.lastActivity = Date.now(); return osub.call(this, cbs); };
    const f16 = (x) => ArrayBuffer.isView(x) && x.constructor?.name === 'Float16Array';
    const owb = q.writeBuffer, owt = q.writeTexture;
    q.writeBuffer = function (buf, off, data, dOff, size) { if (f16(data)) { state.shimFixes.float16Array++; return owb.call(this, buf, off, new Uint8Array(data.buffer, data.byteOffset, data.byteLength), dOff === undefined ? undefined : dOff * 2, size === undefined ? undefined : size * 2); } return owb.call(this, buf, off, data, dOff, size); };
    q.writeTexture = function (dst, data, layout, size) { if (f16(data)) { state.shimFixes.float16Array++; data = new Uint8Array(data.buffer, data.byteOffset, data.byteLength); } return owt.call(this, dst, data, layout, size); };
    q.copyExternalImageToTexture = function (src, dst, size) { state.lastActivity = Date.now(); return copyExternal(q, src, dst, size, state); };
    dev.importExternalTexture = function () { unavailable('video', 'importExternalTexture needs an HTMLVideoElement/VideoFrame'); throw new DOMException('importExternalTexture: video input not available in the headless runner', 'NotSupportedError'); };
  }

  if (globals.GPUBuffer?.prototype?.mapAsync) {
    const om = globals.GPUBuffer.prototype.mapAsync;
    globals.GPUBuffer.prototype.mapAsync = function (...a) { state.lastActivity = Date.now(); state.pending++; const p = om.apply(this, a); const done = () => { state.pending--; state.lastActivity = Date.now(); }; p.then(done, done); return p; };
  }
  return gpuProxy;
}

const normSize = (s) => Array.isArray(s) || ArrayBuffer.isView(s) ? { width: s[0], height: s[1] ?? 1, depthOrArrayLayers: s[2] ?? 1 } : { width: s.width, height: s.height ?? 1, depthOrArrayLayers: s.depthOrArrayLayers ?? 1 };

function copyExternal(queue, src, dst, size, state) {
  const s = src.source;
  const sz = normSize(size);
  let rgba, w, h;
  if (s && s.__rgba) { rgba = s.__rgba; w = s.width; h = s.height; }
  else if (s && s.data && s.width) { rgba = s.data; w = s.width; h = s.height; }
  else if (s && (s.__blankCanvas || s.tagName === 'CANVAS')) { w = s.width; h = s.height; rgba = new Uint8ClampedArray(w * h * 4); state.degraded.add('canvas-2d: blank (all-zero) source in copyExternalImageToTexture'); }
  else { state.markUnavailable('copyExternalImageToTexture-source', `${s?.constructor?.name ?? typeof s}`); throw new DOMException('copyExternalImageToTexture: unsupported source in the headless runner', 'NotSupportedError'); }
  const ox = (src.origin?.x ?? src.origin?.[0] ?? 0), oy = (src.origin?.y ?? src.origin?.[1] ?? 0);
  const out = new Uint8Array(sz.width * sz.height * 4);
  for (let y = 0; y < sz.height; y++) {
    const sy = src.flipY ? oy + sz.height - 1 - y : oy + y;
    for (let x = 0; x < sz.width; x++) {
      const si = ((sy) * w + ox + x) * 4, di = (y * sz.width + x) * 4;
      let r = rgba[si], g = rgba[si + 1], b = rgba[si + 2]; const a = rgba[si + 3];
      if (dst.premultipliedAlpha) { r = Math.round(r * a / 255); g = Math.round(g * a / 255); b = Math.round(b * a / 255); }
      out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = a;
    }
  }
  const fmt = dst.texture.format;
  let data = out, bpp = 4;
  if (fmt.startsWith('bgra8')) { data = new Uint8Array(out.length); for (let i = 0; i < out.length; i += 4) { data[i] = out[i + 2]; data[i + 1] = out[i + 1]; data[i + 2] = out[i]; data[i + 3] = out[i + 3]; } }
  else if (fmt.startsWith('rgba8') || fmt === 'rgb10a2unorm' && false) { }
  else if (fmt === 'r8unorm') { bpp = 1; data = new Uint8Array(sz.width * sz.height); for (let i = 0; i < data.length; i++) data[i] = out[i * 4]; }
  else if (fmt === 'rg8unorm') { bpp = 2; data = new Uint8Array(sz.width * sz.height * 2); for (let i = 0; i < sz.width * sz.height; i++) { data[i * 2] = out[i * 4]; data[i * 2 + 1] = out[i * 4 + 1]; } }
  else if (fmt === 'rgba16float' || fmt === 'rgba32float') {
    const n = sz.width * sz.height * 4; const f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = out[i] / 255;
    if (fmt === 'rgba32float') { data = new Uint8Array(f.buffer); bpp = 16; } else { const h16 = new Uint16Array(n); for (let i = 0; i < n; i++) h16[i] = toHalf(f[i]); data = new Uint8Array(h16.buffer); bpp = 8; }
  } else { state.markUnavailable('copyExternalImageToTexture-format', fmt); throw new DOMException(`copyExternalImageToTexture: dest format ${fmt} not supported by the runner shim`, 'NotSupportedError'); }
  queue.writeTexture({ texture: dst.texture, mipLevel: dst.mipLevel ?? 0, origin: dst.origin ?? [0, 0, 0] }, data, { bytesPerRow: sz.width * bpp, rowsPerImage: sz.height }, [sz.width, sz.height, 1]);
}
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function toHalf(v) {
  f32[0] = v; const x = u32[0]; const sign = (x >>> 16) & 0x8000; let e = ((x >>> 23) & 0xff) - 127 + 15; let m = x & 0x7fffff;
  if (e <= 0) return sign; if (e >= 31) return sign | 0x7c00; return sign | (e << 10) | (m >>> 13);
}
export function fromHalf(h) { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; if (e === 0) return s * m * 2 ** -24; if (e === 31) return m ? NaN : s * Infinity; return s * (1 + m / 1024) * 2 ** (e - 15); }

async function withScope(dev, fn, errs, what) {
  dev.pushErrorScope('validation');
  let r; try { r = await fn(); } catch (e) { errs.push(`${what}: ${String(e?.message ?? e).slice(0, 200)}`); }
  const e = await dev.popErrorScope(); if (e) errs.push(`${what}: validation ${String(e.message).slice(0, 200)}`);
  return r;
}
export async function readBuffer(dev, buf, size) {
  const sz = size & ~3; if (sz <= 0) return new Uint8Array(0);
  const st = dev.createBuffer({ size: sz, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = dev.createCommandEncoder(); enc.copyBufferToBuffer(buf, 0, st, 0, sz); dev.queue.submit([enc.finish()]);
  await st.mapAsync(GPUMapMode.READ); const out = new Uint8Array(st.getMappedRange().slice(0)); st.unmap(); st.destroy(); return out;
}
export async function readTexture(dev, tex, w, h, layers, bpp) {
  const bpr = align(w * bpp, 256), total = bpr * h * layers;
  const st = dev.createBuffer({ size: total, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = dev.createCommandEncoder(); enc.copyTextureToBuffer({ texture: tex }, { buffer: st, bytesPerRow: bpr, rowsPerImage: h }, [w, h, layers]); dev.queue.submit([enc.finish()]);
  await st.mapAsync(GPUMapMode.READ); const raw = new Uint8Array(st.getMappedRange().slice(0)); st.unmap(); st.destroy();
  const out = new Uint8Array(w * bpp * h * layers);
  for (let z = 0; z < layers; z++) for (let y = 0; y < h; y++) out.set(raw.subarray((z * h + y) * bpr, (z * h + y) * bpr + w * bpp), (z * h + y) * w * bpp);
  return out;
}

export const stats = (u8) => { let nz = 0; for (let i = 0; i < u8.length; i++) if (u8[i]) { nz = 1; break; } return { nonZero: !!nz }; };

export async function captureResources(state, opts = {}) {
  const { maxBuf = 8 << 20, maxTotal = 96 << 20, dumpBuf = 256 << 10, dumpTotal = 16 << 20 } = opts;
  const res = { canvases: [], buffers: [], textures: [], readbackErrors: [] };
  const dumps = [];
  let total = 0, dumped = 0;
  for (const c of state.canvases) {
    if (!c.tex || !c.device) continue;
    const w = c.tex.width, h = c.tex.height, bpp = FORMAT_BPP[c.format];
    if (!bpp) { res.canvases.push({ idx: c.idx, format: c.format, skipped: 'format' }); continue; }
    const data = await withScope(c.device, () => readTexture(c.device, c.tex, w, h, 1, bpp), res.readbackErrors, `canvas${c.idx}`);
    if (!data) continue;
    const rec = { idx: c.idx, width: w, height: h, format: c.format, alphaMode: c.alphaMode, bytes: data.length, sha256: sha256(data), ...stats(data), canvasFrames: c.frames };
    res.canvases.push(rec); dumps.push({ name: `canvas${c.idx}`, data, meta: rec, png: true });
  }
  for (const d of state.devices) {
    if (d.lostInfo) continue;
    for (const b of d.buffers) {
      if (b.destroyed || !(b.usage & GPUBufferUsage.COPY_SRC) || b.buf.mapState !== 'unmapped') continue;
      const base = { dev: d.idx, n: b.n, label: b.label, size: b.size, usage: b.usage };
      if (b.size > maxBuf || total + b.size > maxTotal) { res.buffers.push({ ...base, skipped: 'size' }); continue; }
      const data = await withScope(d.dev, () => readBuffer(d.dev, b.buf, b.size), res.readbackErrors, `buffer${d.idx}.${b.n}(${b.label})`);
      if (!data) continue; total += data.length;
      const rec = { ...base, sha256: sha256(data), ...stats(data) }; res.buffers.push(rec);
      if (data.length <= dumpBuf && dumped + data.length <= dumpTotal) { dumped += data.length; dumps.push({ name: `buf${d.idx}-${b.n}`, data, meta: rec }); }
    }
    for (const t of d.textures) {
      const D = t.desc; if (t.label === '__canvas__' || t.destroyed || !(D.usage & GPUTextureUsage.COPY_SRC)) continue;
      const bpp = FORMAT_BPP[D.format]; const base = { dev: d.idx, n: t.n, label: t.label, format: D.format, ...D.size, dimension: D.dimension ?? '2d', mips: D.mipLevelCount ?? 1, samples: D.sampleCount ?? 1 };
      if (!bpp || (D.sampleCount ?? 1) > 1 || D.format.startsWith('depth')) { res.textures.push({ ...base, skipped: 'format/ms' }); continue; }
      const bytes = D.size.width * D.size.height * D.size.depthOrArrayLayers * bpp;
      if (bytes > maxBuf || total + bytes > maxTotal) { res.textures.push({ ...base, skipped: 'size' }); continue; }
      const data = await withScope(d.dev, () => readTexture(d.dev, t.tex, D.size.width, D.size.height, D.size.depthOrArrayLayers, bpp), res.readbackErrors, `texture${d.idx}.${t.n}(${t.label})`);
      if (!data) continue; total += data.length;
      const rec = { ...base, bytes: data.length, sha256: sha256(data), ...stats(data) }; res.textures.push(rec);
      if (data.length <= dumpBuf * 4 && dumped + data.length <= dumpTotal) { dumped += data.length; dumps.push({ name: `tex${d.idx}-${t.n}`, data, meta: rec }); }
    }
  }
  return { res, dumps };
}
