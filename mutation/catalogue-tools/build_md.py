#!/usr/bin/env python3
import json, os
C = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(C, 'catalogue.json')))
named = lambda e: [x for x in e['expected_reachable_by'] if not x.startswith('docs:*')]
nondoc = lambda e: [x for x in e['expected_reachable_by'] if x.split(':')[0] in ('ex13', 'inv', 'ported', 'full')]

def short(e):
    r = e['expected_reachable_by']
    if not r:
        return '-'
    parts = [x for x in r][:3]
    s = ', '.join(parts)
    return s + (' ...' if len(r) > 3 else '')

L = []
L.append('# WS-MUT-CAT: catalogue of seeded TypeGPU bugs (mutants)\n')
L.append('Purpose: measure the *detection power* of software-GPU backends (Lavapipe vs SwiftShader) in CI: which TypeGPU regressions does a GPU run catch that '
         'TypeGPU\'s mocked unit tests do not. Input for WS-MUT-RUN (GPU suites) and WS-MOCK (mocked unit tests).\n')
L.append('- Base: `mutation/typegpu-tree.tar.xz` (pinned TypeGPU subset, 0.12.7, HEAD e893ad11). Apply with `cd <copy of snapshot> && patch -p1 < patches/Mxx.patch`.')
L.append('- Machine-readable data: `catalogue.json` (fields documented below). Every patch touches only `packages/*/src/**`.')
n = len(d)
L.append(f'- **{n} mutants**: {sum(e["kind"]=="historic" for e in d)} historic (re-introduced real fixes) + {sum(e["kind"]=="synthetic" for e in d)} synthetic; '
         f'tier 1 = {sum(e["tier"]==1 for e in d)} (run these first), tier 2 = {sum(e["tier"]==2 for e in d)} (lower information value / likely-equivalent / near-unreachable).')
L.append(f'- Reach estimate (grep/reading only, nothing run): {sum(1 for e in d if named(e))}/{n} mutants have at least one *named* suite or docs example that executes the changed path; '
         f'{sum(1 for e in d if nondoc(e))}/{n} are reachable by a non-docs suite (13 example tests, 6 investigation suites, ported/, full suite); '
         f'{sum(1 for e in d if not named(e))}/{n} have no named reach (host-only / equivalent / not exercised) and are the deliberate "limits" cases.')
L.append(f'- Behaviour verification: {sum(1 for e in d if e["behavior_verification"].startswith("executed"))} mutants were additionally checked by executing the affected pure-CPU code (unmutated vs mutated, `evidence/probe-diffs.json`); '
         'the rest are verified only by static reading (they change generated WGSL text or need a shader run).\n')

L.append('## Table\n')
L.append('| ID | T | kind | title | symptom | origin | expected reachable by | mock | sev | equiv | verified |')
L.append('|---|---|---|---|---|---|---|---|---|---|---|')
for e in d:
    org = e['source_commit'][:8] if e['source_commit'] else 'synthetic'
    ver = 'exec' if e['behavior_verification'].startswith('executed') else 'static'
    L.append(f"| {e['id']} | {e['tier']} | {e['kind'][:4]} | {e['title']} | {e['symptom_class']} | {org} | {short(e)} | {e['mock_catchable_guess']} | {e['severity_guess']} | {e['equivalence_risk']} | {ver} |")

L.append('\n## Fields of catalogue.json\n')
L.append('`id`, `title`, `kind` (historic|synthetic), `source_commit` (full hash, historic only) + `source_subject`, `files[]`, `description`, '
         '`symptom_class` (gpu-value | bytes-layout | wgsl-text | host-logic | validation), `expected_reachable_by[]` (suite vocabulary below), '
         '`mock_catchable_guess` (likely|unlikely|unknown), `severity_guess`, `notes`, plus extras: `tier`, `behavior_change_confidence`, '
         '`equivalence_risk` (chance the mutant is output-equivalent on the tested inputs), `reach_class` (gpu-suite|docs-only|host-only|none), `backend_note`, '
         '`adapted_from_fix` (how the historic fix was reversed), `behavior_verification`, `patch`.\n')
L.append('Suite vocabulary: `ex13:<test>` = TypeGPU docs-example tests in swiftshader/typegpu-examples; `inv:<name>` = bitops, comptime, integer-mul, mul-paths, scalar-int, vector-fns; '
         '`ported:<file>` = ported/*.gpu.test.ts (std functions via harness.ts, runtime buffers); `full:<name>` = lib/diff suites of the full run; '
         '`docs:<dir>` = one docs example (apps/typegpu-docs/src/examples/<dir>); `docs:*...` = a class of docs examples that could not be pinned to a directory.\n')

L.append('## Method\n')
L.append('1. **Historic (18)**: `git --no-optional-locks log` over packages/typegpu/src, typegpu-noise/sort/sdf/color (all `fix:` commits, plus keyword greps for layout/offset/align/matrix/f16/atomic/bitcast/overflow/clamp/loop/struct/texture/pack), '
         'read the diff of ~45 candidates, kept those whose fix is still present in the snapshot and whose reversal is small and local; each fix was reversed by hand against the HEAD code '
         '(moved code adapted; partial reversals documented in `adapted_from_fix`). Commit hash + subject are recorded.')
L.append('2. **Synthetic (32)**: classic shader-library bug classes placed in code that exists at HEAD: struct/array layout, matrix writer column/row mix-ups, argument-order swaps in std codegen, '
         'copy-paste builtin mapping bugs (countLeadingZeros->ctz, atomicSub->atomicAdd, trunc->floor, ...), comptime/CPU numeric semantics (smoothstep clamp, floored mod, saturating i32), '
         'dispatch/guard off-by-one and ceil/floor, workgroup barriers in the scan, texture texel size, PRNG/noise/colour/SDF constants, default values, swizzle mapping.')
L.append('3. **Verification**: every patch (a) is a `diff -u` with a/ b/ prefixes against the snapshot, (b) `patch -p1 --dry-run` + apply + revert on a fresh `cp -R` of the snapshot (tools/verify.sh), '
         '(c) touches only `packages/*/src/**`, (d) passes a TypeScript syntax check (node `stripTypeScriptTypes`), (e) leaves the tree byte-identical after revert. '
         'Type-checking (tsc) was NOT run (no installs allowed): a few patches leave an unused import/helper behind (M05, M13, M17).')
L.append('4. **Reachability** was estimated by grep/reading: tests/examples that call the changed function with *runtime* arguments (harness.ts feeds buffers, so the GPU path is taken) vs *comptime* arguments (folded by the CPU `normalImpl` into a literal), '
         'docs-example tests in swiftshader/typegpu-examples, the investigation suites\' spec tables (specs.ts, ops.ts, const-bodies.ts), and which docs examples use the changed API. '
         'Mock-catchability was estimated by grepping TypeGPU\'s own tests (packages/typegpu/tests, packages/typegpu-sdf/tests, apps/typegpu-docs/tests/individual-example-tests) for the changed construct '
         '(WGSL snapshots, test files of the std function, the fix\'s regression test).\n')

L.append('## Honesty: what is verified and what is a guess\n')
L.append('- **Verified (mechanical)**: all patches apply cleanly, touch only src files, are syntactically valid, are reversible. Source commits (hash, subject) exist in the local TypeGPU git history.')
L.append(f'- **Verified (executed, CPU only)**: {sum(1 for e in d if e["behavior_verification"].startswith("executed"))} mutants change observable behaviour of pure-CPU code (see `evidence/probe-diffs.json`: before/after values for e.g. f16 tie rounding, mat3x3f byte layout, struct sizes, mod/i32/smoothstep semantics, implicit-conversion unification).')
L.append('- **Static only**: all WGSL-text mutants (codegen argument swaps, loop bounds, barriers, guards, rotation matrix text) and all runtime-GPU effects. The claim "changes GPU values" there rests on reading the generated-code path; a shader run (WS-MUT-RUN) is the real test.')
L.append('- **Guesses**: `expected_reachable_by` (grep-based; a suite may still not hit the exact value that exposes the bug), `mock_catchable_guess` (grep-based; WS-MOCK will measure it), `severity_guess`, `equivalence_risk`.')
L.append('- **Known weak mutants** (kept on purpose or tier 2): M05, M06, M08, M15, M16 (GPU-blind by construction, host/text only); M02, M42 (output-equivalent on the tested inputs); '
         'M07 (probably typing-only, output-equivalent); M03, M04, M21 (no suite or example reaches them); M11, M12, M13, M17, M44 (needs specific name/location configurations; docs reach not pinned down); '
         'M12 is an *adapted* regression (HEAD reserves `locations` values, so the old falsy check misbehaves differently than in the original pre-fix code).')
L.append('- **Backend-differentiating by design**: M09 and M01 (and M21) matter only where `shader-f16` exists (Lavapipe, Metal) - SwiftShader skips those tests; M34/M35 are races that deterministic emulators expose differently from lock-step hardware.')
L.append('- Mutants are applied to `packages/*/src`; whether a GPU suite imports TypeGPU from src or from a built `dist` is the runner\'s concern (the suites in this repository import the npm build 0.12.7).')
open(os.path.join(C, 'CATALOGUE.md'), 'w').write('\n'.join(L) + '\n')
print('CATALOGUE.md written')
