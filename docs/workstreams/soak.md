> Paths in this document refer to the original working tree. See [docs/INDEX.md](../INDEX.md) for the mapping to this repository.

# WS-SOAK report
Native ubuntu-24.04 x86_64 2-vCPU runners, no docker; 299 matrix jobs, identity assertion passed in all; infra failures 0/299. Workflow ci-soak.yml in the staging repo (commits 7da0662..1a58c5a), manual only.
VERIFIED
- C2, suite v1 (1878 tests; 62 jobs/backend at 17:15/18:01/19:24 UTC; EPYC 7763/9V74/9V45, Xeon 6973P-C/8573C/8370C; 2 runner images): Lavapipe 0 flakes, SwiftShader 0 flakes; 0 value-fingerprint variance; outcomes identical to Phase 2 (Lavapipe 394p/15f/17s; SwiftShader 359p/34f/33s). 95% upper bound ~4.7%/job.
- Dump suite (60 jobs/backend, 195 210 lanes): Lavapipe 186 lanes vary between jobs, ALL NaN sign/payload only (7fc00000 vs ffc00000), random per run, not tied to CPU/Mesa/image; SwiftShader 1 lane (inverseSqrt(-0.5) lane 2) flips sign in 3/60 jobs (AVX-512 EPYC, not significant).
- v2 examples (97, 1 repeat): class identical in every job (87 ran-clean + 10 needs-unavailable-API). SwiftShader 8 heavy examples only 8 jobs: ripple-cube ran 4 / "crashed" 4 = runner time-limit (exit 124, ~455-476 s), attributable timeout. Fingerprint variance: Lavapipe jelly-slider cp3, jelly-switch cp3, ripple-cube cp30; SwiftShader jump-flood-voronoi cp30.
- Example runtime: Lavapipe ripple-cube median 196 s, others <62 s; SwiftShader ripple-cube 474 s, attractors 380, particles-snow 322, 3d-fish 280.
- C7: v1 job wall median/p95 Lavapipe 204/235 s, SwiftShader 152/169 s; acquisition ~13 s each (SwiftShader .deb sha-pinned, ~250 downloads all OK; Lavapipe apt 17.5 MB); v2 17 min (Lavapipe) vs ~13 min + 34 min heavy (SwiftShader).
- Perf SS/LVP ratio (shared noisy runner, 15 jobs x 6 pairs): steady dispatch 3.7-6.2x slower; compile 3.5-4.5x; first submit 1.8-3.5x; readback faster 0.8x->0.23x.
- Pin: runner image already has Mesa 25.2.8; apt madison offers 24.0.5, 25.2.8 (security .04.2, updates .04.4). Minutes ~1375 (+~112 earlier); account billing unreadable.
HYPOTHESES: both pass C2 gate on v1; NaN-sign wobble matters only for bit-level golden files; example variance is likely example/runner nondeterminism (Metal shows it too).
UNRESOLVED: NaN-sign cause; example variance (needs EX_REPEATS=2 / fixed clock); long-run flake rate (only ~3.5 h one day); Mesa drift effect -> WS-DRIFT-LVP.
Kept failed attempt: raw/run-39303481655 (NOTE.md).
