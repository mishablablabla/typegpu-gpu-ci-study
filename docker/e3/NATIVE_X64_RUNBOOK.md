# Native x86_64 validation — runbook (not yet executed: no native x86_64 Linux host was available on 2026-10-16)

This Mac is Apple Silicon. Docker Desktop's `linux/amd64` containers run under Apple's Rosetta translation (`/proc/cpuinfo`: `model name: VirtualApple @ 2.50GHz`);
that is emulation and does **not** count as native x86_64 validation.

Needs: any real x86_64 Linux machine or runner with Docker and network access (e.g. GitHub-hosted `ubuntu-24.04`, a colleague's Linux box, a cloud VM).
Copy the PoC without `node_modules/` and `reports/`, then from its root:

    uname -m                                  # must print x86_64
    grep -m1 'model name' /proc/cpuinfo       # must be a real CPU, not VirtualApple / QEMU
    docker build -t tgci-e1 docker/e1 && docker run --rm tgci-e1 node step1.mjs
    docker build -f docker/e2/Dockerfile -t tgci-e2 . && docker run --rm tgci-e2 npx vitest run step2.test.ts step3.test.ts --reporter=verbose
    docker build -f docker/e3/Dockerfile -t tgci-e3 . && OUT=reports/lavapipe-x64-native ./docker-e3/run.sh   # only if the first two pass

Record per run: `uname -m`, OS, Node, Mesa/LLVM version, `adapter.info` (all printed by the commands above / `reports/*/env.txt`), pass/fail/skip counts.
Compare with `reports/lavapipe-full-conformance/` (aarch64) and `reports/` (Metal): `report.json` equal except `meta` (platform, generatedAt) means identical results.
