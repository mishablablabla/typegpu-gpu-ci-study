const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '../..'); const { FP } = require(path.join(ROOT, 'third_party/cts-oracle.cjs'));
const FN = { add: 'additionInterval', sub: 'subtractionInterval', mul: 'multiplicationInterval', div: 'divisionInterval', min: 'minInterval', max: 'maxInterval', mod: 'remainderInterval', neg: 'negationInterval',
  sqrt: 'sqrtInterval', inverseSqrt: 'inverseSqrtInterval', sin: 'sinInterval', cos: 'cosInterval', exp: 'expInterval', exp2: 'exp2Interval', log: 'logInterval', log2: 'log2Interval', tanh: 'tanhInterval', pow: 'powInterval' };
const CTS_SPEC = { add: 'binary/f32_addition', sub: 'binary/f32_subtraction', mul: 'binary/f32_multiplication', div: 'binary/f32_division', mod: 'binary/f32_remainder', neg: 'unary/f32_arithmetic', min: 'call/builtin/min', max: 'call/builtin/max', sqrt: 'call/builtin/sqrt', inverseSqrt: 'call/builtin/inversesqrt', sin: 'call/builtin/sin', cos: 'call/builtin/cos', exp: 'call/builtin/exp', exp2: 'call/builtin/exp2', log: 'call/builtin/log', log2: 'call/builtin/log2', tanh: 'call/builtin/tanh', pow: 'call/builtin/pow' };
(async () => {
  const { OPS } = await import(path.join(ROOT, 'lib/ops.ts'));
  const rep = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'reports/lavapipe-full-conformance/cases', f)));
  const lanesOf = (t) => (/^vec(\d)/.test(t) ? Number(t[3]) : 1);
  const grp = {}; for (const f of ['diff-float.json', 'diff-f16.json']) for (const g of rep(f).groups) { const k = `${g.op}/${g.type.startsWith('f32') || g.type.startsWith('vec') && g.type.endsWith('f') || g.type === 'f32' ? 'f32' : 'f16'}`; const a = (grp[k] ??= { rows: 0, lanes: 0, pass: 0, fail: 0, investigate: 0, types: [], policy: g.policy.id, basis: g.policy.basis }); a.rows += g.total; a.lanes += g.total * lanesOf(g.type); a.pass += g.pass; a.fail += g.fail; a.investigate += g.investigate; a.types.push(g.type); }
  const out = { schema: 'float-ops-audit/1', ops: [] };
  for (const op of OPS) { if (op.group !== 'float') continue;
    for (const kind of ['f32', 'f16']) { const key = `${op.name}/${kind}`; if (!grp[key]) continue; const traits = FP[kind], fn = FN[op.name]; const t = kind; const lists = op.lists(t); const entry = { op: op.name, kind, ctsFn: fn ?? null, ctsSpecFile: kind === 'f32' ? CTS_SPEC[op.name] ?? null : CTS_SPEC[op.name]?.replace('f32', 'f16') ?? null, report: grp[key] };
      if (!fn) { entry.note = 'no CTS interval function'; out.ops.push(entry); continue; }
      const combos = []; if (op.arity === 1) for (const a of lists[0]) combos.push([a]); else for (const a of lists[0]) for (const b of lists[1]) combos.push([a, b]);
      const s = { scalarCombos: combos.length, nonFiniteInput: 0, nanInput: 0, unbounded: 0, boundedPoint: 0, boundedInterval: 0, inputOutsideDomainOrFlushToUnbounded: 0 };
      for (const c of combos) { if (c.some(Number.isNaN)) { s.nanInput++; s.nonFiniteInput++; continue; } if (c.some((v) => !Number.isFinite(v))) { s.nonFiniteInput++; }
        const I = traits[fn](...c); if (I.begin === -Infinity && I.end === Infinity) s.unbounded++; else if (I.begin === I.end) s.boundedPoint++; else s.boundedInterval++; }
      entry.inputs = s; out.ops.push(entry); } }
  fs.writeFileSync(path.join(__dirname, 'audit-float-ops.json'), JSON.stringify(out, null, 1));
  console.log('op/kind | rows | lanes | policy(basis) | scalarCombos nonFinite(nan) unbounded point interval');
  for (const e of out.ops) console.log(e.op + '/' + e.kind, '|', e.report.rows, '|', e.report.lanes, '|', e.report.policy, '(' + e.report.basis + ')', '|', e.inputs ? [e.inputs.scalarCombos, e.inputs.nonFiniteInput + '(' + e.inputs.nanInput + ')', e.inputs.unbounded, e.inputs.boundedPoint, e.inputs.boundedInterval].join(' ') : e.note);
})();
