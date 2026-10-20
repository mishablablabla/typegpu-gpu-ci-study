#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
rmSync(join(here, 'raw'), { recursive: true, force: true }); mkdirSync(join(here, 'raw'), { recursive: true });
const r = spawnSync('npx', ['vitest', 'run', '--silent', '--reporter=dot', '--reporter=json', '--outputFile.json=raw/vitest.json', '--config', 'investigations/integer-mul/vitest.config.mts'], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });

const read = (p) => JSON.parse(readFileSync(join(here, p), 'utf8'));
const vt = read('raw/vitest.json'), ev = read('raw/evidence.json'), rep = read('reproducer-output.json');
const tests = vt.testResults.flatMap((f) => f.assertionResults.map((a) => {
  const xfail = a.title.includes('[CONFIRMED DEFECT');
  return { file: f.name.split('/integer-mul/')[1], name: a.fullName, status: a.status, kind: xfail ? 'regression test for a confirmed defect (expected failure: passes while the defect exists)' : 'ordinary assertion' };
}));
const regression = tests.filter((t) => t.kind.startsWith('regression'));

const results = {
  meta: { generatedAt: new Date().toISOString(), versions: rep.versions, adapter: rep.adapter, command: 'node investigations/integer-mul/run.mjs' },
  verdict: {
    originalDiscrepancyConfirmed: rep.discrepancyReproduced,
    classification: 'real TypeGPU CPU defect (not a harness/specification issue)',
    smallestReproducer: { operation: rep.operation, inputs: rep.inputs, expectedBigInt: rep.expectedBigInt, cpu: rep.cpu, gpuTypegpu: rep.gpuTypegpu, gpuRawWgsl: rep.gpuRawWgsl, cpuTrace: rep.cpuTrace },
  },
  summary: {
    tests: { total: tests.length, passed: tests.filter((t) => t.status === 'passed').length, failed: tests.filter((t) => t.status === 'failed').length, skipped: tests.filter((t) => t.status !== 'passed' && t.status !== 'failed').length },
    regressionTestsForConfirmedDefects: { total: regression.length, defectStillPresent: regression.filter((t) => t.status === 'passed').length, defectFixed: regression.filter((t) => t.status === 'failed').length },
  },
  categories: {
    confirmedDefects: [{
      id: '#1', title: 'CPU integer multiplication goes through JS Number (f64) and loses low bits when the exact product exceeds 2^53',
      operations: ['std.mul(vecNi|vecNu, vecNi|vecNu)', 'operator `*` on integer vectors inside a \'use gpu\' function run on the CPU', 'std.mul(vec, scalar) and std.mul(scalar, vec)', 'd.i32(std.mul(a, b)) / d.u32(std.mul(a, b)) on scalars'],
      types: ['vec2i', 'vec3i', 'vec4i', 'vec2u', 'vec3u', 'vec4u', 'i32/u32 via explicit cast'],
      cause: 'packages/typegpu/src/std/operators.ts cpuMul -> generalizeFn((a, b) => a * b) (f64 multiply) -> vec constructor -> castElement = i32/u32 schema -> `v | 0` / `(v & 0xffffffff) >>> 0` on the already-rounded double',
      affectedInputSpace: ev.fractions,
      cpuMismatchBelow2pow53: Object.fromEntries(Object.entries(ev.mulMatrix).map(([k, v]) => [k, v.cpuMismatchesBelow2pow53])),
      regressionTests: regression.map((t) => ({ name: t.name, status: t.status })),
    }],
    expectedSpecificationDifferences: [
      { id: 'E1', what: 'std.intdiv (scalars): CPU follows its documented formula trunc(trunc(a)/trunc(b)); GPU follows WGSL integer division', differs: ev.intdiv.filter?.((r) => !r.cpuEqualsWgsl).map((r) => ({ a: r.a, b: r.b, cpu: r.cpu, gpu: r.gpu })) ?? ev.intdiv },
      { id: 'E2', what: 'std.div / std.mod on integer vectors: GPU = WGSL integer rules for every lane; CPU is correct wherever it does not throw; CPU throws FiniteMathAssumptionError on a zero divisor', evidence: Object.fromEntries(Object.entries(ev.divMod).filter(([k]) => /^(div|mod):/.test(k)).map(([k, v]) => [k, { lanes: v.lanes, gpuMismatches: v.gpuMismatches, cpuMismatchesInRowsThatDidNotThrow: v.cpuMismatchesInRowsThatDidNotThrow, cpuThrewRows: v.cpuThrewRows }])) },
      { id: 'E3', what: 'scalar i32/u32 are plain JS numbers on the CPU (no wrap-around without an explicit cast) — by design, see reports/report.json known divergences' },
    ],
    unsupported: [{ id: 'U1', what: 'std.intdiv on integer vectors is rejected by TypeGPU (signature accepts i32/u32 scalars only)', message: ev.intdiv_vectorUnsupported }],
    unverifiedHypotheses: [
      { id: 'H1', what: 'Scalar std.div / std.mod on integers are compiled to f32 operations (observed in emitted WGSL); their GPU precision above 2^24 and zero-divisor behaviour were not investigated further here' },
      { id: 'H2', what: 'Impact on user code that emulates integer hashes/PRNGs on the CPU with `*` on u32 vectors: demonstrated for a PCG/Knuth-style multiplier on random u32 states, not demonstrated on any real TypeGPU user code' },
      { id: 'H3', what: 'Other CPU paths that might multiply through f64 (e.g. matrices of integers do not exist in WGSL; compound `*=` operators; std functions built on mul) were not enumerated' },
    ],
  },
  evidence: ev,
  tests,
};
writeFileSync(join(here, 'results.json'), JSON.stringify(results, null, 1));
const s = results.summary;
console.log(`\nintegration-mul investigation: tests ${s.tests.passed}/${s.tests.total} passed, ${s.tests.failed} failed;`);
console.log(`regression tests for the confirmed defect: ${s.regressionTestsForConfirmedDefects.defectStillPresent}/${s.regressionTestsForConfirmedDefects.total} still reproduce the defect (they flip to FAILED when the CPU is fixed)`);
console.log(`original discrepancy reproduced: ${results.verdict.originalDiscrepancyConfirmed}   -> investigations/integer-mul/results.json`);
process.exit(r.status || s.tests.failed ? 1 : 0);
