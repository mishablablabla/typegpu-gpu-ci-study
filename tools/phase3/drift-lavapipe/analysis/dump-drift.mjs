import fs from 'node:fs'; import path from 'node:path';
const [outP, aP, bP] = process.argv.slice(2).map((a) => path.resolve(a)); // resolve BEFORE importing evaluate-ext.mjs (it chdirs)
const here = path.dirname(new URL(import.meta.url).pathname); const POC = path.resolve(here, '../../../..'); const OE = path.join(POC, 'evaluator');
const { judge, dec, dec64 } = await import(path.join(OE, 'evaluate-ext.mjs')); const { TY } = await import(path.join(POC, 'lib/types.ts'));
const A = JSON.parse(fs.readFileSync(aP, 'utf8')), B = JSON.parse(fs.readFileSync(bP, 'utf8'));
const f32 = new Float32Array(1), u32 = new Int32Array(f32.buffer); const ord = (x) => { f32[0] = x; return u32[0] < 0 ? -(u32[0] & 0x7fffffff) : u32[0]; }; const ulpDist = (a, b) => Math.abs(ord(a) - ord(b));
const same = (a, b) => Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)) || (a === 0 && b === 0);
const bucket = (d) => (d === 1 ? '1' : d === 2 ? '2' : d <= 4 ? '3-4' : d <= 16 ? '5-16' : d <= 256 ? '17-256' : '>256'); const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const q = (a, p) => (a.length ? a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
if (A.groups.length !== B.groups.length) throw new Error('group count differs');
const res = {}; const tot = { lanes: 0, bitsDiffer: 0, nanPayloadOnly: 0, zeroSignOnly: 0, valueDiffer: 0, catChanges: 0, catAcceptedToNot: 0, catNotToAccepted: 0 };
const cats = { A: {}, B: {} };
for (let gi = 0; gi < A.groups.length; gi++) { const ga = A.groups[gi], gb = B.groups[gi]; if (ga.op !== gb.op || ga.type !== gb.type) throw new Error('group mismatch'); const t = TY[ga.type]; const key = `${ga.op}/${ga.type}`;
  const R = { elem: t.elem, lanes: 0, bitsDiffer: 0, nanPayloadOnly: 0, zeroSignOnly: 0, valueDiffer: 0, kinds: {}, ulpBuckets: {}, catPairs: {}, catChanges: 0, rowsWithValueDiff: 0, ulpMedian: null, ulpP99: null, ulpMax: null, examples: [] }; const ulps = [];
  for (let r = 0; r < ga.rows.length; r++) { const a = ga.rows[r], b = gb.rows[r]; if (a.id !== b.id) throw new Error('row id mismatch'); let rowDiff = false;
    for (let l = 0; l < t.lanes; l++) { R.lanes++; const x = dec(a.gpu[l]), y = dec(b.gpu[l]); const args = (t.elem === 'f32' || t.elem === 'f16') ? a.inputs.map((v) => dec(v.length > 1 ? v[l] : v[0])) : null;
      const ca0 = args ? judge(ga.op, args, x, t.elem).cat : 'n/a', cb0 = args ? judge(ga.op, args, y, t.elem).cat : 'n/a'; inc(cats.A, ca0); inc(cats.B, cb0);
      if (a.gpu[l] === b.gpu[l]) continue; R.bitsDiffer++;
      if (Number.isNaN(x) && Number.isNaN(y)) { R.nanPayloadOnly++; continue; } if (same(x, y)) { R.zeroSignOnly++; continue; }
      R.valueDiffer++; rowDiff = true;
      const kind = Number.isNaN(x) || Number.isNaN(y) ? 'NaN vs non-NaN' : (!Number.isFinite(x) || !Number.isFinite(y)) ? 'inf vs finite' : (x === 0 || y === 0 || Math.abs(x) < (t.elem === 'f16' ? 2 ** -14 : 2 ** -126) || Math.abs(y) < (t.elem === 'f16' ? 2 ** -14 : 2 ** -126)) ? 'zero/subnormal involved' : 'normal finite'; inc(R.kinds, kind);
      if (kind === 'normal finite' && t.elem === 'f32') { const d = ulpDist(x, y); inc(R.ulpBuckets, bucket(d)); ulps.push(d); }
      inc(R.catPairs, `${ca0}|${cb0}`); if (ca0 !== cb0) { R.catChanges++; if (ca0 === 'accepted') tot.catAcceptedToNot++; if (cb0 === 'accepted') tot.catNotToAccepted++; }
      if (R.examples.length < 4 && (kind !== 'normal finite' || ca0 !== cb0)) R.examples.push({ id: a.id, lane: l, args: args?.map(String), A: String(x), B: String(y), catA: ca0, catB: cb0 }); }
    if (rowDiff) R.rowsWithValueDiff++; }
  R.ulpMedian = q(ulps, 0.5); R.ulpP99 = q(ulps, 0.99); R.ulpMax = ulps.length ? Math.max(...ulps) : null;
  for (const k of ['lanes', 'bitsDiffer', 'nanPayloadOnly', 'zeroSignOnly', 'valueDiffer']) tot[k] += R[k]; tot.catChanges += R.catChanges; res[key] = R; }
fs.writeFileSync(outP, JSON.stringify({ schema: 'drift-lane-analysis/1', baseline: aP, other: bP, totals: tot, categoryTotalsAllLanes: cats, perOpType: res }, null, 1));
console.log(JSON.stringify(tot), 'catsA', JSON.stringify(cats.A), 'catsB', JSON.stringify(cats.B));
