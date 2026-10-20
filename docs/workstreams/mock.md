> Paths in this document refer to the original working tree. See [docs/INDEX.md](../INDEX.md) for the mapping to this repository.

# WS-MOCK REPORT — does a GPU backend add coverage over TypeGPU's own mocked unit tests?

Data: RESULTS.md (table per mutant), results.json (id -> status, failing tests), base.json, runs/<id>/ (raw.log, vitest.json, tsc logs, mutant.patch).
Method: image `webgpu-poc-p3-mock-base:1` (node 24 arm64, pnpm 11.1.2 per package.json, `pnpm install --frozen-lockfile` baked in, vitest 4.1.11 resolved by the lockfile). Per mutant a fresh container, `patch -p1` of catalogue/patches/Mxx.patch onto the pristine snapshot, `tsc --noEmit` of each touched package, then `vitest run --project=!browser` (= `pnpm test:unit`; CI=true so snapshots are never auto-updated). 303 test files / 3576 tests incl. 61 docs example tests (WGSL inline snapshots). Slot = 2 CPU / 2 GB.

## Verified facts
- BASE (unmutated, no attest), 2 runs: 3574 pass / 2 skipped / 0 fail both times; 80 s and 83 s wall (idle docker). No flaky tests seen in these 2 runs.
- BASE with `ENABLE_ATTEST=1` (CI's `test:unit-and-attest`): runs only with `NODE_OPTIONS=--max-old-space-size=1700` in a 2 GB slot (default heap OOMs at ~24 s during "Waiting for TypeScript to check your project"). Two base runs: 1 failure (probability.test.ts) and 5 failures (global-wind-map, jelly-slider, jelly-switch, probability, ripple-cube): all docs example tests hitting the 5 s test timeout, 289 s / 540 s wall. Under attest on a loaded CPU the docs example tests are FLAKY on BASE (timeouts, not logic). I treat timeout-only failures as noise; none of the mutant verdicts depends on them.
- 50 mutants run (M01..M50, tier-1 first). All 50 patches applied and `tsc --noEmit` passed for every touched package (typegpu, typegpu-noise, typegpu-sort, typegpu-color, typegpu-sdf, ...). 0 invalid mutants. Docs-app astro typecheck (`test:types` of typegpu-docs) was not run (not cheap; no mutant touches apps/).
- Result: 21 CAUGHT-by-assertion, 16 CAUGHT-snapshot-only, 13 MISSED (tier 1: 14 / 11 / 12; tier 2: 7 / 5 / 1).
- MISSED set (all re-run once non-attest, and once with ENABLE_ATTEST=1; every re-run again 0 non-timeout failures): M02, M25, M26, M27, M33, M34, M35, M42, M46, M47, M48, M49, M50. Of these 11 are catalogue reach_class gpu-suite (M25-27, M33-35, M46-50), 1 `none`/near-equivalent default-value mutant (M42), 1 deliberately near-equivalent host-only mutant (M02).
- Why missed (verified by grep/test reading, not just guessed): the missed std functions (faceForward, countLeadingZeros, extractBits, insertBits, firstLeadingBit, countTrailingZeros, dot4U8Packed, trunc) have no CPU implementation and no mocked test or docs snapshot mentions them; @typegpu/sort has no unit tests (M34/M35/M42); M33 (`dispatchThreads` floor vs ceil): the only mocked uses are `dispatchThreads()`/`dispatchThreads(4)` in computePipeline.test.ts:683 / garbageCollection.test.ts:75 and neither asserts the dispatched workgroup count. M33 was guessed "likely" caught by the catalogue: it is a surprise miss.
- Snapshot-only catches (weaker evidence: a snapshot diff cannot tell bug from intended change): M05 M07 M11 M13 M17 M18 M24 M31 M32 M36 M38 M39 M40 M41 M43 M45. Several detect only through one docs example snapshot (M36, M40, M41 = 1 failing test).
- Weak "assertion" catches: M03, M10, M12, M14 have exactly one non-snapshot failure among many snapshot failures (M03's is a thrown error, not a value assertion).
- Wall time per mutant run 85-230 s (non-attest), contended; BASE idle is 80 s. Timing is NOT a clean measurement (other workstreams share the VM, `with-slot.sh` without -x).

## Hypotheses (not verified)
- H1: the 12 MISSED gpu-suite mutants are the "exclusive GPU" evidence: only a run that executes the generated WGSL (std builtins, dispatch counts, workgroup-barrier races) can see them. They are missed by the mocked suite, but whether a GPU suite catches them is WS-MUT-RUN's data; the lead joins. Settled by: phase3/mutation/results.json for these ids.
- H2: M34/M35 (barrier removed) may pass on some backends/hardware even on a GPU (race); only the GPU matrix can say.
- H3: attest (type-level tests) cannot catch any of these runtime mutants. Evidence: all 13 MISSED stayed missed under ENABLE_ATTEST=1; attest was not run for CAUGHT mutants (irrelevant to the verdict).
- H4: snapshot-only caught mutants (esp. docs-only reach) are less informative: a maintainer would update the snapshot; whether the existing review process would catch the wrong value is unknown.

## Unresolved
- Flake rate of the BASE attest run is only sampled twice (1 and 5 timeouts, under different load). To settle: >=10 attest runs on an idle VM or `-x` exclusive, or run attest with `--testTimeout`.
- `pnpm test:built-unit` (TEST_BUILT=1; builds packages) was not run; mutants might be caught/missed differently against built output (the built job uses the same tests; expected same verdict, untested).
- Other CI gates (test:style, test:circular-deps, docs astro check) not run.
- Per-mutant wall times are contended; if C7 needs clean unit-test timing use BASE idle numbers (80 s non-attest).
