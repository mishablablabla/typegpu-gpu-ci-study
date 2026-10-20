import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const OUT = path.resolve(process.argv[2]);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..'); const FX = `${ROOT}/runs/phase1/oracle-extension`; const SR = `${ROOT}/runs/phase2/raw`; const EV = `${ROOT}/evaluator`;
const { judge, dec, dec64, enc } = await import(`${EV}/evaluate-ext.mjs`);
const CFG = {
  A: { lav: `${FX}/groupA/lavapipe-arm64-run1`, ssA: `${SR}/groupA/swiftshader-arm64-run1`, ssX: `${SR}/groupA/swiftshader-x64-epyc9v45-ghrun39279024870-run1`, metal: `${FX}/groupA/metal-run2` },
  B: { lav: `${FX}/groupB/lavapipe-arm64-run1`, ssA: `${SR}/groupB/swiftshader-arm64-run1`, ssX: `${SR}/groupB/swiftshader-x64-epyc9v45-ghrun39279024870-run1`, metal: `${FX}/groupB/metal-run1` },
  C: { lav: `${FX}/groupC/lavapipe-arm64-run1`, ssA: `${SR}/groupC/swiftshader-arm64-run1`, ssX: `${SR}/groupC/swiftshader-x64-epyc9v45-ghrun39279024870-run1`, metal: `${FX}/groupC/metal-run1` },
  D: { lav: `${FX}/groupD/lavapipe-arm64-run1`, ssA: `${SR}/groupD/swiftshader-arm64-run1`, ssX: `${SR}/groupD/swiftshader-x64-epyc9v45-ghrun39279024870-run1`, metal: `${FX}/groupD/metal-run1` },
  L: { lav: `${FX}/groupL/lavapipe-arm64-run1`, ssA: `${SR}/groupL/swiftshader-arm64-run1`, ssX: `${SR}/groupL/swiftshader-x64-epyc9v45-ghrun39279024870-run1`, metal: `${FX}/groupL/metal-run1` },
};
const BK = ['lav', 'ssA', 'ssX', 'metal'];
const MINN = 1.1754943508222875e-38; const isSub = (x) => x !== 0 && Number.isFinite(x) && Math.abs(x) < MINN;
const f32buf = new Float32Array(1), u32buf = new Uint32Array(f32buf.buffer);
const ordinal = (x) => { f32buf[0] = x; const u = u32buf[0]; return (u & 0x80000000) ? -(u & 0x7fffffff) : u; };
const ulpDist = (a, b) => (Number.isNaN(a) || Number.isNaN(b)) ? Infinity : Math.abs(ordinal(a) - ordinal(b));
const sameVal = (a, b) => Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b));
const cls = (x) => Number.isNaN(x) ? 'nan' : !Number.isFinite(x) ? 'inf' : x === 0 ? 'zero' : isSub(x) ? 'sub' : 'normal';
const R = { schema: 'adj-lane/1', configs: CFG, groups: {}, rootCauses: {}, accuracy: {}, categoryTotals: {} };
const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
function rootKey(op, args, v, want) {
  const ac = args.map(cls);
  if (ac.includes('nan')) return 'nan-operand';
  if (ac.includes('inf')) return 'inf-operand';
  const allv = [v.lav, v.other, v.metal, want];
  if (allv.every((x, i) => i === 3 || Number.isNaN(x) || true) && !Number.isNaN(v.lav) && !Number.isNaN(v.other) && v.lav === v.other) return 'zero-sign-only';
  if (Number.isNaN(v.lav) !== Number.isNaN(v.other)) return 'nan-vs-number-result';
  if (!Number.isFinite(v.lav) || !Number.isFinite(v.other)) return 'inf-vs-finite-result';
  if (ac.includes('sub') || allv.some((x) => Number.isFinite(x) && isSub(x)) || (Number.isFinite(want) && want !== 0 && Math.abs(want) < MINN * 2)) return 'subnormal-involved';
  const dom = { log: args[0] <= 0, log2: args[0] <= 0, pow: args[0] <= 0 || args[1] === 0, mod: args[1] === 0, sqrt: args[0] < 0, inverseSqrt: args[0] <= 0 }[op];
  if (dom) return 'domain-edge';
  return 'normal-domain';
}
function relErrMargin(I, got, want) {
  const lo = I.begin, hi = I.end; if (!(Number.isFinite(lo) && Number.isFinite(hi)) || hi === lo) return null; const mid = (lo + hi) / 2, hw = (hi - lo) / 2; return Math.abs(got - mid) / hw; }
const { createRequire: cr } = await import('node:module'); const require = cr(import.meta.url); const { FP } = require(`${ROOT}/third_party/cts-oracle.cjs`);
const { CTS_FN } = await import(`${EV}/evaluate-ext.mjs`);
for (const [g, dirs] of Object.entries(CFG)) {
  const D = {}; for (const b of BK) D[b] = JSON.parse(fs.readFileSync(`${dirs[b]}/allrows-bits-ext.json`, 'utf8'));
  const G = (R.groups[g] = { lanes: 0, perBackendCat: Object.fromEntries(BK.map((b) => [b, {}])), diff: { ssA: {}, ssX: {} }, ssXvsA: {} });
  for (let gi = 0; gi < D.lav.groups.length; gi++) {
    const gl = D.lav.groups[gi]; const op = gl.op; const type = gl.type; const GKEY = `${op}/${type}`;
    const gs = Object.fromEntries(BK.map((b) => [b, D[b].groups[gi]])); for (const b of BK) if (gs[b].op !== op || gs[b].type !== type) throw new Error(`group misalignment ${g} ${GKEY} ${b}`);
    const lanes = { f32: 1, vec2f: 2, vec3f: 3, vec4f: 4 }[type]; if (!lanes) throw new Error('type ' + type);
    for (let ri = 0; ri < gl.rows.length; ri++) {
      const rows = Object.fromEntries(BK.map((b) => [b, gs[b].rows[ri]])); for (const b of BK) if (rows[b].id !== rows.lav.id) throw new Error(`row misalignment ${rows.lav.id} ${b}`);
      for (let l = 0; l < lanes; l++) {
        const r0 = rows.lav; const args = r0.inputs.map((a) => dec(a.length > 1 ? a[l] : a[0])); const want = dec64(r0.want[l]);
        const val = {}; for (const b of BK) { if (rows[b].inputs.some((a, i) => JSON.stringify(a) !== JSON.stringify(r0.inputs[i]))) throw new Error('input mismatch ' + r0.id); val[b] = dec(rows[b].gpu[l]); }
        G.lanes++;
        const J = {}; for (const b of BK) J[b] = judge(op, args, val[b]);
        for (const b of BK) inc(G.perBackendCat[b], J[b].cat);
        const I = J.lav.interval ? { begin: J.lav.interval[0], end: J.lav.interval[1] } : null;
        const wantF = Math.fround(want);
        if (BK.every((b) => J[b].cat === 'accepted') && I && Number.isFinite(wantF)) { const A = (R.accuracy[GKEY.split('/')[0]] ??= Object.fromEntries(BK.map((b) => [b, { n: 0, nonexact: 0, ulps: [], margin: [], maxAbs: 0 }])));
          for (const b of BK) { const a = A[b]; a.n++; const u = ulpDist(val[b], wantF); if (u > 0) a.nonexact++; if (a.ulps.length < 200000) a.ulps.push(u); const m = relErrMargin(I, val[b]); if (m !== null) a.margin.push(m); a.maxAbs = Math.max(a.maxAbs, Math.abs(val[b] - want)); } }
        for (const other of ['ssA', 'ssX']) {
          if (sameVal(val.lav, val[other])) continue;
          const rk = rootKey(op, args, { lav: val.lav, other: val[other], metal: val.metal }, want); const key = `${g}|${op}|${rk}`;
          const T = (R.rootCauses[key] ??= { group: g, op, cls: rk, perSS: { ssA: 0, ssX: 0 }, catPairs: { ssA: {}, ssX: {} }, metalAgree: { ssA: { withLav: 0, withSS: 0, withBoth: 0, withNeither: 0 }, ssX: { withLav: 0, withSS: 0, withBoth: 0, withNeither: 0 } }, vsWant: { ssA: { lavCloser: 0, ssCloser: 0, tie: 0 }, ssX: { lavCloser: 0, ssCloser: 0, tie: 0 } }, ieeeMatch: { ssA: { n: 0, lav: 0, ss: 0, metal: 0 }, ssX: { n: 0, lav: 0, ss: 0, metal: 0 } }, ex: { ssA: [], ssX: [] } });
          T.perSS[other]++; inc(T.catPairs[other], `${J.lav.cat}/${J[other].cat}`);
          const mL = sameVal(val.metal, val.lav), mS = sameVal(val.metal, val[other]); T.metalAgree[other][mL && mS ? 'withBoth' : mL ? 'withLav' : mS ? 'withSS' : 'withNeither']++;
          const dl = Math.abs(val.lav - want), ds = Math.abs(val[other] - want); const lu = Number.isNaN(dl) ? Infinity : dl, su = Number.isNaN(ds) ? Infinity : ds; T.vsWant[other][lu < su ? 'lavCloser' : su < lu ? 'ssCloser' : 'tie']++;
          { const M = T.ieeeMatch[other]; M.n++; const hit = (x) => sameVal(x, wantF) || (x === 0 && wantF === 0); if (hit(val.lav)) M.lav++; if (hit(val[other])) M.ss++; if (hit(val.metal)) M.metal++; }
          if (T.ex[other].length < 6) T.ex[other].push({ id: r0.id, lane: l, op, args: args.map((x) => x), want, lav: val.lav, ss: val[other], metal: val.metal, cats: [J.lav.cat, J[other].cat, J.metal.cat], interval: I ? [I.begin, I.end] : null });
        }
        if (!sameVal(val.ssA, val.ssX)) { const rk = rootKey(op, args, { lav: val.ssA, other: val.ssX, metal: val.metal }, want); inc(G.ssXvsA, `${op}|${rk}`); }
      }
    }
  }
}
for (const [k, A] of Object.entries(R.accuracy)) for (const b of BK) { const a = A[b]; const u = a.ulps.sort((x, y) => x - y); const q = (p) => u.length ? u[Math.min(u.length - 1, Math.floor(p * u.length))] : null; const mg = a.margin.sort((x, y) => x - y); const mq = (p) => mg.length ? mg[Math.min(mg.length - 1, Math.floor(p * mg.length))] : null;
  A[b] = { n: a.n, nonexactLanes: a.nonexact, ulpMedian: q(0.5), ulpP99: q(0.99), ulpMax: u[u.length - 1], maxAbsErr: a.maxAbs, marginLanes: mg.length, marginMedian: mq(0.5), marginP99: mq(0.99), marginMax: mg[mg.length - 1] ?? null }; }
fs.writeFileSync(OUT, JSON.stringify(R, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v), 1));
console.log(Object.entries(R.rootCauses).map(([k, t]) => `${k}: ssA ${t.perSS.ssA} ssX ${t.perSS.ssX}`).join('\n'));
