> Paths in this document refer to the original working tree. See [docs/INDEX.md](../INDEX.md) for the mapping to this repository.

# WS-MUT-RUN REPORT — verified facts / hypotheses / unresolved

Results and tables: `RESULTS.md`, `results.json`, `ATTRIBUTION.md`. Harness: `harness/` (README-by-comment in each file). Run dirs: `runs/<mutant>__<backend>__<pass>__r<k>/` (pass = pool1 | own), `runs-ex/` (ex97 second pass), `probes/` (OOB probe + ex97sub scripts). Dev/failed attempts are kept as `runs/_dev-*`, `runs/_probe-*`, `runs/_incomplete-*` (NOTE.txt in each).

## Verified facts (evidence)
1. Mutated source is what executes: vite aliases to per-run copy of `_shared/typegpu-HEAD` + patch; canaries M24/M26 DET on 3 backends with different WGSL; `repo.sha256` of all 324 mutant runs differs from BASE exactly in the patch's files; ex97 runs hash the checkout tree before/after (restored OK in all 22 runs; `p3-run.json`, `tree-*.sha`).
2. Backend identity: 336/336 runs passed preflight (vulkaninfo/ICD/loader/adapter checks copied from Phase 2) and the post-run check that every test process's adapter matches (`adapter-assert.json`). No crashes, hangs or aborted runs; the crash re-run path was never triggered.
3. BASE determinism: 2 BASE runs per backend (pool1, own), 0 tests differ in status / value fingerprint / WGSL text. (Early dev runs on Metal showed 5 non-deterministic tests: all were timestamp-query readbacks; the filter was added before the final BASE runs. ex97 BASE: 3 of 97 examples non-deterministic over 6 repeats on Metal — jump-flood-voronoi, compute-particles-snow, concurrent-chart — excluded from the ex97 differential.)
4. C1 numbers: Lavapipe 36, SwiftShader 34 (+2 nr-f16), Metal 36 of 50 on pool1+own; 26/25(+1)/26 on the pre-existing pool alone. Differences Lavapipe vs SwiftShader: M01, M21 only, both f16.
5. M32 divergence mechanism (verified): `probes/oob-write.{lavapipe,swiftshader,metal}.json` — an OOB write is clamped to the last element on both emulators and dropped on Metal.
6. SwiftShader's lower pool size: 33 skipped tests in BASE (Lavapipe/Metal 17) + 45 failing (Lavapipe 31, Metal 2); f16-typed tests account for the skips/most failures.
7. Reruns: M07, M32, M35, M42 x2 on all backends: stable.
8. ex97 on emulators (10-example subset): M20, M44, M32 DET on both; M13 not.

## Hypotheses (not verified)
- M35: the missing barrier is invisible on software backends because invocations execute in lock-step / deterministic order; would be settled by a raw WGSL race probe with many workgroup sizes or by running the Lavapipe/SwiftShader with `LP_NUM_THREADS` variations.
- M29's detection-depth differences (10/13/14) stem from float edge-case differences between backends (not looked at).
- The own tests partially explain "more detections": they were written after the catalogue (selection bias); a blind author could detect fewer/more.

## Unresolved / not done (and what would settle them)
- Full 97-example pass on the emulators for all mutants (not run: 26 min Lavapipe / 46 min SwiftShader per run, plus docker-slot starvation — 3 slots were held by other workstreams for 20-60 min at a time; my queue used batches of 3-4 runs per slot to cope). Evidence needed: ~13 undetected/own-only mutants x 2 backends via `phase3/examples/runner` + patched checkout (the scripts `harness/run-ex97.sh`, `harness/ex97-sub-container.sh` show how).
- Rule deviation: the three one-off OOB probe containers (~10 s each, `docker run` without `with-slot.sh`) and leftover scratch dirs `mutation/work/M*` (3 dirs from killed runs; deletion was blocked by the permission check — safe to `rm -rf`).
- BASE repeated only twice per backend; x86_64 not covered (arm64 docker only); one TypeGPU revision; HEAD vs 0.12.7: two Phase-2 expectation failures at HEAD (mul-paths N5, vector-fns CPU coverage) are in BASE on every backend.
- WS-MOCK join (which mutants the mocked unit tests already catch) not done here; `results.json` mutant ids match the catalogue.

## Harness history (what changed before the final BASE runs)
fixture-arg bug in hooks (`runs/_probe-fail1`), cwd for mnist assets/investigations (`_probe-fail2`), timestamp readback exclusion + Math.random re-seed (`_dev-*`), longer pool timeouts (ex 600 s, inv 600 s, full 900 s). Final harness frozen at the first BASE queue; `run-queue2.mjs`/slot batching and `run-mutant.sh` SLOTCMD tweak came later but do not change what runs in the container.
