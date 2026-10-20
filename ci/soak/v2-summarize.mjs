// usage: node v2-summarize.mjs <outdir/v2> <runnerdir> -> <outdir/v2>/summary.json {meta, tests:{"<example>::r<k>": class}, fingerprints:{"<example>/r<k>/<checkpoint>": hash}}
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { pathToFileURL } from 'node:url';
const [V, R] = process.argv.slice(2); const { loadRuns, readResult, fingerprint } = await import(pathToFileURL(path.join(R, 'src/summarize.mjs')).href);
const RUN = path.join(V, 'run'); const by = loadRuns(RUN); const tests = {}, fp = {}; const adapters = {}; const h = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const classes = {}; for (const [ex, reps] of Object.entries(by)) for (const [rep, row] of Object.entries(reps)) { tests[`${ex}::r${rep}`] = row.class; classes[row.class] = (classes[row.class] ?? 0) + 1; if (row.adapter) adapters[`${row.adapter.vendor}/${row.adapter.architecture}/${row.adapter.device}`] = (adapters[`${row.adapter.vendor}/${row.adapter.architecture}/${row.adapter.device}`] ?? 0) + 1;
  const res = readResult(RUN, ex, +rep); if (res) for (const [cp, v] of Object.entries(fingerprint(res))) fp[`${ex}/r${rep}/${cp}`] = h(v); }
let batch = null; try { batch = JSON.parse(fs.readFileSync(path.join(RUN, 'batch.json'), 'utf8')); } catch {}
const ex = (() => { try { return +fs.readFileSync(path.join(V, 'run-all.exit'), 'utf8'); } catch { return null; } })();
fs.writeFileSync(path.join(V, 'summary.json'), JSON.stringify({ meta: { present: true, runAllExit: ex, rows: Object.values(by).reduce((a, r) => a + Object.keys(r).length, 0), examples: Object.keys(by).length, classes, adapters, batch: batch && { expect: batch.expect, node: batch.node, repeats: batch.repeats, runnerSha256: batch.runnerSha256 } }, tests, fingerprints: fp }));
console.log(`v2 summary: ${Object.keys(by).length} examples, ${Object.keys(tests).length} runs, classes ${JSON.stringify(classes)}`);
