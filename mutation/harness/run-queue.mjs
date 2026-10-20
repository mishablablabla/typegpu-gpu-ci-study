// usage: node run-queue.mjs <queue.txt> [dockerWorkers=2] [metalWorkers=1]
// queue line: <mutant|BASE> <backend> <pass> <rep> [POOLS...]   (pass label names the pool set: pool1 | own | ex97). Re-read each time a worker is free, so lines can be appended while running. Resumable (skips runs with run.json).
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
const H = path.dirname(new URL(import.meta.url).pathname), REPO = path.resolve(H, '../..'), M = process.env.MUTATION_DIR ?? path.join(REPO, 'runs/mutation'); const qf = path.resolve(process.argv[2]); const nd = Number(process.argv[3] ?? 2), nm = Number(process.argv[4] ?? 1);
const log = (s) => fs.appendFileSync(path.join(M, 'queue.log'), `${new Date().toISOString()} ${s}\n`);
const started = new Set(); const running = { docker: 0, metal: 0 };
const POOLS = { pool1: 'ex inv-bitops inv-vector-fns inv-mul-paths inv-scalar-int inv-integer-mul inv-comptime full', own: 'own' };
const read = () => fs.readFileSync(qf, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const run = (cmd, args, env) => new Promise((res) => { const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: 'ignore' }); p.on('exit', (c) => res(c)); });
async function work(kind) {
  for (;;) {
    const job = read().find((l) => { const [id, bk, pass, rep] = l.split(/\s+/); const k = `${id}__${bk}__${pass}__r${rep}`; return !started.has(k) && (kind === 'metal') === (bk === 'metal'); });
    if (!job) { if (fs.existsSync(path.join(M, 'queue.stop'))) return; await new Promise((r) => setTimeout(r, 20000)); continue; } const [id, bk, pass, rep, ...pl] = job.split(/\s+/); const name = `${id}__${bk}__${pass}__r${rep}`; started.add(name);
    const out = path.join(M, 'runs', name);
    if (fs.existsSync(path.join(out, 'run.json'))) { log(`skip ${name} (done)`); continue; }
    if (fs.existsSync(out)) fs.renameSync(out, path.join(M, 'runs', `_incomplete-${name}-${Date.now()}`));
    log(`start ${name}`); const t = Date.now();
    const c = await run(path.join(H, 'run-mutant.sh'), [id, bk, out], { POOLS: pl.length ? pl.join(' ') : POOLS[pass] });
    await run('node', [path.join(H, 'collect.mjs'), out], {}); log(`done ${name} rc=${c} wall=${Math.round((Date.now() - t) / 1000)}s`);
  }
}
await Promise.all([...Array(nd)].map(() => work('docker')).concat([...Array(nm)].map(() => work('metal'))));
log('queue drained');
