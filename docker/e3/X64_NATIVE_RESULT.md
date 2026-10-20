# Native x86_64 result (2026-10-16)

Where: GitHub-hosted `ubuntu-24.04` runner (private temporary repository, manual workflow `lavapipe-x64-check`). Host facts in `reports/lavapipe-x64-native-*/host.txt`:
x86_64, Ubuntu 24.04.5, kernel 6.17.0-1022-azure, AMD EPYC 7763 (Azure VM, hypervisor Microsoft = a normal VM, not emulation), Docker 28.0.4.
Container (same images as before): Node 24.21.0, Mesa 25.2.8 / LLVM 20.1.2, adapter `llvmpipe-llvm-20-1-2-256-bits-`, isFallbackAdapter true.

| Stage | Run | Result |
|---|---|---|
| 1 smoke `step1.mjs` | run 38918107889 | PASS (readback i*2, 0 compilation messages) |
| 2 `step2`+`step3` | same run | 12 passed, 0 failed, 0 skipped |
| 3 full conformance | runs 38918349282, 38918364051 | 426 tests: 394 pass, 15 fail, 17 skip; 155 070 rows: 125 140 pass, 320 fail, 117 confirmed defect, 2 723 known divergence, 26 770 unverified |

Results: `reports/lavapipe-x64-native-stage12/`, `-full-run1/`, `-full-run2/` (artifacts as downloaded).
Comparison: x64 run1 == x64 run2 == aarch64 Lavapipe (`report.json` identical except `meta` and the adapter observation: 256-bit vs 128-bit llvmpipe); same 15 failing tests. Metal differs exactly as in `investigations/backend-diff/REPORT.md`.
