# E1-lite result — step1.mjs (dawn.node, raw WGSL compute + readback) on Ubuntu 24.04 + Lavapipe

Date 2026-10-16. Host: macOS arm64 (Docker Desktop 29.8.2, aarch64). Container: Ubuntu 24.04.5, **aarch64** (not x64).
Node 24.21.0 (official tarball), webgpu 0.6.2 (same as lockfile), Mesa 25.2.8 (Ubuntu `mesa-vulkan-drivers`), LLVM 20.1.2.

Result: **PASS** (6/6 runs). Adapter: vendor `mesa`, architecture `software`, device `llvmpipe-llvm-20-1-2-128-bits-`,
`isFallbackAdapter: true`; `vulkaninfo`: `DRIVER_ID_MESA_LLVMPIPE`, `PHYSICAL_DEVICE_TYPE_CPU`. 0 compilation messages; readback `[0,2,4,6,8,10,12,14,…]` = i*2.
Controls: lvp ICD forced → PASS; ICD path nonexistent → `requestAdapter returned null`; lvp_icd.json removed → "Failed to detect any valid GPUs" (so the adapter really comes from Vulkan/lvp).
`step1.mjs` is an unmodified copy (same sha256 as ../step1.mjs). Two harmless Dawn warnings about maxDynamic*BuffersPerPipelineLayout.

Reproduce (from this directory):

    docker build -t tgci-e1 .
    docker run --rm tgci-e1 node step1.mjs

Not shown: x64 (GitHub runner), TypeGPU on Linux, the conformance suite.
