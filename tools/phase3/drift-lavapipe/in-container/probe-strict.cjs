const { create } = require('../third_party/dawn-node-provider.js');
const info = (a) => { const i = a.info; return { vendor: i.vendor, architecture: i.architecture, device: i.device, description: i.description, isFallbackAdapter: i.isFallbackAdapter, subgroupMinSize: i.subgroupMinSize, subgroupMaxSize: i.subgroupMaxSize }; };
(async () => {
  const out = { probe: 'strict/1' };
  const gpu = create(process.env.PROBE_FLAGS ? process.env.PROBE_FLAGS.split(',') : []);
  const strict = await gpu.requestAdapter({ forceFallbackAdapter: true });
  const plain = await gpu.requestAdapter();
  out.strictAdapterNull = strict === null; out.plainAdapterNull = plain === null;
  if (strict) out.strict = info(strict);
  if (plain) {
    out.plain = info(plain); out.features = [...plain.features].sort(); out.shaderF16 = plain.features.has('shader-f16');
    out.limits = Object.fromEntries(Object.keys(Object.getPrototypeOf(plain.limits)).concat(Object.keys(plain.limits)).filter((k, i, a) => a.indexOf(k) === i).map((k) => [k, plain.limits[k]]).filter(([, v]) => typeof v === 'number'));
    out.sameAdapterStrictVsPlain = !!strict && strict.info.device === plain.info.device;
    try { const a1 = await gpu.requestAdapter(); const d = await a1.requestDevice({ requiredFeatures: [...a1.features], requiredLimits: out.limits }); out.ctsStyleDevice = 'ok'; d.destroy(); } catch (e) { out.ctsStyleDevice = 'FAILED: ' + String(e && e.message || e).slice(0, 300); }
    try { const a2 = await gpu.requestAdapter(); const d = await a2.requestDevice(); out.defaultDevice = 'ok'; d.destroy(); } catch (e) { out.defaultDevice = 'FAILED: ' + String(e && e.message || e).slice(0, 300); }
  }
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})().catch((e) => { console.log(JSON.stringify({ probe: 'strict/1', error: String(e && e.stack || e) })); process.exit(0); });
