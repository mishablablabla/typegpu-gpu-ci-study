import fs from 'node:fs'; import path from 'node:path';
const ARGS = process.argv.slice(2).map((a) => (a.includes('=') ? a.replace(/=(.*)$/, (_, p) => '=' + path.resolve(p)) : path.resolve(a))); const outP = ARGS[0]; const sets = Object.fromEntries(ARGS.slice(1).map((a) => a.split('=')));
const here = path.dirname(new URL(import.meta.url).pathname);
const { judge, dec, dec64 } = await import(path.join(here, 'evaluate-ext.mjs')); const { TY } = await import(path.resolve(here, '../lib/types.ts'));
const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; }; const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const ulp = (x) => { f32[0] = Math.abs(x); const e = (u32[0] >>> 23) & 255; return e === 0 ? 2 ** -149 : 2 ** (e - 127 - 23); };
const same = (a, b) => Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)) || (a === 0 && b === 0);
const cl = (v) => (Number.isNaN(v) ? 'NaN' : v === Infinity ? '+inf' : v === -Infinity ? '-inf' : Object.is(v, -0) ? '-0' : v === 0 ? '+0' : Math.abs(v) < 2 ** -126 ? 'subnormal' : 'normal');
const out = { schema: 'groupB-analysis/1', datasets: {} };
for (const [label, p] of Object.entries(sets)) { const D = JSON.parse(fs.readFileSync(p, 'utf8')); const O = { cpuNeGpu: {}, divNormalUlp: { lanes: 0, histogram: {}, maxUlp: 0, bothAccepted: 0, otherCategories: {} }, nanOperandMinMax: {}, signedZero: { lanes: 0, byOpAndResult: {} }, cpuThrows: { rows: 0, nonFiniteInputRows: 0, finiteInputNonFiniteResultRows: 0, byOpType: {}, finiteInputExamples: [] } };
  for (const g of D.groups) { const t = TY[g.type]; for (const r of g.rows) { const cpuStr = typeof r.cpu === 'string';
    const anyNonFiniteIn = r.inputs.flatMap((a) => a).map(dec).some((v) => !Number.isFinite(v));
    if (cpuStr) { O.cpuThrows.rows++; if (anyNonFiniteIn) O.cpuThrows.nonFiniteInputRows++; else { O.cpuThrows.finiteInputNonFiniteResultRows++; inc(O.cpuThrows.byOpType, `${g.op}/${g.type}`); if (O.cpuThrows.finiteInputExamples.length < 3) { const l = r.want.findIndex((w) => !Number.isFinite(dec64(w))); O.cpuThrows.finiteInputExamples.push({ id: r.id, msg: r.cpu.slice(0, 80), laneWithNonFiniteWant: l, args: r.inputs.map((a) => a.map(dec)), want: r.want.map(dec64) }); } } }
    for (let l = 0; l < t.lanes; l++) { const args = r.inputs.map((a) => dec(a.length > 1 ? a[l] : a[0])); const gv = dec(r.gpu[l]);
      if (!cpuStr) { const c = dec(r.cpu[l]);
        if (g.op !== 'div' && args.some(Number.isNaN)) inc(O.nanOperandMinMax, `${g.op}(${args.map(cl).join(',')}): cpu ${cl(c)} gpu ${cl(gv)}`);
        if (!same(c, gv)) { inc(O.cpuNeGpu, `${g.op}: ${args.some(Number.isNaN) ? 'NaN operand' : args.some((v) => !Number.isFinite(v)) ? 'inf operand' : args.some((v) => cl(v) === 'subnormal') ? 'subnormal operand' : 'normal/zero operands'}`);
          if (g.op === 'div' && cl(c) === 'normal' && cl(gv) === 'normal') { const u = Math.abs(c - gv) / ulp(Math.max(Math.abs(c), Math.abs(gv))); O.divNormalUlp.lanes++; inc(O.divNormalUlp.histogram, u <= 1 ? '<=1' : u <= 2 ? '<=2' : u <= 2.5 ? '<=2.5' : '>2.5'); O.divNormalUlp.maxUlp = Math.max(O.divNormalUlp.maxUlp, u); const jc = judge('div', args, c).cat, jg = judge('div', args, gv).cat; if (jc === 'accepted' && jg === 'accepted') O.divNormalUlp.bothAccepted++; else inc(O.divNormalUlp.otherCategories, `cpu ${jc} / gpu ${jg}`); } } }
      if (g.op !== 'div' && args.every((v) => v === 0) && args.some((v) => Object.is(v, -0)) && args.some((v) => Object.is(v, 0))) { O.signedZero.lanes++; inc(O.signedZero.byOpAndResult, `${g.op}(-0,+0 mix): gpu ${cl(gv)}${Object.is(gv, -0) ? '(-0)' : ''}`); } } } }
  out.datasets[label] = O; }
fs.writeFileSync(outP, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
