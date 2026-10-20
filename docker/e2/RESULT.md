# E2 result — step2.test.ts + step3.test.ts on Ubuntu 24.04 + Lavapipe (2026-10-16)

Setup: `docker/e2/Dockerfile` (+ `Dockerfile.dockerignore`), built from the PoC root; project `package.json` + `package-lock.json` via `npm ci`
(typegpu 0.12.7, unplugin-typegpu 0.12.5, vitest 4.1.11, webgpu 0.6.2 — identical to host). Node 24.21.0, Mesa 25.2.8 / LLVM 20.1.2. Nothing written to `reports/`.

| run | adapter | result |
|---|---|---|
| host (Metal, arm64) | apple metal-3 apple-m3-pro, fallback=false | 12 passed, 0 failed, 0 skipped |
| container aarch64 (native on this Mac) | mesa software llvmpipe-llvm-20-1-2-**128**-bits-, fallback=true | 12 passed (4 runs) |
| container linux/amd64 (QEMU emulation, not native x64) | mesa software llvmpipe-llvm-20-1-2-**256**-bits-, fallback=true | 12 passed (1 run; slower: tests 600-700 ms vs 10-30 ms) |
| control: lvp_icd.json removed | — | 2 files failed, 12 skipped: `requestAdapter returned null` / "Failed to detect any valid GPUs" |

step3 E4 `maxUlp` table (informational, not asserted by value) differs by backend: Metal sin 2, cos 2, exp 8, log 2, sqrt 1, tanh 320, mul 0;
Lavapipe (arm64 and emulated x64 identical) sin 1, cos 1, exp 10, log 30, sqrt 0, tanh 345, mul 0.

Reproduce:

    docker build -f docker/e2/Dockerfile -t tgci-e2 .
    docker run --rm tgci-e2 npx vitest run step2.test.ts step3.test.ts --reporter=verbose
    # emulated x64:
    docker build --platform linux/amd64 -f docker/e2/Dockerfile -t tgci-e2-amd64 .
    docker run --rm --platform linux/amd64 tgci-e2-amd64 npx vitest run step2.test.ts step3.test.ts --reporter=verbose
