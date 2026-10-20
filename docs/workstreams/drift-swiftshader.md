> Paths in this document refer to the original working tree. See [docs/INDEX.md](../INDEX.md) for the mapping to this repository.

# WS-DRIFT-SS report
Baseline = Phase-2 M155 (Debian chromium-common 155.0.8059.79-1~deb13u1 arm64). arm64 only.
Builds: Electron M100/M108/M120; Debian snapshot chromium-common M128/129/130 (need libc++1-18), M138, M146, M150, M154 (M139-M145 probe only); Chrome for Testing 155.0.8059.84, 157.0.8103.6 beta, 158.0.8110.0 canary; source builds of Dawn pin 1e80438d and Chromium-M155 rev 5b0479bd (LLVM backend, 13-15 min each). Subzero cannot be built for arm64. Debian chromium <=M126 ships no SwiftShader. 19 distinct SwiftShader revisions. Method: Phase-2 images reused, only the ICD replaced; build-time and per-run identity asserts; control run (Phase-2 ICD in this pipeline) = zero drift.
VERIFIED
1. All 13 vendored + 2 source builds initialise. shader-f16 never offered by any build.
2. Dumps A,B,C,D,L (195 210 lanes): M108..M158 vendored builds BIT-IDENTICAL to M155. M100 differs 420 lanes (0.215%: C sin 1-7 ULP, L log/log2/pow); M100 also Vulkan 1.2, 17 features (no subgroups).
3. Categories: 0 changes everywhere; rejected=0. Full suite 371/22/33 on all; inv 0 outcome changes; 13/13 examples; CTS 686/476/0, 0 case changes on 15 configs.
4. Example `probability` differs for M100 and M108-M141, equal for M142+: builtin probe (33 builtins x 8011 inputs) shows x*c+d FMA-fused in M108-M141, unfused M142+ (689/8011 inputs, 1 ULP); M100->M108 rewrote sin/cos/tan/log/log2/pow/normalize/dot.
5. Source builds (both revisions identical to each other) differ from ALL vendored builds: 4 740 lanes (2.43%; exp/exp2/tanh/log/log2/pow/sinh/cosh), pow(0,y>=1)=8.97e-44; 0 category/CTS/suite changes. Dawn pin is NOT interchangeable with Chromium-vendored .so; cause = build recipe, not revision.
6. ICD imports host libm (sinf cosf expf exp2f logf log2f powf ... fmaf); glibc held at 2.39.
7. Same-branch patch releases give byte-identical .so.
8. vitest worker crash in step2.test.ts in 2 of 27 full runs (M128, M150 run1), not reproducible in 6 repeats; hypothesis: dawn.node GC hazard (test keeps no create() reference).
Maintainer expectations: pass/fail, CTS, categories unchanged over 13 steps; only bit-exact float values move (2 of 13 steps). Pinning not needed for pass/fail within M108-M158; needed for exact-value assertions and fixed build origin. Cheap drift alarm: hash groups A-L GPU bits + fn-probe (~20 s).
C7 facts: deb 13-36 MB, CfT zip ~190 MB, Electron zip 85-98 MB, .so 16-26 MB; old Debian-security debs 404 on mirrors but 200 on snapshot.debian.org; CfT keeps 113 arm64 builds (M153+); Electron assets back to 2022.
Hypotheses: H1 M100->M108 Reactor math rewrite; H2 FMA flip M141->M142 (window of 19 commits; LLVM18 reland not shown to be the cause); H3 vendor-vs-source gap = build recipe; H4 crashes = GC hazard.
Unresolved: FMA/recipe mechanism; libm sensitivity; x86_64/Subzero drift; intermediate steps; crash rate.
Failed/interrupted attempts kept (see workstream list): m128-130 smoke1, 12 *-interrupted-never-started, m100/m110/m120 attempt1, m124/m126, subzero build, src-fma-*.
Cleanup note: 102 images webgpu-poc-p3-driftss-* exist; remove with docker images | grep '^webgpu-poc-p3-driftss-' | xargs docker rmi.
