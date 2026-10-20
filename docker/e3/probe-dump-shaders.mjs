import { create, globals } from 'webgpu';
Object.assign(globalThis, globals);
const gpu = create(['enable-dawn-features=dump_shaders,disable_symbol_renaming']);
const adapter = await gpu.requestAdapter();
console.log('ADAPTER', adapter.info.device);
const dev = await adapter.requestDevice();
const body = {
  mod: 'o[0] = a[0] % a[1];',
  manual: 'let t = trunc(a[0] / a[1]); o[0] = a[0] - a[1] * t;',
  log: 'o[0] = log(a[0]);',
  log2: 'o[0] = log2(a[0]);',
  normalize: 'let v = normalize(vec3f(a[0], a[1], a[2])); o[0] = v.x;',
  pow: 'o[0] = pow(a[0], a[1]);',
};
for (const [name, b] of Object.entries(body)) {
  console.log(`\n=====CASE ${name}`);
  const code = `@group(0) @binding(0) var<storage, read> a: array<f32>;\n@group(0) @binding(1) var<storage, read_write> o: array<f32>;\n@compute @workgroup_size(1) fn main() { ${b} }`;
  const m = dev.createShaderModule({ code });
  dev.createComputePipeline({ layout: 'auto', compute: { module: m, entryPoint: 'main' } });
  await dev.queue.onSubmittedWorkDone();
}
process.exit(0);
