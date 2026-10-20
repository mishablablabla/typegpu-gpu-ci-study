// usage: node run-pool.mjs <pool> <outdir> <timeoutSec>   env: P3_WORK etc. Runs one vitest pool with a wall-clock limit; records exit/timeout/wall.
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const [pool, out, tmo] = process.argv.slice(2); const W = process.env.P3_WORK;
mkdirSync(out, { recursive: true });
const so = openSync(path.join(out, `${pool}.stdout`), 'w'), se = openSync(path.join(out, `${pool}.stderr`), 'w');
const t0 = Date.now();
const p = spawn(path.join(W, 'node_modules/.bin/vitest'), ['run', '--config', path.join(W, 'p3/p3.config.mts'), '--reporter=json', `--outputFile=${path.join(out, pool + '.vitest.json')}`],
  { cwd: pool === "ex" ? path.join(W, "pool/typegpu-examples") : path.join(W, "pool"), env: { ...process.env, P3_POOL: pool }, stdio: ['ignore', so, se], detached: true });
let timedOut = false;
const timer = setTimeout(() => { timedOut = true; try { process.kill(-p.pid, 'SIGKILL'); } catch {} }, Number(tmo) * 1000);
p.on('exit', (code, sig) => { clearTimeout(timer); try { process.kill(-p.pid, 'SIGKILL'); } catch {}
  writeFileSync(path.join(out, `${pool}.exit.json`), JSON.stringify({ pool, code, signal: sig, timedOut, wallSec: (Date.now() - t0) / 1000, jsonWritten: existsSync(path.join(out, pool + '.vitest.json')) }));
  process.exit(0); });
