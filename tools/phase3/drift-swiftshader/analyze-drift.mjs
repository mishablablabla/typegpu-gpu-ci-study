import fs from 'node:fs'; import path from 'node:path';
const A = process.argv.slice(2).map((a) => path.resolve(a)); const here = path.dirname(new URL(import.meta.url).pathname); const OE = path.resolve(here, '../../../evaluator');
const { judge, dec, dec64 } = await import(path.join(OE, 'evaluate-ext.mjs')); const { TY } = await import(path.resolve(here, '../../../lib/types.ts'));
const [outP, lavP, ssP] = A; const L = JSON.parse(fs.readFileSync(lavP, 'utf8')), S = JSON.parse(fs.readFileSync(ssP, 'utf8'));
const f32 = new Float32Array(1), u32 = new Int32Array(f32.buffer); const ord = (x) => { f32[0] = x; return u32[0] < 0 ? -(u32[0] & 0x7fffffff) : u32[0]; };
const ulpDist = (a, b) => Math.abs(ord(a) - ord(b)); const ulpOf = (w) => { const e = Math.max(Math.floor(Math.log2(Math.abs(w))), -126); return 2 ** (e - 23); };
const same = (a, b) => Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)) || (a === 0 && b === 0);
const bucket = (d) => (d === 1 ? '1' : d === 2 ? '2' : d <= 4 ? '3-4' : d <= 16 ? '5-16' : d <= 256 ? '17-256' : '>256'); const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const res = {}; const q = (a, p) => a.length ? a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : null;
for (let gi = 0; gi < L.groups.length; gi++) { const gl = L.groups[gi], gs = S.groups[gi]; if (gl.op !== gs.op || gl.type !== gs.type) throw new Error('group mismatch'); const t = TY[gl.type]; if (t.elem !== 'f32') continue;
  const R = { lanes: 0, bitsDiffer: 0, valueDiffer: 0, nanSignOnly: 0, kinds: {}, ulpBuckets: {}, catPairs: {}, errLanes: 0, exact: { base: 0, new: 0 }, maxAbsErr: { base: 0, new: 0 }, maxUlpErr: { base: 0, new: 0 }, diffCasesWorstUlp: 0, examples: [] }; const ulps = [];
  for (let r = 0; r < gl.rows.length; r++) { const a = gl.rows[r], b = gs.rows[r]; if (a.id !== b.id) throw new Error('row id mismatch');
    for (let l = 0; l < t.lanes; l++) { R.lanes++; const args = a.inputs.map((x) => dec(x.length > 1 ? x[l] : x[0])); const x = dec(a.gpu[l]), y = dec(b.gpu[l]);
      const w = Array.isArray(a.want) ? dec64(a.want[l] ?? a.want[0]) : NaN;
      if (Number.isFinite(w) && Number.isFinite(x) && Number.isFinite(y) && judge(gl.op, args, x, t.elem).cat === 'accepted' && judge(gl.op, args, y, t.elem).cat === 'accepted') {
        R.errLanes++; const wf = Math.fround(w), wn = Math.abs(w) >= 2 ** -126; if (x === wf) R.exact.base++; if (y === wf) R.exact.new++;
        R.maxAbsErr.base = Math.max(R.maxAbsErr.base, Math.abs(x - w)); R.maxAbsErr.new = Math.max(R.maxAbsErr.new, Math.abs(y - w));
        if (wn) { R.maxUlpErr.base = Math.max(R.maxUlpErr.base, Math.abs(x - w) / ulpOf(w)); R.maxUlpErr.new = Math.max(R.maxUlpErr.new, Math.abs(y - w) / ulpOf(w)); } }
      if (a.gpu[l] === b.gpu[l]) continue; R.bitsDiffer++; if (Number.isNaN(x) && Number.isNaN(y)) { R.nanSignOnly++; continue; } if (same(x, y)) continue; R.valueDiffer++;
      if (Number.isFinite(x) && Number.isFinite(y)) { const sx = x !== 0 && Math.abs(x) < 2 ** -126, sy = y !== 0 && Math.abs(y) < 2 ** -126; if (sx && y === 0) inc(R.kinds, 'FTZ: base subnormal -> new zero'); if (sy && x === 0) inc(R.kinds, 'FTZ: new subnormal -> base zero'); }
      const kind = Number.isNaN(x) || Number.isNaN(y) ? 'NaN vs non-NaN' : (!Number.isFinite(x) || !Number.isFinite(y)) ? 'inf vs finite' : (x === 0 || y === 0 || Math.abs(x) < 2 ** -126 || Math.abs(y) < 2 ** -126) ? 'zero/subnormal involved' : 'normal finite'; inc(R.kinds, kind);
      if (kind === 'normal finite') { const d = ulpDist(x, y); inc(R.ulpBuckets, bucket(d)); ulps.push(d); R.diffCasesWorstUlp = Math.max(R.diffCasesWorstUlp, d); }
      const ca = judge(gl.op, args, x, t.elem).cat, cb = judge(gl.op, args, y, t.elem).cat; inc(R.catPairs, `${ca}|${cb}`);
      if (R.examples.length < 6 && kind !== 'normal finite') R.examples.push({ id: a.id, lane: l, args: args.map(String), base: String(x), new: String(y), catLav: ca, catSS: cb }); } }
  R.ulpMedian = q(ulps, 0.5); R.ulpP99 = q(ulps, 0.99); R.ulpMax = ulps.length ? Math.max(...ulps) : null; res[`${gl.op}/${gl.type}`] = R; }
fs.writeFileSync(outP, JSON.stringify({ schema: 'ss-drift-lane-analysis/1', base: lavP, new: ssP, perOpType: res }, null, 1));
for (const [k, R] of Object.entries(res)) console.log(k.padEnd(18), 'lanes', R.lanes, 'valueDiffer', R.valueDiffer, JSON.stringify(R.kinds), 'ulp med/p99/max', R.ulpMedian, R.ulpP99, R.ulpMax, 'acceptedBothLanes', R.errLanes, 'exact(==fround want) L/S', R.exact.base, R.exact.new, 'maxUlpErr L/S', R.maxUlpErr.base.toFixed(2), R.maxUlpErr.new.toFixed(2), 'maxAbsErr L/S', R.maxAbsErr.base.toExponential(2), R.maxAbsErr.new.toExponential(2), 'cats', JSON.stringify(R.catPairs));
