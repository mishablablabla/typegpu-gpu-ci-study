import fs from 'node:fs';
const S = new URL('../../../runs/phase2', import.meta.url).pathname;
const X = `${S}/native-x64/run-39287075791/cmp-x64-results-39287075791-1/typegpu-example-runs`;
const RUNS = { metal: `${S}/typegpu-example-runs/metal-run1`, lavapipeArm64: `${S}/typegpu-example-runs/lavapipe-arm64-run1`, swiftshaderArm64: `${S}/typegpu-example-runs/swiftshader-arm64-run1`, lavapipeX64: `${X}/lavapipe-x64-run1`, swiftshaderX64: `${X}/swiftshader-x64-run1` };
const u = new Uint32Array(1), f = new Float32Array(u.buffer); const dec = (b) => { u[0] = typeof b === 'string' ? parseInt(b, 16) : b >>> 0; return f[0]; };
const out = {};
for (const [b, d] of Object.entries(RUNS)) { const j = JSON.parse(fs.readFileSync(`${d}/results-default/probability.json`, 'utf8')).data; out[b] = {};
  for (const k of ['onUnitCircle', 'onUnitSphere', 'onHemisphere']) { const v = j[k].bits.map(dec); let mx = 0, sum = 0, n = 0; for (let i = 0; i < v.length; i += 3) { const nrm = k === 'onUnitCircle' ? Math.hypot(v[i], v[i + 1]) : Math.hypot(v[i], v[i + 1], v[i + 2]); const e = Math.abs(nrm - 1); mx = Math.max(mx, e); sum += e; n++; } out[b][k] = { n, maxAbsDev: mx, meanAbsDev: sum / n }; } }
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1)); for (const [b, o] of Object.entries(out)) console.log(b.padEnd(18), Object.entries(o).map(([k, v]) => `${k} max ${v.maxAbsDev.toExponential(2)} mean ${v.meanAbsDev.toExponential(2)}`).join(' | '));
