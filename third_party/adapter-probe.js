const { create } = require('./dawn-node-provider.js');
(async () => {
  const gpu = create(process.env.PROBE_FLAGS ? process.env.PROBE_FLAGS.split(',') : []);
  const a = await gpu.requestAdapter();
  if (!a) { console.log(JSON.stringify({ adapter: null })); return; }
  const info = a.info ?? (await a.requestAdapterInfo?.());
  console.log(JSON.stringify({ adapter: { vendor: info?.vendor, architecture: info?.architecture, device: info?.device, description: info?.description, backend: info?.backend ?? undefined, isFallbackAdapter: a.isFallbackAdapter, features: [...a.features].sort(), shaderF16: a.features.has('shader-f16') } }, null, 1));
})();
