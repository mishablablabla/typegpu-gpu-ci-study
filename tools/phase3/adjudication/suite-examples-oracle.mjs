import fs from 'node:fs'; import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
const OUTP = process.argv[2] ? (await import('node:path')).resolve(process.argv[2]) : null; if (!OUTP) throw new Error('usage: node suite-examples-oracle.mjs <abs-or-rel out.json>'); const CWD0 = process.cwd();
const { FP } = require('../../../third_party/cts-oracle.cjs'); process.chdir(CWD0);
const S = new URL('../../../runs/phase2/investigations-suites', import.meta.url).pathname;
const RUNS = { metal: `${S}/metal-run1`, lav: `${S}/lavapipe-arm64-run3`, ssA: `${S}/swiftshader-arm64-run3` };
const IV = { asin: (a) => FP.f32.asinInterval(a[0]), acos: (a) => FP.f32.acosInterval(a[0]), fract: (a) => FP.f32.fractInterval(a[0]),
  mix: (a) => { const Is = FP.f32.mixIntervals.map((f) => f(a[0], a[1], a[2])); return Is; } };
const num1 = (t) => { t = t.trim(); const m = t.replace(/\(0x[0-9a-fA-F]+\)$/, '').trim(); if (/^-?inf(inity)?$/i.test(m)) return m.startsWith('-') ? -Infinity : Infinity; if (/^-?nan$/i.test(m)) return NaN; return Number(m); };
const parse = (s) => s.trim().replace(/^\[|\]$/g, '').split(',').map(num1);
const out = {}; const inc = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
for (const [b, dir] of Object.entries(RUNS)) {
  const d = JSON.parse(fs.readFileSync(`${dir}/suites/vector-fns/results.json`, 'utf8'));
  for (const r of d.runtimeMatrix) { const fn = r.fn; const base = fn === 'mix_s' ? 'mix' : fn; if (!IV[base]) continue;
    for (const kind of ['gpuExactFail', 'gpuBoundFail', 'obsWorstGpu', 'cpuGpuWorst']) for (const ex of r.examples[kind] ?? []) {
      const lanes = ex.args.length;
      const A = ex.args.map(parse); const G = parse(ex.gpu); const n = G.length;
      for (let l = 0; l < n; l++) { const a = A.map((x) => (x.length > 1 ? x[l] : x[0])); const gpu = G[l]; let inside, I, cat;
        const Is = base === 'mix' ? IV.mix(a) : [IV[base](a)]; const unb = (i) => i.begin === -Infinity && i.end === Infinity; inside = Is.some((i) => !Number.isNaN(gpu) && i.begin <= gpu && gpu <= i.end); I = Is.map((i) => [i.begin, i.end]);
        cat = a.some(Number.isNaN) ? 'indeterminate' : inside ? (Is.every(unb) ? 'indeterminate' : 'accepted') : Is.some(unb) ? 'indeterminate' : 'rejected'; if (Is.every(unb)) cat = 'indeterminate';
        const key = `${b}|${r.id}`; const o = (out[key] ??= { kinds: {}, lanes: [] }); inc(o.kinds, `${kind}:${cat}`); o.lanes.push({ kind, a, gpu: String(gpu), cat, I: I.map((p) => p.map(String)) }); } } } }
fs.writeFileSync(OUTP, JSON.stringify(out, null, 1));
const agg = {}; for (const [k, v] of Object.entries(out)) { const [b, id] = k.split('|'); const fn = id.split(':')[0]; const seen = new Set(); for (const l of v.lanes) { const key = JSON.stringify([l.a, l.gpu]); if (seen.has(key)) continue; seen.add(key); const A = (agg[`${b}|${fn}`] ??= { accepted: 0, rejected: 0, indeterminate: 0 }); A[l.cat]++; } }
console.log(JSON.stringify(agg, null, 0));
