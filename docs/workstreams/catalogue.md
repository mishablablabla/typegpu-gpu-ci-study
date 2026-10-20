> Paths in this document refer to the original working tree. See [docs/INDEX.md](../INDEX.md) for the mapping to this repository.

# WS-MUT-CAT report
50 mutants: 18 historic (M01-M18, real fixes reversed) + 32 synthetic (M19-M50); tier-1 37 (run first), tier-2 13. Classes: gpu-value 27, validation 6, bytes-layout 5, wgsl-text 5, host-logic 7.
Verification: every patch `patch -p1 --dry-run`, apply+revert byte-identical on a fresh copy of _shared/typegpu-HEAD, only packages/*/src touched, TS syntax ok; tsc NOT run. 16 mutants additionally confirmed by executing pure-CPU code (evidence/probe-diffs.json).
Reach (grep/reading only): 37/50 reach by a named suite/example; 27/50 by a non-docs suite; 13 deliberately no-named-reach (M01 M03 M04 M05 M08 M11 M12 M13 M15 M16 M21 M42 M44). Mock-catchable guess: likely 35, unlikely 13, unknown 2. GPU-only candidates: M25 M26 M27 M34 M35 M46-M50.
Backend-differentiating by design: M09, M01, M21 (f16, visible only where shader-f16 exists); M34/M35 barrier races.
Weak/dubious: M05 M06 M08 M15 M16 GPU-blind by construction; M02 M42 output-equivalent on tested inputs; M07 probably typing-only; M03 M04 M21 unexercised; M12 adapted regression; M13/M17 collision not in any suite; M06 passes via lenient regexp, only stats change.
Runner caution: poc suites import typegpu 0.12.7 from node_modules (npm build); patches matter only if suites run against patched source/build.
Unresolved: no tsc check; docs reach not pinned for M11 M12 M13 M17 M44; equivalence/mock guesses had no second reader.
