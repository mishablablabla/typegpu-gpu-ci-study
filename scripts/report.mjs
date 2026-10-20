#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rp = (p) => join(root, 'reports', p);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const pkgVersion = (n) => { try { return readJson(join(root, 'node_modules', n, 'package.json')).version; } catch { return null; } };

const vt = existsSync(rp('vitest.json')) ? readJson(rp('vitest.json')) : null;
const caseFiles = existsSync(rp('cases')) ? readdirSync(rp('cases')).filter((f) => f.endsWith('.json')) : [];
const parts = caseFiles.map((f) => readJson(rp(`cases/${f}`)));
const groups = parts.flatMap((p) => p.groups);
const portedKnown = parts.flatMap((p) => p.knownDivergences.map((k) => ({ file: p.file, ...k })));
const observations = Object.fromEntries(parts.flatMap((p) => p.observations.map((o) => [o.label, o.value])));

const tests = vt && {
  total: vt.numTotalTests, passed: vt.numPassedTests, failed: vt.numFailedTests, skipped: vt.numPendingTests + (vt.numTodoTests ?? 0),
  files: vt.testResults.map((f) => ({ file: path.relative(process.cwd(), f.name),
    passed: f.assertionResults.filter((a) => a.status === 'passed').length, failed: f.assertionResults.filter((a) => a.status === 'failed').length,
    skipped: f.assertionResults.filter((a) => a.status !== 'passed' && a.status !== 'failed').length })),
  failures: vt.testResults.flatMap((f) => f.assertionResults.filter((a) => a.status === 'failed').map((a) => ({ test: a.fullName, message: (a.failureMessages ?? []).join('\n').split('\n').slice(0, 12).join('\n') }))),
};

const cases = { groups: groups.length, rows: 0, pass: 0, fail: 0, confirmedDefect: 0, knownDivergence: 0, unverified: 0 };
const isDefect = (reasons) => reasons.some((r) => r.startsWith('CONFIRMED DEFECT'));
const byOperation = {};
const unsupported = [];
const mismatches = [];
const knownDivergences = [];
const confirmedDefects = [];
const unverified = [];
for (const g of groups) {
  if (g.unsupported && g.total === 0) { unsupported.push({ op: g.op, type: g.type, side: g.unsupported.side, reason: g.unsupported.reason }); continue; }
  if (g.unsupported?.side === 'gpu') { unsupported.push({ op: g.op, type: g.type, side: 'gpu', reason: g.unsupported.reason }); continue; }
  if (g.unsupported?.side === 'cpu') unsupported.push({ op: g.op, type: g.type, side: 'cpu', reason: g.unsupported.reason, note: 'GPU was still checked against the oracle' });
  const kdReasons = [...new Set(g.rows.flatMap((r) => r.issues.map((i) => i.known).filter(Boolean)))];
  const defect = g.knownDivergence > 0 && isDefect(kdReasons);
  cases.rows += g.total; cases.pass += g.pass; cases.fail += g.fail; cases.unverified += g.investigate;
  if (defect) cases.confirmedDefect += g.knownDivergence; else cases.knownDivergence += g.knownDivergence;
  const op = (byOperation[g.op] ??= { semantics: g.semantics, types: {} });
  op.types[g.type] = { total: g.total, pass: g.pass, fail: g.fail, confirmedDefect: defect ? g.knownDivergence : 0, knownDivergence: defect ? 0 : g.knownDivergence, unverified: g.investigate,
    policy: g.policy.id, policyBasis: g.policy.basis, policyDescription: g.policy.describe, cpuVsGpu: g.cpuVsGpu ?? null };
  const slim = (r) => ({ id: r.id, inputs: r.inputs, cpu: r.cpu, gpu: r.gpu, specOracle: r.want, issues: r.issues });
  const head = { op: g.op, type: g.type, semantics: g.semantics, policy: g.policy.id, policyBasis: g.policy.basis };
  for (const r of g.rows.filter((r) => r.status === 'fail')) mismatches.push({ ...head, ...slim(r) });
  if (g.knownDivergence) {
    const reasons = kdReasons;
    (defect ? confirmedDefects : knownDivergences).push({ ...head, count: g.knownDivergence, reasons, examples: g.rows.filter((r) => r.status === 'known-divergence').slice(0, 4).map(slim) });
  }
  if (g.investigate) {
    const reasons = {};
    for (const r of g.rows.filter((r) => r.status === 'investigate')) for (const i of r.issues) reasons[(i.detail ?? '').replace(/-?\d[\d.e+-]*/g, '#')] = (reasons[(i.detail ?? '').replace(/-?\d[\d.e+-]*/g, '#')] ?? 0) + 1;
    unverified.push({ ...head, count: g.investigate, reasonsInSample: reasons, examples: g.rows.filter((r) => r.status === 'investigate').slice(0, 3).map(slim) });
  }
}

const report = {
  meta: { generatedAt: new Date().toISOString(), node: process.version, platform: `${process.platform}/${process.arch}`,
    versions: { typegpu: pkgVersion('typegpu'), 'unplugin-typegpu': pkgVersion('unplugin-typegpu'), vitest: pkgVersion('vitest'), webgpu: pkgVersion('webgpu') },
    adapter: observations.adapter ?? null, adapterFeatures: observations.adapterFeatures ?? null, command: 'npm run conformance' },
  summary: { tests, cases, unsupportedGroups: unsupported.length },
  legend: {
    pass: 'result within the comparison policy',
    fail: 'GPU (or an unexplained CPU result) violates the policy',
    confirmedDefect: 'CPU result is WRONG against the spec/GPU and the cause is understood (see investigations/); reported loudly and separately, never mixed with known divergences',
    knownDivergence: 'TypeGPU CPU result differs from the spec oracle for a documented, by-design reason (not a failure of the suite)',
    unverified: 'no spec bound applies (inf/NaN, out-of-domain, operands beyond f32 precision, zero sign) — observed only, never counted as pass or fail',
    unsupported: 'the operation/type cannot run on that side (TypeGPU rejects it or the feature is missing)',
    policyBasis: { spec: 'bound stated in the WGSL spec', derived: 'bound composed from spec statements (spec gives only an inherited accuracy) — not a literal spec number', observation: 'no bound' },
  },
  byOperation, mismatches, confirmedDefects, knownDivergences, portedKnownDivergences: portedKnown, unverified, unsupported, observations,
};
writeFileSync(rp('report.json'), JSON.stringify(report, null, 1));

const line = (s = '') => console.log(s);
const a = report.meta.adapter;
line('\n=== GPU conformance report ===');
line(`GPU: ${a ? `${a.vendor} ${a.architecture} ${a.device} (fallback adapter: ${a.isFallbackAdapter})` : 'unknown'}   typegpu ${report.meta.versions.typegpu}, webgpu ${report.meta.versions.webgpu}, vitest ${report.meta.versions.vitest}`);
if (tests) line(`Tests:  total ${tests.total}   passed ${tests.passed}   failed ${tests.failed}   skipped ${tests.skipped}`);
line(`Cases:  ${cases.rows} rows in ${cases.groups} (operation × type) groups`);
line(`        pass ${cases.pass}   FAIL ${cases.fail}   CONFIRMED-DEFECT ${cases.confirmedDefect}   known-divergence ${cases.knownDivergence}   unverified ${cases.unverified}   unsupported groups ${unsupported.length}`);
if (mismatches.length) {
  line('\nFAILURES');
  const seen = {};
  for (const m of mismatches) { const k = `${m.op}/${m.type}`; if ((seen[k] = (seen[k] ?? 0) + 1) > 3) continue; line(`  [${m.semantics}] ${k} inputs=${JSON.stringify(m.inputs)} cpu=${JSON.stringify(m.cpu)} gpu=${JSON.stringify(m.gpu)} oracle=${JSON.stringify(m.specOracle)}\n      ${m.issues.filter((i) => i.verdict === 'fail').map((i) => `${i.target}: ${i.detail}`).join(' | ')}`); }
}
if (tests?.failures.length) { line('\nFAILED TESTS'); for (const f of tests.failures) line(`  ${f.test}\n${f.message.split('\n').map((l) => '      ' + l).join('\n')}`); }
if (confirmedDefects.length) {
  line('\nCONFIRMED DEFECTS (CPU is wrong; these are NOT hidden as known divergences)');
  const byReason = {};
  for (const k of confirmedDefects) for (const r of k.reasons) (byReason[r] ??= { count: 0, where: new Set() }, byReason[r].count += k.count, byReason[r].where.add(`${k.op}/${k.type}`));
  for (const [r, v] of Object.entries(byReason)) line(`  ${v.count} cases · ${[...v.where].join(', ')}\n      ${r}`);
}
const kd = {};
for (const k of knownDivergences) for (const r of k.reasons) (kd[r] ??= { count: 0, where: new Set() }, kd[r].count += k.count, kd[r].where.add(`${k.op}/${k.type}`));
if (Object.keys(kd).length || portedKnown.length) {
  line('\nKNOWN DIVERGENCES (documented, do not fail the suite)');
  for (const [r, v] of Object.entries(kd)) line(`  ${v.count} cases · ${[...v.where].slice(0, 6).join(', ')}${v.where.size > 6 ? ', …' : ''}\n      ${r}`);
  for (const k of portedKnown) line(`  ported test: ${k.label}\n      ${k.reason}`);
}
const uv = {};
for (const u of unverified) for (const [r, n] of Object.entries(u.reasonsInSample)) uv[r] = (uv[r] ?? 0) + n;
if (Object.keys(uv).length) { line('\nUNVERIFIED (observed only; top reasons in the kept sample)'); for (const [r, n] of Object.entries(uv).sort((a, b) => b[1] - a[1]).slice(0, 5)) line(`  ${String(n).padStart(5)}  ${r.slice(0, 130)}`); }
let cmpTot = { compared: 0, identical: 0 };
for (const o of Object.values(byOperation)) for (const t of Object.values(o.types)) if (t.cpuVsGpu) { cmpTot.compared += t.cpuVsGpu.compared; cmpTot.identical += t.cpuVsGpu.identical; }
line(`\nDirect CPU vs GPU: ${cmpTot.identical} of ${cmpTot.compared} rows bit-identical (${(100 * cmpTot.identical / Math.max(1, cmpTot.compared)).toFixed(1)}%); per-operation numbers and the max ULP gap among conforming rows are in reports/report.json (byOperation.*.types.*.cpuVsGpu)`);
if (unsupported.length) { line(`\nUNSUPPORTED (${unsupported.length} groups; separate from failures)`); for (const u of unsupported.slice(0, 8)) line(`  ${u.op}/${u.type} [${u.side}] ${u.reason.slice(0, 140)}`); if (unsupported.length > 8) line(`  … ${unsupported.length - 8} more`); }
line(`\nFull machine-readable report: reports/report.json`);
const bad = (tests?.failed ?? 0) > 0 || cases.fail > 0;
line(bad ? '\nRESULT: FAIL' : cases.confirmedDefect ? `\nRESULT: PASS for the GPU (no failures) — BUT ${cases.confirmedDefect} cases are CONFIRMED CPU DEFECTS listed above` : '\nRESULT: PASS (no failures; see known divergences and unverified cases above/in the JSON)');
process.exit(bad ? 1 : 0);
