> Paths in this document refer to the original working tree. See [docs/INDEX.md](../INDEX.md) for the mapping to this repository.

# WS-DRIFT-LVP report
Setup: arm64 containers (2 CPU/2 GB), 11 usable Mesa configs + 2 unusable; all workloads (dumps A-D/L/E = 198 759 lanes, full 426, inv 1433, examples 13+mnist-nof16, CTS 1162); baseline run byte-identical to Phase-2 pinned dumps.
Unusable: Mesa 22.0.1 and 22.3.6 install and show llvmpipe but dawn.node adapter=null (needs shaderUniform*ArrayDynamicIndexing). Oldest usable 23.2.1.
Drift vs 25.2.8 (lanes changed / category changes / full pass-fail-skip / inv failing / examples differing / CTS):
- 23.2.1, 24.0.5, 25.0.7: 0 / 0 / 394-15-17 / 14 / `probability` (normalize <=2 ULP, 678 values) / 1162 pass
- 26.0.8: 0 / 0 / 394-15-17 / 14 / none / 1162 pass
- 26.1.6: 5980 (3.0%) / 0 / 402-7-17 / 12 / none / 1162 pass
- 26.2.4, 26.2.5 (identical): 5980 / 0 / 402-7-17 / 4 / mnist-nof16 <=1.9e-6 / 1162 pass
All flips fail->pass; CTS 0 flips. Non-zero steps: 25.0.7->25.2.8, 26.0.8->26.1.6, 26.1.6->26.2.4. Repeat noise zero; arm64 vs x86_64 on 25.2.8 = NaN payload only (0 value changes).
Verified: 26.1 step = subnormal operand flush (add/div/log/inverseSqrt/min/max/mod/sqrt/sin), same on LLVM 19/21/22 and across distros (Mesa, not LLVM); +8 full flips = log/log2 tests expecting -inf; 26.2 fixes asin/acos accuracy; 25.0->25.2 probability drift is normalize (330/4096 inputs <=2 ULP), pow bit-identical everywhere; LLVM version alone changes nothing.
Packaging: kisak Mesa 26.2.5 arm64 ships powervr ICD that breaks enumeration in a container without /dev/dri (worked around by deleting that manifest); Ubuntu 26.2.4 package did not.
Maintainer guidance: pinning necessary for exact-value tests; sufficient for run-to-run on one arch, not for arm64-vs-x86 bit equality (NaN payload); CTS-interval checks are drift-immune in this data.
Hypotheses: 26.1 flush = deliberate float-controls change; normalize change = rsqrt vs divide lowering; asin/acos new lowering in 26.2; VK_DRIVER_FILES to lvp would avoid powervr issue.
Unresolved: arm64 only (x86_64 drift unmeasured -> staging CI could run Dockerfile.driftlvp); 1 run per version; 25.1.x and 26.1.0-26.1.5 untested; texture/render/atomics paths not covered; plucky normalize probe cancelled (NOTE).
