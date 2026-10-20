import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { classify, checkable } from './classify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const [, , backendArg, outArg] = process.argv;
const OUT = path.resolve(outArg ?? '');
const ROOT = path.resolve(process.env.TYPEGPU_ROOT ?? '');
const EXPECT = process.env.EX_EXPECT_BACKEND ?? backendArg ?? 'any';
const REPEATS = Number(process.env.EX_REPEATS ?? 2), FRAMES = process.env.EX_FRAMES ?? '3,30', TIMEOUT = Number(process.env.EX_TIMEOUT_MS ?? 180000), JOBS = Number(process.env.EX_JOBS ?? 1);
const SLOW = JSON.parse(process.env.EX_TIMEOUT_OVERRIDES ?? '{}');
if (!outArg || fs.existsSync(OUT)) { console.error(`usage: run-all.mjs <backend> <new outdir>  (outdir must not exist: ${OUT})`); process.exit(2); }
const exRoot = path.join(ROOT, 'apps/typegpu-docs/src/examples');
if (!fs.existsSync(exRoot)) { console.error(`TYPEGPU_ROOT does not look like a TypeGPU checkout: ${ROOT}`); process.exit(2); }

let all = [];
for (const cat of fs.readdirSync(exRoot).sort()) { const cd = path.join(exRoot, cat); if (!fs.statSync(cd).isDirectory()) continue; for (const n of fs.readdirSync(cd).sort()) if (fs.existsSync(path.join(cd, n, 'meta.json'))) all.push(`${cat}/${n}`); }
const filter = process.env.EX_FILTER ? process.env.EX_FILTER.split(',').map((s) => s.trim()).filter(Boolean) : null;
if (filter) all = all.filter((e) => filter.some((f) => e === f || e.endsWith('/' + f) || (f.startsWith('/') && new RegExp(f.slice(1, -1)).test(e))));
fs.mkdirSync(OUT, { recursive: true });
const meta = { backendLabel: process.env.EX_BACKEND_LABEL ?? backendArg, expect: EXPECT, root: ROOT, node: process.version, platform: `${process.platform}-${process.arch}`, start: new Date().toISOString(), repeats: REPEATS, frames: FRAMES, timeoutMs: TIMEOUT, jobs: JOBS, filter: process.env.EX_FILTER ?? null, hideFeatures: process.env.HIDE_FEATURES ?? '', examples: all.length, typegpuRev: process.env.EX_TYPEGPU_REV ?? null,
  runnerSha256: Object.fromEntries(['run-all.mjs', 'run-example.mjs', 'classify.mjs', 'summarize.mjs', 'lib/dom.mjs', 'lib/gpu.mjs'].map((f) => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(here, f))).digest('hex').slice(0, 16)])) };
fs.writeFileSync(path.join(OUT, 'batch.json'), JSON.stringify(meta, null, 1));
console.error(`[run-all] ${all.length} examples x ${REPEATS} repeats, backend=${meta.backendLabel} expect=${EXPECT} -> ${OUT}`);

const expectOk = (a) => { if (EXPECT === 'any' || !a) return true; if (EXPECT === 'metal') return a.vendor === 'apple'; if (EXPECT === 'swiftshader') return a.architecture === 'swiftshader' || /swiftshader/i.test(a.description + a.device); if (EXPECT === 'lavapipe') return /llvmpipe|lavapipe/i.test(`${a.description} ${a.device} ${a.architecture}`) || a.vendor === 'mesa'; return true; };

function runOne(ex, rep) {
  return new Promise((resolve) => {
    const dir = path.join(OUT, ex.replace('/', '--'), `r${rep}`); fs.mkdirSync(dir, { recursive: true });
    const tmo = SLOW[ex] ?? TIMEOUT;
    const args = [path.join(here, 'run-example.mjs'), '--root', ROOT, '--example', ex, '--out', dir, '--frames', FRAMES, '--repeat', String(rep), '--timeout-ms', String(Math.max(10000, tmo - 25000)), '--png', rep === 1 && process.env.EX_PNG !== '0' ? '1' : '0'];
    const t0 = Date.now();
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: process.env });
    let so = '', se = '', soN = 0, seN = 0; const CAP = 1_500_000;
    child.stdout.on('data', (d) => { soN += d.length; if (so.length < CAP) so += d; });
    child.stderr.on('data', (d) => { seN += d.length; if (se.length < CAP) se += d; });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, tmo);
    child.on('close', (code, signal) => {
      clearTimeout(timer); try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      const wallMs = Date.now() - t0;
      fs.writeFileSync(path.join(dir, 'stdout.txt'), so + (soN > CAP ? `\n[truncated, ${soN} bytes]` : '')); fs.writeFileSync(path.join(dir, 'stderr.txt'), se + (seN > CAP ? `\n[truncated, ${seN} bytes]` : ''));
      let result = null; try { result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')); } catch {}
      const tail = se.trim().split('\n').filter((l) => !l.startsWith('[console.')).slice(-3).join(' | ').slice(0, 300);
      const exit = { code, signal, timedOut, wallMs, stderrTail: tail };
      const c = classify(result, exit);
      const row = { example: ex, repeat: rep, ...c, exit, wallMs, checkable: checkable(result), adapter: result?.adapter ? { vendor: result.adapter.vendor, architecture: result.adapter.architecture, device: result.adapter.device, description: result.adapter.description } : null };
      fs.writeFileSync(path.join(dir, 'classification.json'), JSON.stringify(row, null, 1));
      fs.appendFileSync(path.join(OUT, 'runs.jsonl'), JSON.stringify(row) + '\n');
      console.error(`[run-all] ${ex} r${rep}: ${c.class}${c.detail ? ' - ' + c.detail.slice(0, 110) : ''} (${(wallMs / 1000).toFixed(1)}s)`);
      resolve(row);
    });
  });
}

let aborted = false;
for (let rep = 1; rep <= REPEATS && !aborted; rep++) {
  const queue = [...all]; let first = rep === 1;
  const worker = async () => { while (queue.length && !aborted) { const ex = queue.shift(); const row = await runOne(ex, rep); if (first && row.adapter && !expectOk(row.adapter)) { aborted = true; fs.writeFileSync(path.join(OUT, 'ABORTED.txt'), `backend identity mismatch: expected ${EXPECT}, adapter ${JSON.stringify(row.adapter)}\n`); console.error('[run-all] ABORT: backend identity mismatch'); } first = false; } };
  await Promise.all(Array.from({ length: Math.min(JOBS, all.length) }, worker));
}
const { summarize } = await import('./summarize.mjs'); summarize(OUT);
fs.writeFileSync(path.join(OUT, 'batch-end.json'), JSON.stringify({ end: new Date().toISOString(), aborted }, null, 1));
console.error('[run-all] done');
