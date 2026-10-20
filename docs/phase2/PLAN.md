> Paths in this document refer to the original working tree. See [docs/INDEX.md](../INDEX.md) for the mapping to this repository.

# Phase 2 — SwiftShader: working plan (written before any download/build)

Status: executed (see report/FINAL_REPORT.md). Original text below was written before any download or build.
Written 2026-10-19 after 10 read-only investigations (check 1–10) and my own spot checks (marked *verified*).

## 1. Confirmed environment and repository state
- Host: macOS arm64 (Apple M3 Pro), Docker 29.8.2 arm64, Node v24.21.0. CI (manual, private staging repo `the private staging repository`, HEAD `8036460`): ubuntu-24.04 native x86_64, 2 vCPU, random AMD EPYC / Intel Xeon.
- Frozen baseline verified at start of Phase 2 by check 4 and 9: `manifest.sha256` 825 OK / 0 failed (from `investigations/backend-diff/final/`), `evaluator-versions.sha256` 33 OK (from PoC root); manifest self-hash `32a888ed525ec2f45e14abe7e6ad9b7ef81aeb850815d25487b4a377026b3981` (record in `env/preflight.txt`). TypeGPU: clean, HEAD `e893ad11`.
- `webgpu@0.6.2` = dawn.node built from node-webgpu tag v0.6.2, Dawn commit `77f9a9aa5f71…` (tag pin, not binary-verified). dawn.node contains Dawn's Vulkan backend and SwiftShader *detection* (vendor 0x1AE0 / device 0xC0DE) but **no SwiftShader library**; it only `dlopen`s `libvulkan.so.1`. Dawn's own SwiftShader pin at that commit: `1e80438d2b93ef36a7c05f8d2b81233bac0e3d16` (*verified*, Dawn DEPS).

## 2. Acquisition options (check 1, 3)
| # | Route | arm64 | x86_64 | Pin / integrity | Cost | Notes |
|---|---|---|---|---|---|---|
| 1 | Debian `chromium-common` 155.0.8059.79-1~deb13u1, **extract only** (`libvk_swiftshader.so` + `vk_swiftshader_icd.json`) | yes, 36 302 732 B | yes, 31 329 836 B (*both verified: HTTP 200, sizes*) | immutable snapshot.debian.org URL (stamp `debian-security/20261015T173155Z`) + sha256 recorded by us on first fetch (+ Debian-signed Packages) | one curl + `dpkg-deb -x`, seconds | SwiftShader revision = whatever Chromium M155 vendored (not a chosen commit); provenance label must be "Chromium M155 vendored SwiftShader via Debian chromium-common". `.so` NEEDED libs / ICD `library_path` / Vulkan version still unverified until extracted |
| 2 | Chrome for Testing full zip | linux-arm64 + linux64 | | GCS md5 only | ~200 MB/arch | cross-check / fallback |
| 3 | Electron release zip | yes | yes | not verified | ~124 MB | weaker |
| 4 | Nix `swiftshader` | | | content-addressed | needs Nix | strongest pin, heavy tooling |
| 5 | Source build, pinned SHA (e.g. Dawn's `1e80438d`), `REACTOR_BACKEND=LLVM`, tests/WSI off, clang | feasible | feasible | exact commit | **estimated** 8–20 min arm64 (M3 Pro VM), 20–40 min on 2–4 vCPU CI, 4–8 GB RAM, ~1 GB clone; unmeasured | needed only if an exact SwiftShader commit matters |

**Primary route: 1** (smallest, pinned, both arches, no compile). **Alternative: 5** at Dawn's pinned commit, only if route 1 fails smoke or a version question matters. No parallel builds.

## 3. Integration (check 2, 4, 7, 9)
- New image(s) from `ubuntu:24.04` with `libvulkan1 vulkan-tools` only, **no `mesa-vulkan-drivers`** (`--no-install-recommends` mandatory), ICD files under `/opt/swiftshader/`, image `ENV VK_DRIVER_FILES` + `VK_ICD_FILENAMES` = that JSON (`VK_LOADER_DRIVERS_SELECT=vk_swiftshader_icd.json` as second guard). Build-time assertions: no `lvp_icd*`, no mesa package.
- Distinct image tags `webgpu-poc-swiftshader-*` (never reuse `webgpu-poc-oracle-ext` / `-cts`: that would silently retag the Lavapipe images).
- No edit of any frozen/hash-listed file (`harness.ts`, dump tests, evaluators, `run-cts.sh`, frozen Dockerfiles/run.sh, `build-baseline.mjs`). Only **new** files under `investigations/backend-diff/swiftshader/` and new `docker-swiftshader*/` dirs.
- Backend proof, all must pass before any dump (fail loudly): `vulkaninfo --summary` exactly one device, vendorID 0x1ae0, deviceID 0xc0de, CPU type, name `SwiftShader Device…`, driverID Google SwiftShader; ICD dirs contain no lvp/other manifests; loader trace (`VK_LOADER_DEBUG=driver`) names only SwiftShader; `requestAdapter({forceFallbackAdapter:true})` non-null (Dawn keeps *only* SwiftShader under that flag; Lavapipe image must give null = negative control); `adapter.info` vendor `google` / architecture `swiftshader` (predicted, record observed); no `llvmpipe`/`mesa` string in artifacts; negative control with nonexistent ICD → adapter null; `step1.mjs` known-answer compute passes; `shader-f16` presence recorded.
- Native-vs-emulated: record `docker info`/`--platform`; emulated x64 is never evidence.

## 4. Known/predicted facts shaping the matrix
- **`shader-f16` expected unavailable**: SwiftShader master has `shaderFloat16`, `shaderInt16`, `storageBuffer16BitAccess`, `uniformAndStorageBuffer16BitAccess` all `VK_FALSE` (*verified*, `VkPhysicalDevice.cpp`); Dawn needs all three. ⇒ group E = capability blocker (`NOT_APPLICABLE.md`, not `INVALID.md`); CTS f16 cases expected `[skip]` (476 of 1159 original cases ⇒ comparable denominator **683**). Confirm with the actual build's `adapter.json`; do not treat as numeric failure.
- Hypotheses to test, not conclusions: SwiftShader `Exp2` input clamp at about −127 and `exp = Exp2(1.4427·x)`, `pow = Exp2(y·Log2 x)`, `tanh` without special cases ⇒ possible CTS failures in exp/exp2/pow underflow inputs (check 5, 6). Polynomial sin/cos/log: accuracy vs CTS bounds unknown.
- SwiftShader limits differ from Lavapipe (heap 2 GiB, max alloc 1 GiB, workgroup invocations 256 …): record `adapter.info` / limits, diff vs Lavapipe `adapter.json`.

## 5. Smoke plan (arm64 Docker, 1 run, not evidence)
preflight (frozen manifest + evaluator hashes + TypeGPU status → `env/preflight.txt`) → evaluator self-test (expect 49/49) → extract ICD, `readelf -d`, `ldd -r`, sha256, ICD JSON → build `webgpu-poc-swiftshader-oracle-ext` → build-time assertions → `vulkaninfo --summary` + loader trace → negative control → adapter probe (extended fields) → `step1.mjs` → group D dump (360 rows) → input-identity check + evaluate. Any miss ⇒ stop, report blocker, do not run the matrix.

## 6. Experiment matrix (after smoke passes)
| Stage | Config | Runs |
|---|---|---|
| Evaluator parity (Linux, container) | arm64 now; **native x86_64 in CI** | self-test + re-evaluate frozen A, B, C(masked counter), D, E, L dumps (byte-identical except documented `wantMismatches` host counter) |
| A, B, C, D, L dumps | swiftshader-arm64 local | 3 each, fresh processes |
| E (f16) | swiftshader-arm64 | probe only unless `shader-f16` present |
| Extended CTS (23 original + PoC grid) | swiftshader-arm64 | 1, per-file timeout, full accounting (passed/warn/skipped/failed/unexecuted) |
| Native x86_64 dumps + CTS | needs a new workflow in the private staging repo | 2 runs/group on different CPUs — **requires separate approval (pushes to the user's GitHub)** |
| Performance | same-host interleaved Lavapipe/SwiftShader, n≥6 pairs, phase-timing script (new file), relative metrics only | local arm64 (+CI if approved) |

Comparison from raw artifacts: per-lane bit classes (equal / NaN-sign-only / ±0 / value diff by operand class + ULP), category change, rejected lanes ⇒ manual triage, CPU column cross-check vs Lavapipe, all-zero-output sanity check. Decision criteria (fixed now): perf "equal" if median S/L ratio ∈ [0.8, 1.25] with consistent sign; a SwiftShader CTS failure is reported as "outside CTS interval for input X", never as a backend defect without a second oracle.

## 7. Costs and potentially destructive commands
- Download: route 1 = two `.deb` (31.3 MB + 36.3 MB) from snapshot.debian.org (needs explicit approval; I record sha256 on first fetch). Docker builds: ~1 GB images each, apt/Node/npm inside containers; no host package changes.
- Never run: `npm run conformance`, `scripts/run.mjs` (rmSync `reports/`), plain `npm test`, `build-baseline.mjs` (overwrites frozen `coverage-matrix.json`), browser benchmark. No workflow runs or pushes without approval.

## 8. Artifact layout (new tree, `investigations/backend-diff/swiftshader/`)
`env/ smoke/ raw/group{A..E,L}/swiftshader-<arch>-run<N>/ eval/ cts/ repeat/ perf/ compare/ report/ tools/ manifest.sha256`. Each run dir: dump, `eval.json` + `eval.meta.json` (evaluator hashes, CTS commit, host, dump sha) , `env.txt` (+ ICD sha256, image id/digest), `adapter.json`, `backend-assert.txt`, `loader-trace.txt`, `commands.log` (cmd, times, exit), `INVALID.md`/`NOT_APPLICABLE.md` where applicable. Own manifest (state working directory), own builder `build-swiftshader.mjs`; never reuse `lavapipe`/`metal`/`x64` prefixes. At the end: re-verify the frozen tree (6 checks, check 9 list) into `report/frozen-tree-check.txt`.

## 9. Risks and stop conditions
Stop and report if: ICD cannot be obtained or its `.so` needs libs/glibc not in 24.04; adapter not SwiftShader or fallback to Lavapipe/hardware possible; `requestDevice` with max limits fails (infrastructure, not numeric); smoke compute wrong; evaluator parity on Linux fails beyond the documented counter; frozen tree verification fails. Unpinned by design: Chromium-vendored SwiftShader revision (route 1), base image digest (will record), runner image.

## 10. Decision questions Phase 2 should inform (check 10, no invented requirements)
Does a software backend add coverage over TypeGPU's mocked unit tests; is SwiftShader deterministic enough (same-host repeats; arm64 vs x64); SwiftShader vs Lavapipe on the same tested set (cannot declare an overall winner); setup/maintenance cost (CI timings only if CI is run, otherwise labelled local estimate); is a CI proof of concept justified (criteria fixed before running: ≥1 defect class mocks miss, acceptable determinism, tolerable cost). Not answerable by Phase 2: priority/cost-benefit, real-GPU parity, long-term flake rate, CI Chromium/Dawn version match, internal plans.
