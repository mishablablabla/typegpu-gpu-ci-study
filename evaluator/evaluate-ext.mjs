import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(here, '..');
const ARGS = process.argv.slice(2).map((a) => path.resolve(a)); // resolve BEFORE the oracle loader changes the cwd
const require = createRequire(import.meta.url); const { FP } = require(path.join(ROOT, 'third_party/cts-oracle.cjs'));
const { OPS } = await import(path.join(ROOT, 'lib/ops.ts')); const { TY } = await import(path.join(ROOT, 'lib/types.ts'));
export const CTS_FN = { add: 'additionInterval', sub: 'subtractionInterval', mul: 'multiplicationInterval', neg: 'negationInterval',
  div: 'divisionInterval', min: 'minInterval', max: 'maxInterval',
  inverseSqrt: 'inverseSqrtInterval', exp: 'expInterval', exp2: 'exp2Interval', sin: 'sinInterval', cos: 'cosInterval',
  sqrt: 'sqrtInterval', tanh: 'tanhInterval',
  mod: 'remainderInterval', log: 'logInterval', log2: 'log2Interval', pow: 'powInterval' };
const u = new Uint32Array(1), f = new Float32Array(u.buffer);
const u16 = new Uint16Array(1), f16 = new Float16Array(u16.buffer);
export const dec = (h) => (typeof h !== 'string' || h === 'null' ? NaN : h.length !== 4 && h.length !== 8 ? (() => { throw new Error(`dec(): hex length ${h.length} is neither f16 (4) nor f32 (8): ${h}`); })() : h.length === 4 ? ((u16[0] = parseInt(h, 16)), f16[0]) : ((u[0] = parseInt(h, 16)), f[0]));
export const enc16 = (v) => ((f16[0] = v), u16[0].toString(16).padStart(4, '0'));
const u64 = new BigUint64Array(1), f64 = new Float64Array(u64.buffer);
export const dec64 = (h) => (typeof h !== 'string' || h === 'null' ? NaN : ((u64[0] = BigInt('0x' + h)), f64[0]));
export const enc = (v) => ((f[0] = v), u[0].toString(16).padStart(8, '0'));
export function judge(opName, args, got, kind = 'f32') {
  if (got === undefined) return { cat: 'unverified', reason: 'no result (CPU threw)' };
  if (args.some(Number.isNaN)) return { cat: 'indeterminate', reason: 'NaN operand (CTS cannot build an interval)' };
  const I = FP[kind][CTS_FN[opName]](...args); const lo = I.begin, hi = I.end;
  if (Number.isNaN(lo) || Number.isNaN(hi) || (Number.isFinite(lo) !== Number.isFinite(hi) && !(lo === -Infinity && hi === Infinity) && (lo === -Infinity || hi === Infinity))) throw new Error(`unexpected CTS interval [${lo}, ${hi}] for ${opName}(${args})`);
  if (lo === -Infinity && hi === Infinity) return { cat: 'indeterminate', reason: args.every(Number.isFinite) ? 'unbounded interval, finite operands (overflow/flush edge)' : 'unbounded interval, infinite operand', interval: [lo, hi] };
  return { cat: (Number.isNaN(got) ? false : lo <= got && hi >= got) ? 'accepted' : 'rejected', reason: lo === hi ? 'point interval' : 'bounded interval', interval: [lo, hi] };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [inP, outP] = ARGS; const D = JSON.parse(fs.readFileSync(inP, 'utf8'));
  const R = { schema: 'oracle-ext-eval/1', input: path.relative(ROOT, path.resolve(inP)), ops: D.ops, oldRecompute: { lanes: 0, mismatches: 0, wantMismatches: 0 }, groups: {}, totals: { rows: 0, lanes: 0 }, transitions: {}, reasons: {}, examples: {}, rowsBefore: {}, rowsAfter: { either: {}, gpu: {}, cpu: {} }, unmatched: { cpuThrew: { lanes: 0, rows: 0 }, nanOperandLanes: 0 }, exactAcceptedGpu: 0, exactAcceptedCpu: 0, cpuVsGpuIdentical: 0, cpuVsGpuDiffer: 0 };
  const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
  const worst = (cs) => (cs.includes('rejected') ? 'rejected' : cs.includes('unverified') ? 'unverified' : cs.includes('indeterminate') ? 'indeterminate' : 'accepted');
  for (const g of D.groups) { const t = TY[g.type], op = OPS.find((o) => o.group === (t.elem === 'f16' ? 'f16' : 'float') && o.name === g.op), pol = op.policy(t); const GK = `${g.op}/${g.type}`; const G = (R.groups[GK] = { rows: g.rows.length, policy: g.policy, rowsBefore: {}, gpu: {}, cpu: {}, cpuRecompute: g.cpuRecompute });
    for (const r of g.rows) { R.totals.rows++; inc(G.rowsBefore, r.status); inc(R.rowsBefore, r.status); const catsG = [], catsC = [];
      const lanes = t.lanes; const cpuStr = typeof r.cpu === 'string';
      if (cpuStr) { R.unmatched.cpuThrew.rows++; R.unmatched.cpuThrew.lanes += lanes; }
      for (let l = 0; l < lanes; l++) { R.totals.lanes++;
        const args = r.inputs.map((a) => dec(a.length > 1 ? a[l] : a[0])); const want = dec64(r.want[l]); const gpu = dec(r.gpu[l]); const cpu = cpuStr ? undefined : dec(r.cpu[l]);
        const wantAgain = op.oracle(args, t); R.oldRecompute.lanes++; if (!(Object.is(wantAgain, want) || (Number.isNaN(want) && Number.isNaN(wantAgain)) || (wantAgain === 0 && want === 0))) R.oldRecompute.wantMismatches++;
        if (args.some(Number.isNaN)) R.unmatched.nanOperandLanes++;
        const ctx = { type: t, args, oracle: (a) => op.oracle(a, t) };
        for (const [target, val] of [['gpu', gpu], ['cpu', cpu]]) {
          const rec = r.issues.find((i) => i[0] === l && i[1] === target)?.[2] ?? (val === undefined ? 'none' : 'pass');
          const old = val === undefined ? 'none' : pol.check(val, want, ctx).verdict; if (old !== rec) R.oldRecompute.mismatches++;
          const j = judge(g.op, args, val, t.elem); (target === 'gpu' ? catsG : catsC).push(j.cat); inc(G[target], j.cat);
          const key = `${target}: ${old} -> ${j.cat}`; inc(R.transitions, key); inc(R.reasons, `${key} | ${j.reason}`);
          const ek = `${key} | ${j.reason}`; (R.examples[ek] ??= []); if (R.examples[ek].length < 3) R.examples[ek].push({ id: r.id, lane: l, args: args.map(enc), got: val === undefined ? null : enc(val), want: want, interval: j.interval ? j.interval.map(enc) : null });
          if (j.cat === 'accepted' && val === Math.fround(want)) inc(R, target === 'gpu' ? 'exactAcceptedGpu' : 'exactAcceptedCpu'); } 
        if (cpu !== undefined) { if (Object.is(cpu, gpu) || (Number.isNaN(cpu) && Number.isNaN(gpu)) || (cpu === 0 && gpu === 0)) R.cpuVsGpuIdentical++; else R.cpuVsGpuDiffer++; } }
      inc(R.rowsAfter.gpu, worst(catsG)); inc(R.rowsAfter.cpu, catsC.length ? worst(catsC) : 'unverified'); inc(R.rowsAfter.either, worst([...catsG, ...catsC])); } }
  fs.writeFileSync(outP, JSON.stringify(R, null, 1)); console.log(JSON.stringify({ totals: R.totals, oldRecompute: R.oldRecompute, rowsBefore: R.rowsBefore, rowsAfter: R.rowsAfter, unmatched: R.unmatched, exact: [R.exactAcceptedGpu, R.exactAcceptedCpu], cpuVsGpu: [R.cpuVsGpuIdentical, R.cpuVsGpuDiffer], transitions: R.transitions }, null, 1));
}
