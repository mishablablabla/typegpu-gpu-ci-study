// usage: node analyze.mjs [--suite v1|v2] [--out analysis-<suite>]   reads raw/run-*/{jobs.json,run.json,artifacts/*/results.json}; writes <out>/analysis.json + analysis.md (facts only). Never modifies raw/.
import fs from 'node:fs'; import path from 'node:path';
const here = process.env.SOAK_DIR ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../runs/soak'); const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SUITE = arg('--suite', 'v1'); const OUTD = path.join(here, arg('--out', `analysis-${SUITE}`)); fs.mkdirSync(OUTD, { recursive: true });
const rdj = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const jobs = [];
for (const rd of fs.readdirSync(path.join(here, 'raw')).filter((d) => d.startsWith('run-')).sort()) { const D = path.join(here, 'raw', rd); const J = rdj(`${D}/jobs-final.json`) ?? rdj(`${D}/jobs.json`), run = rdj(`${D}/run-final.json`) ?? rdj(`${D}/run.json`); if (!J) continue; const rs = fs.existsSync(`${D}/SUITE.txt`) ? fs.readFileSync(`${D}/SUITE.txt`, 'utf8').trim() : null; if (rs !== SUITE) continue;
  const note = fs.existsSync(`${D}/NOTE.md`) ? fs.readFileSync(`${D}/NOTE.md`, 'utf8').split('\n')[0] : null;
  const list = Array.isArray(J) ? J.flatMap((p) => p.jobs ?? []) : J.jobs ?? [];
  for (const j of list) { if (j.conclusion == null) continue; const m = /^soak \((\w+), (\d+)\)$/.exec(j.name); if (!m) continue; const [, backend, rep] = m; if (backend === 'both') continue;
    const art = `soak-${backend}-${rep}-${SUITE}-${run.id}-${run.run_attempt}`; const R = rdj(`${D}/artifacts/${art}/results.json`); if (R === null && !fs.existsSync(`${D}/artifacts`)) continue;
    const suiteOfRun = (run.name && '') || '';
    const anyArt = fs.existsSync(`${D}/artifacts`) ? fs.readdirSync(`${D}/artifacts`).filter((a) => a.startsWith(`soak-${backend}-${rep}-`)) : [];
    if (!R && !anyArt.some((a) => a.includes(`-${SUITE}-`)) && anyArt.length) continue;
    if (!R && !anyArt.length && j.conclusion === 'success') continue;
    const wall = (new Date(j.completed_at) - new Date(j.started_at)) / 1000; const steps = Object.fromEntries((j.steps ?? []).filter((s) => s.completed_at && s.started_at).map((s) => [s.name, (new Date(s.completed_at) - new Date(s.started_at)) / 1000]));
    jobs.push({ run: run.id, runNote: note, backend, rep: +rep, conclusion: j.conclusion, started: j.started_at, wallSec: wall, steps, R, hasResults: !!(R && R.schema), failedStepsApi: (j.steps ?? []).filter((s) => s.conclusion === 'failure').map((s) => s.name) }); } }
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const stat = (a) => ({ n: a.length, min: a.length ? Math.min(...a) : null, median: med(a), p95: pct(a, 0.95), max: a.length ? Math.max(...a) : null, mean: a.length ? a.reduce((x, y) => x + y, 0) / a.length : null });
const count = (a) => a.reduce((m, k) => { m[k] = (m[k] ?? 0) + 1; return m; }, {});
const out = { suite: SUITE, generated: new Date().toISOString(), backends: {} }; const md = [];
for (const backend of ['lavapipe', 'swiftshader']) { const J = jobs.filter((j) => j.backend === backend); if (!J.length) continue;
  const ok = J.filter((j) => j.R?.complete), notOk = J.filter((j) => !j.R?.complete);
  const infra = notOk.filter((j) => !j.hasResults || j.R.infra.failedStages.length || j.R.infra.identityFailed || j.conclusion !== 'success' && !(j.R.suites?.full)); const suiteFail = notOk.filter((j) => !infra.includes(j));
  const B = { jobsDispatched: J.length, jobsComplete: ok.length, infraFailures: infra.map((j) => ({ run: j.run, rep: j.rep, conclusion: j.conclusion, failedSteps: j.failedStepsApi, failedStages: j.R?.infra?.failedStages, identityFailed: j.R?.infra?.identityFailed })), suiteLevelFailures: suiteFail.map((j) => ({ run: j.run, rep: j.rep, suites: j.R.suites })) };
  B.cpu = count(ok.map((j) => j.R.host.cpuModel)); B.cpuAll = count(J.map((j) => j.R?.host?.cpuModel ?? 'unknown')); B.avx512 = count(ok.map((j) => String(j.R.host.simd.avx512f))); B.flagsHash = count(ok.map((j) => j.R.host.flagsHash));
  B.imageVersion = count(J.map((j) => j.R?.job?.ImageVersion ?? 'unknown')); B.kernel = count(ok.map((j) => j.R.host.kernel));
  B.versions = {}; for (const k of ['mesa-vulkan-drivers', 'libllvm20', 'libvulkan1', 'vulkan-tools', 'node', 'webgpu', 'typegpu', 'vitest']) B.versions[k] = count(ok.map((j) => j.R.versions?.[k] ?? 'n/a'));
  B.adapterDevice = count(ok.map((j) => j.R.identity?.adapter?.device ?? 'n/a')); B.adapterDescription = count(ok.map((j) => j.R.identity?.adapter?.description ?? 'n/a')); B.icdSha = count(ok.map((j) => (j.R.acquisition?.icdSha256 ?? []).join('|') || 'n/a'));
  B.preinstalledGfx = count(J.filter((j) => j.R).map((j) => (j.R.preinstalled?.gfxPackages ?? []).length + ' pkgs'));
  B.suiteTotals = {}; for (const s of ['full', 'inv', 'ex', 'ex-nof16', 'v2']) { const v = ok.map((j) => j.R.suites?.[s]).filter(Boolean); if (v.length) B.suiteTotals[s] = count(v.map((x) => `${x.total}/${x.passed}p/${x.failed}f/${x.pending}s`)); }
  const keys = new Set(ok.flatMap((j) => Object.keys(j.R.tests))); const flakes = [];
  for (const k of keys) { const vals = ok.map((j) => j.R.tests[k] ?? 'ABSENT'); const c = count(vals); if (Object.keys(c).length > 1) flakes.push({ test: k, outcomes: c, jobsWithMinority: ok.filter((j) => (j.R.tests[k] ?? 'ABSENT') !== Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]).map((j) => ({ run: j.run, rep: j.rep, status: j.R.tests[k] ?? 'ABSENT', cpu: j.R.host.cpuModel })) }); }
  B.testsTracked = keys.size; B.flakes = flakes;
  const fkeys = new Set(ok.flatMap((j) => Object.keys(j.R.fingerprints))); const bit = []; const flakeKeysByPrefix = new Set(flakes.map((f) => f.test));
  for (const k of fkeys) { const vals = ok.map((j) => j.R.fingerprints[k] ?? 'ABSENT'); const c = count(vals); if (Object.keys(c).length > 1) { const groups = {}; for (const j of ok) { const v = j.R.fingerprints[k] ?? 'ABSENT'; (groups[v] ??= []).push(j); }
      bit.push({ key: k, variants: Object.keys(c).length, counts: c, byCpu: Object.fromEntries(Object.entries(groups).map(([v, js]) => [v, count(js.map((j) => j.R.host.cpuModel))])), byMesa: Object.fromEntries(Object.entries(groups).map(([v, js]) => [v, count(js.map((j) => j.R.versions?.['mesa-vulkan-drivers'] ?? 'n/a'))])), byImage: Object.fromEntries(Object.entries(groups).map(([v, js]) => [v, count(js.map((j) => j.R.job.ImageVersion))])), byAvx512: Object.fromEntries(Object.entries(groups).map(([v, js]) => [v, count(js.map((j) => String(j.R.host.simd.avx512f)))])) }); } }
  B.fingerprintsTracked = fkeys.size; B.bitVariance = bit;
  B.timing = { jobWallSec: stat(J.filter((j) => j.conclusion === 'success').map((j) => j.wallSec)), npmCiSec: stat(ok.map((j) => j.R.timing.npmCiSec)), acquireSec: stat(ok.map((j) => j.R.timing.acquireSec)), aptSec: stat(ok.map((j) => j.R.timing.aptSec)), fullSec: stat(ok.map((j) => j.R.timing.fullSec)), invSec: stat(ok.map((j) => j.R.timing.invSec)), exSec: stat(ok.map((j) => j.R.timing.exSec)), testsSec: stat(ok.map((j) => j.R.timing.testsSec)), v2Sec: stat(ok.map((j) => j.R.timing.v2Sec).filter((x) => x > 0)), v2SetupSec: stat(ok.map((j) => j.R.timing.v2SetupSec).filter((x) => x > 0)), dumpSec: stat(ok.map((j) => j.R.timing.dumpSec).filter((x) => x > 0)),
    perStepApiSec: Object.fromEntries(Object.keys(J.find((j) => j.R)?.steps ?? {}).filter((s) => !/^(Post|Complete)/.test(s)).map((s) => [s, stat(J.map((j) => j.steps[s]).filter((x) => x != null))])) };
  { const dl = J.filter((j) => j.R?.acquisition?.downloadInfo).map((j) => Object.fromEntries(j.R.acquisition.downloadInfo.split(/\s+/).map((kv) => kv.split('=')))); if (dl.length) B.debDownload = { http: count(dl.map((x) => x.http)), size: count(dl.map((x) => x.size)), timeSec: stat(dl.map((x) => +x.time)) }; B.debShaCheck = count(J.filter((j) => j.R).map((j) => j.R.acquisition?.debCheck ?? 'n/a')); }
  B.startHoursUTC = count(J.map((j) => j.started.slice(0, 13) + ':00Z')); B.runs = count(J.map((j) => String(j.run)));
  B.billableMinutesEst = J.reduce((a, j) => a + Math.max(1, Math.ceil(j.wallSec / 60)), 0);
  out.backends[backend] = B;
  md.push(`## ${backend}`, `jobs dispatched ${J.length}, complete ${ok.length}, infra failures ${infra.length}, suite-level failures ${suiteFail.length}; est. billable ${B.billableMinutesEst} min`, `tests tracked ${keys.size}; **flakes (status differs between jobs): ${flakes.length}**; fingerprints tracked ${fkeys.size}; **bit-variance keys: ${bit.length}**`,
    `CPU: ${JSON.stringify(B.cpu)}`, `ImageVersion: ${JSON.stringify(B.imageVersion)}`, `Mesa: ${JSON.stringify(B.versions['mesa-vulkan-drivers'])} LLVM20: ${JSON.stringify(B.versions.libllvm20)}`, `adapter: ${JSON.stringify(B.adapterDevice)}`, `suite totals: ${JSON.stringify(B.suiteTotals)}`,
    `job wall s: ${JSON.stringify(B.timing.jobWallSec)}`, `tests s: ${JSON.stringify(B.timing.testsSec)}`, `npm ci s: ${JSON.stringify(B.timing.npmCiSec)}`, `acquire s: ${JSON.stringify(B.timing.acquireSec)}`, '');
  if (flakes.length) md.push('flakes:', ...flakes.slice(0, 40).map((f) => `- ${f.test} ${JSON.stringify(f.outcomes)}`), ''); if (bit.length) md.push('bit-variance (first 40):', ...bit.slice(0, 40).map((b) => `- ${b.key} variants=${b.variants} ${JSON.stringify(b.counts)} cpu=${JSON.stringify(b.byCpu)}`), '');
  if (infra.length) md.push('infra failures:', ...B.infraFailures.map((x) => `- ${JSON.stringify(x)}`), ''); }
fs.writeFileSync(path.join(OUTD, 'analysis.json'), JSON.stringify(out, null, 1)); fs.writeFileSync(path.join(OUTD, 'analysis.md'), md.join('\n')); console.log(md.join('\n'));
