import fs from 'node:fs'; import path from 'node:path';
const ROOT = new URL('../../..', import.meta.url).pathname.replace(/\/$/, ''); const S = `${ROOT}/runs/phase2`;
const X1 = `${S}/native-x64/run-39287055008/cmp-x64-results-39287055008-1`, X2 = `${S}/native-x64/run-39287075791/cmp-x64-results-39287075791-1`;
const SUITES = ['bitops', 'vector-fns', 'mul-paths', 'scalar-int', 'integer-mul', 'comptime'];
const rj = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const key = (f) => { const w = f.search(/\/(?:webgpu-poc|typegpu-gpu-ci-study)\//); if (w >= 0) return f.slice(f.indexOf('/', w + 1) + 1); const i = f.lastIndexOf('/investigations/'); return i >= 0 ? f.slice(i + 1) : f; };
function loadVitest(p) { const d = rj(p); const m = new Map(); for (const f of d.testResults) for (const a of f.assertionResults) { const k = `${key(f.name)} :: ${a.fullName}`; m.set(k, { s: a.status, msg: (a.failureMessages ?? []).join(' ').replace(/\s+/g, ' ').slice(0, 400) }); } return m; }
const suiteCfg = { 'metal': `${S}/investigations-suites/metal-run1`, 'lav-arm64-r1': `${S}/investigations-suites/lavapipe-arm64-run1`, 'lav-arm64-r3': `${S}/investigations-suites/lavapipe-arm64-run3`, 'ss-arm64-r3': `${S}/investigations-suites/swiftshader-arm64-run3`,
  'lav-x64-7763': `${X1}/investigations-suites/lavapipe-x64-run1`, 'ss-x64-7763': `${X1}/investigations-suites/swiftshader-x64-run1`, 'lav-x64-9V45': `${X2}/investigations-suites/lavapipe-x64-run1`, 'ss-x64-9V45': `${X2}/investigations-suites/swiftshader-x64-run1` };
const fullCfg = { 'metal': `${ROOT}/runs/phase1/reports/vitest.json`, 'lav-arm64-r1': `${ROOT}/runs/phase1/reports/lavapipe-full-conformance/vitest.json`, 'lav-arm64-r2': `${ROOT}/runs/phase1/reports/lavapipe-full-conformance-run2/vitest.json`,
  'ss-arm64-r1': `${S}/conformance/swiftshader-arm64-full-run1/reports/vitest.json`, 'ss-arm64-r2': `${S}/conformance/swiftshader-arm64-full-run2/reports/vitest.json`,
  'lav-x64-ci1': `${X1}/lavapipe-full/vitest.json`, 'lav-x64-ci2': `${X2}/lavapipe-full/vitest.json`, 'ss-x64-ci1': `${X1}/conformance/swiftshader-x64-full-run1/reports/vitest.json`, 'ss-x64-ci2': `${X2}/conformance/swiftshader-x64-full-run1/reports/vitest.json` };
const out = { schema: 'adj-test-inventory/1', suites: { configs: Object.keys(suiteCfg), tests: {} }, full: { configs: Object.keys(fullCfg), tests: {} } };
for (const [c, dir] of Object.entries(suiteCfg)) for (const s of SUITES) { const p = `${dir}/${s}.vitest.json`; if (!fs.existsSync(p)) { console.error('missing', p); continue; } for (const [k, v] of loadVitest(p)) { (out.suites.tests[k] ??= {})[c] = v; } }
for (const [c, p] of Object.entries(fullCfg)) { if (!fs.existsSync(p)) { console.error('missing', p); continue; } for (const [k, v] of loadVitest(p)) { (out.full.tests[k] ??= {})[c] = v; } }
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
const sum = (cfgs, T) => Object.fromEntries(cfgs.map((c) => { const r = {}; for (const t of Object.values(T)) { const s = t[c]?.s ?? 'absent'; r[s] = (r[s] ?? 0) + 1; } return [c, r]; }));
console.log('suites', JSON.stringify(sum(out.suites.configs, out.suites.tests), null, 0)); console.log('full', JSON.stringify(sum(out.full.configs, out.full.tests), null, 0));
