// usage: node run-queue2.mjs <queue.txt> <dockerWorkers> <batch>   (docker jobs only; metal handled by run-queue.mjs with 0 docker workers)
// A worker takes up to <batch> docker jobs, acquires ONE slot (tools/with-slot.sh) and runs them back-to-back inside it (P3_SLOT_HELD=1), then releases the slot (avoids starvation by short jobs).
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
const H = path.dirname(new URL(import.meta.url).pathname), REPO = path.resolve(H, '../..'), M = process.env.MUTATION_DIR ?? path.join(REPO, 'runs/mutation'), P3 = path.resolve(M, '..');
const qf = path.resolve(process.argv[2]); const nw = Number(process.argv[3] ?? 2), batch = Number(process.argv[4] ?? 4);
const log = (s) => fs.appendFileSync(path.join(M, 'queue.log'), `${new Date().toISOString()} ${s}\n`);
const POOLS = { pool1: 'ex inv-bitops inv-vector-fns inv-mul-paths inv-scalar-int inv-integer-mul inv-comptime full', own: 'own' };
const started = new Set();
const read = () => fs.readFileSync(qf, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const sh = (cmd, env) => new Promise((res) => { const p = spawn('bash', ['-c', cmd], { env: { ...process.env, ...env }, stdio: 'ignore' }); p.on('exit', (c) => res(c)); });
async function worker(n) {
  for (;;) {
    const jobs = []; for (const l of read()) { const [id, bk, pass, rep, ...pl] = l.split(/\s+/); if (bk === 'metal') continue; const name = `${id}__${bk}__${pass}__r${rep}`; if (started.has(name)) continue;
      if (fs.existsSync(path.join(M, 'runs', name, 'run.json'))) { started.add(name); continue; } started.add(name); jobs.push({ id, bk, pass, rep, name, pools: pl.length ? pl.join(' ') : POOLS[pass] }); if (jobs.length >= batch) break; }
    if (!jobs.length) { if (fs.existsSync(path.join(M, 'queue.stop'))) return; await new Promise((r) => setTimeout(r, 20000)); continue; }
    const script = jobs.map((j) => { const out = path.join(M, 'runs', j.name); return `[ -e '${out}' ] && mv '${out}' '${M}/runs/_incomplete-${j.name}-'$(date +%s); echo "$(date -u +%FT%TZ) start ${j.name} (batch w${n})" >> '${M}/queue.log'; POOLS='${j.pools}' '${H}/run-mutant.sh' ${j.id} ${j.bk} '${out}' >/dev/null 2>&1; node '${H}/collect.mjs' '${out}' >/dev/null 2>&1; echo "$(date -u +%FT%TZ) done ${j.name}" >> '${M}/queue.log'`; }).join('\n');
    log(`w${n} waiting for slot for batch: ${jobs.map((j) => j.name).join(' ')}`);
    await sh(`'${process.env.WITH_SLOT ?? path.join(REPO, 'tools/with-slot.sh')}' bash -c "$P3_SCRIPT"`, { P3_SLOT_HELD: '1', P3_SCRIPT: script });
  }
}
await Promise.all([...Array(nw)].map((_, i) => worker(i)));
log('queue2 drained');
