#!/usr/bin/env python3
"""Generates catalogue.json (+ CATALOGUE.md table) from the data below.
usage: build_catalogue.py [--only M01,M02,...] [--out FILE.json]   (default: all entries, ../catalogue.json)
Entries are append-only: IDs are never renumbered.
Suite vocabulary (expected_reachable_by):
  ex13:<name>   TypeGPU docs-example tests in swiftshader/typegpu-examples (increment, tgsl-parsing-test, dispatch,
                matrix-multiplication, matrix-next, prng-cpu-gpu, probability, bitonic-sort, concurrent-chart,
                prefix-scan, mnist-inference, log-test, jump-flood-voronoi)
  inv:<name>    investigations suites (bitops, comptime, integer-mul, mul-paths, scalar-int, vector-fns)
  ported:<name> ported/*.gpu.test.ts + ported/auto/*.gpu.test.ts (std functions on a real GPU via harness.ts)
  full:<name>   lib/ + diff/ part of the 'full suite' (diff-f16, diff-float, diff-int)
  docs:<dir>    one of the ~97 docs examples (apps/typegpu-docs/src/examples/<dir>), run headless by WS-EX
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CAT = os.path.dirname(HERE)
P = 'packages/typegpu/src/'

H = 'historic'
S = 'synthetic'

E = []
EXECUTED = {'M01', 'M06', 'M08', 'M10', 'M12', 'M14', 'M19', 'M20', 'M21', 'M22', 'M23', 'M28', 'M29', 'M30', 'M37', 'M44'}


def add(id, title, kind, files, description, symptom, reach, mock, severity, notes,
        commit=None, subject=None, tier=1, behavior='high', equiv='none', reach_class='gpu-suite',
        backend_note=None, adapted=None):
    E.append(dict(
        id=id, title=title, kind=kind, source_commit=commit, source_subject=subject, files=files,
        description=description, symptom_class=symptom, expected_reachable_by=reach,
        mock_catchable_guess=mock, severity_guess=severity, notes=notes, tier=tier,
        behavior_change_confidence=behavior, equivalence_risk=equiv, reach_class=reach_class,
        backend_note=backend_note, adapted_from_fix=adapted))


add('M01', 'f32->f16 bit conversion rounds half-up and double-rounds subnormals', H,
    [P + 'data/numeric.ts'],
    'toHalfBits() reverted to its pre-fix form: normalised numbers use "mant + 0x1000" (round half up) instead of '
    'round-to-nearest-even; subnormals shift first and round afterwards. Wrong 1-ulp f16 results for tie / subnormal inputs '
    'in f16() casts folded at comptime, std.bitcast to f16, pack2x16float on the CPU and the no-eval writer fallback.',
    'gpu-value',
    [],
    'likely', 'low',
    'Reached only via CPU-side conversions (the compiled writer uses DataView.setFloat16, so ordinary f16 buffer writes are NOT affected). '
    'No GPU suite found that folds an f16 literal on a tie value -> expected unreachable by suites.',
    commit='36bc2e9819af9c22db438b91f19e1a58aa6e2056', subject='fix: Manual float16 conversions to extend platform support (#2773)',
    tier=1, behavior='high', equiv='none', reach_class='host-only',
    backend_note='f16 only: SwiftShader has no shader-f16; Lavapipe/Metal do', adapted='full reversal of the toHalfBits hunks')

add('M02', 'Perlin dynamic cache never clears its dirty flag', H,
    ['packages/typegpu-noise/src/perlin-2d/dynamic-cache.ts', 'packages/typegpu-noise/src/perlin-3d/dynamic-cache.ts'],
    'Removed "dirty = false" after re-creating the memory buffer in bindings getter: once the size was changed every later read of '
    '.bindings destroys and regenerates the gradient buffer (a compute dispatch) again.',
    'host-logic', ['docs:rendering/perlin-noise'],
    'unlikely', 'low',
    'Output values stay identical (same gradients regenerated) -> detection needs resource-churn / perf / validation (use of a destroyed buffer). '
    'Deliberately a near-equivalent, host-only mutant.',
    commit='a9437917b5d9a2ab68f8545916565b03362a40fe', subject='fix: Reset dirty flag in Perlin noise dynamic caches (#3159)',
    tier=1, behavior='high', equiv='high', reach_class='host-only', adapted='exact')

add('M03', 'tgpu.unroll over a range ending at 0 is dropped', H,
    [P + 'tgsl/wgslGenerator.ts'],
    'Unroll codegen again returns an empty block when range.end === 0 (checked before the elements are computed), so '
    'tgpu.unroll(std.range(-2, 0)) or std.range(3, 0, -1) silently unrolls zero iterations.',
    'wgsl-text', [],
    'likely', 'high',
    'Unrolled std.range(a, 0) is absent from all suites and from the docs examples (checked by grep): unreachable, host/codegen only. '
    'Mocked tests cover it (wgslGenerator range(3,0,-1)).',
    commit='7958b03ccf9f50537e75f27c09692b778fffaf10', subject='fix: tgpu.unroll removing ranges ending at zero (#3040)',
    tier=2, behavior='high', equiv='none', reach_class='none', adapted='exact (code moved: knownEnd instead of range.end.value)')

add('M04', 'withIndexBuffer ignores the element-count size argument', H,
    [P + 'core/pipeline/renderPipeline.ts'],
    'For the TgpuBuffer overload sizeBytes is computed from the 4th (GPUBuffer-only) parameter instead of the 3rd, so '
    'withIndexBuffer(buf, offsetElements, sizeElements) drops sizeElements and binds the whole tail of the buffer.',
    'host-logic', [],
    'likely', 'medium',
    'Only observable when an offset/size is passed; no docs example does. Renders more indices than requested.',
    commit='fc85681e005dfbbf0c13442fea48ff52c381b60f', subject='fix: Index buffer size',
    tier=2, behavior='high', equiv='none', reach_class='none', adapted='exact')

add('M05', 'isCloseTo for vectors emits "(lhs - lhs) + precision" (lhs evaluated twice)', H,
    [P + 'std/boolean.ts'],
    'Reverted the WGSL emitted for std.isCloseTo(vecA, vecB, p) to "all(abs(a - b) <= (a - a) + p)". Numerically identical for finite a, '
    'but duplicates (and re-evaluates) the lhs expression and yields NaN for infinite lhs.',
    'wgsl-text', [],
    'likely', 'low',
    'Pure generated-text difference with equal GPU values for all finite inputs: the canonical "mocks see it, GPUs cannot" case. '
    'tgsl-parsing-test calls isCloseTo with constant vectors; whether it hits codegen or the CPU impl depends on const folding.',
    commit='2854faaa45f31cd2a215aebdcf8097e32685af79', subject='fix: `isCloseTo` lhs duplictation (#3090)',
    tier=1, behavior='high', equiv='high', reach_class='host-only', adapted='exact (unused coerceToSnippet import left in place)')

add('M06', 'CPU std.saturate throws for float vectors', H,
    [P + 'std/numeric.ts'],
    'cpuSaturate() reverted: vectors throw MissingCpuImplError. During shader comptime folding that error is swallowed and the codegen '
    'path is used, so only JS-side calls std.saturate(vec3f(...)) are affected.',
    'host-logic', ['inv:vector-fns (only as a recorded CPU-throw row; its regexp accepts "not implemented yet")'],
    'likely', 'low',
    'GPU values unaffected (dualImpl falls back to codegen on MissingCpuImplError). vector-fns runtime-matrix evaluates saturate on vec2f..vec4f on the CPU, '
    'but accepts "not implemented yet" throws, so the test still passes - only the recorded statistics change. Included as a GPU-blind mutant.',
    commit='22205fff820ec2b931181a96a5b85c7d2ddfa036', subject='fix: CPU implementation of saturate for float vectors (#3183)',
    tier=1, behavior='high', equiv='high', reach_class='host-only', adapted='exact')

add('M07', 'Integer-valued literals >= 2^63 typed as abstractInt (FLT_MAX in oklab)', H,
    [P + 'tgsl/generationHelpers.ts'],
    'Removed the "value >= 2**63 -> abstractFloat" guard in numericLiteralToSnippet: huge integer-valued JS numbers such as '
    '3.40282346e38 (FLT_MAX in @typegpu/color oklab gamut mapping) are typed abstractInt instead of abstractFloat.',
    'wgsl-text', ['docs:simple/oklab'],
    'unknown', 'low',
    'Static analysis: emitted literal text is the same ("3.40282346e+38"); only the TypeGPU type differs, so it can change conversions/overloads '
    'in integer contexts but probably not the oklab output. Treat as likely-equivalent; could not be run (read-only, no installs).',
    commit='653d78e1f5bcf79c5988e02a31d03fdef8349156', subject='fix: Big int handling (#1758)',
    tier=2, behavior='low', equiv='high', reach_class='docs-only', adapted='only the generationHelpers hunk (oklab FLT_MAX hunk already merged in HEAD form)')

add('M08', 'Compiled writer leaves mat3x3f column padding unwritten', H,
    [P + 'data/compiledIO.ts'],
    'buildWriter() for matrices reverted to write only matSize*matSize floats (skipping the padding float of each mat3x3f column) instead of '
    'zeroing the padding. Stale bytes survive in the padding of a re-used host buffer.',
    'bytes-layout', ['(none: padding is never read by shaders)'],
    'likely', 'low',
    'Bytes differ only in padding; shaders cannot observe them -> invisible to every GPU suite; visible to byte-level mocked tests '
    '(arrayBufferIO "overrides all values when handling mat3x3f").',
    commit='8e86934bc39d76c1ed068ba9ced5ff2a4f2a6170', subject='fix: Matrix writers (#3178)',
    tier=1, behavior='high', equiv='high', reach_class='host-only', adapted='compiledIO.ts hunk only (dataIO.ts no-eval fallback hunk not reverted)')

add('M09', 'Buffer allocations/transfers no longer padded to a multiple of 4 bytes', H,
    [P + 'core/buffer/buffer.ts'],
    'physicalSizeOf() returns sizeOf(schema) again, so buffers whose logical size is not a multiple of 4 (d.f16, d.vec3h, arrayOf(d.u16, odd)) '
    'are created with an invalid size for mappedAtCreation / copyBufferToBuffer / writeBuffer.',
    'validation', ['ported:mix', 'ported:distance', 'ported:exp2', 'ported:trig-misc', 'ported:auto/mod', 'ported:auto/div', 'ported:auto/mul', 'full:diff-f16', 'inv:bitops (api-matrix vec3h)'],
    'likely', 'high',
    'Every f16 createMutable (size 2 or 6) fails WebGPU validation on f16-capable backends (Lavapipe, Metal); on SwiftShader (no f16) those tests are skipped, '
    'so this is a backend-differentiating mutant. Also hits odd-length u16 arrays (docs examples with u16 index buffers of odd length).',
    commit='346299f4b81ae9f6b668e294936fdaebacda4ace', subject='fix: Pad buffer allocations and transfers to a multiple of 4 bytes (#3155)',
    tier=1, behavior='high', equiv='none', reach_class='gpu-suite',
    backend_note='caught only where shader-f16 exists (Lavapipe yes, SwiftShader no)', adapted='reverts only the physicalSizeOf() rounding (the aligned-write checks stay)')

add('M10', 'Non-finite comptime values are no longer rejected (Finite Math Assumption)', H,
    [P + 'tgsl/wgslGenerator.ts', P + 'data/numeric.ts'],
    'Removed the isFinite guards from the u32/i32/f32/f16 casts and from numericLiteral(): comptime-folded Infinity/NaN (e.g. 1/0) '
    'is emitted into WGSL as "Infinityf"/"NaNf" and fails shader compilation instead of raising TypeGPU\'s explicit error.',
    'validation', ['inv:comptime', 'inv:scalar-int', 'inv:vector-fns (const-fold)'],
    'likely', 'medium',
    'Behaviour differs only when a suite const-folds a non-finite value; error text changes from a TypeGPU error to a Dawn/WGSL compile error. '
    'Detected only if the suite records error messages/outcome classes.',
    commit='e578a20b7f785ed27eef1f330ec07493dbc57170', subject='fix: Handle `NaN` and `Infinity` (#2572)',
    tier=1, behavior='medium', equiv='low', reach_class='gpu-suite', adapted='generator guard + cast guards (bool cast guard kept)')

add('M11', 'Auto vertex output does not receive fragment-determined varying locations', H,
    [P + 'core/function/autoIO.ts'],
    'AutoVertexFn builds its output AutoStruct with undefined locations instead of the matched-up `locations`, so shell-less vertex outputs '
    'ignore custom @location()s declared on the fragment input.',
    'validation', ['docs:*shell-less vertex+fragment pairs with explicit d.location (not identified)'],
    'likely', 'medium',
    'Only matters when a fragment input declares non-default locations paired with an auto vertex function; otherwise auto-numbering coincides. '
    'Symptom is a render-pipeline link mismatch/validation error or swapped varyings.',
    commit='a667a3ac3c6844f197bad14076f5d56ecacc35c7', subject='fix: Pass locations to auto vertex out (#3174)',
    tier=1, behavior='medium', equiv='medium', reach_class='docs-only', adapted='exact')

add('M12', 'withLocations treats location 0 as "no location"', H,
    [P + 'core/function/ioSchema.ts'],
    'Truthiness check "if (locations[key])" instead of "!== undefined": a varying whose matched-up location is 0 is re-numbered by the free-slot allocator '
    '(which now skips reserved 0), giving it location 1 and colliding/mismatching with the other stage.',
    'validation', ['docs:*shell-less pairs whose fragment pins location 0 (not identified)'],
    'likely', 'medium',
    'ADAPTED: HEAD also reserves Object.values(locations) in usedCustomLocations, so re-introducing the old falsy test now mis-numbers location 0 '
    'instead of being benign as in the original pre-fix code. Rarely exercised.',
    commit='8af3495feffea3a799ffcbdff1f2b91f38135238', subject='fix: `withLocations` (#3175)',
    tier=2, behavior='medium', equiv='medium', reach_class='docs-only', adapted='partial/adapted (one-line truthiness regression)')

add('M13', 'Global identifier resolved inside a nested call can capture a caller-local name', H,
    [P + 'resolutionCtx.ts'],
    'isIdentifierTaken() only checks the current function\'s block scopes again (ignores the call stack for scope="global"), so a global '
    'resolved for the first time inside a nested function can receive the same generated name as a local of the calling function.',
    'wgsl-text', ['docs:*examples with nested helper calls and local/global name collisions (not identified)'],
    'likely', 'high',
    'Wrong-variable capture is possible but needs a collision between a caller local and a not-yet-emitted global name; unlikely in the small suites. '
    'When it triggers the result is a wrong value or a WGSL redeclaration error.',
    commit='b261e7440eadda5fd6c397b2475d6211858075d9', subject='fix: Global identifier inside nested function call (#2789)',
    tier=1, behavior='medium', equiv='medium', reach_class='docs-only', adapted='behaviourally equivalent reversal inside isIdentifierTaken (helper left unused)')

add('M14', 'Implicit conversion i32/u32 <-> abstractFloat picks i32/u32 (truncates the float)', H,
    [P + 'tgsl/conversion.ts'],
    'Removed the rule that casts i32/u32 to f32 when unified with an abstract float and restored the old abstractFloat->i32 (rank 1) / ->u32 (rank 2) '
    'conversions: expressions like i32Var * 0.5 or select(i32Var, 2.5, c) are evaluated in integer arithmetic.',
    'gpu-value', ['inv:mul-paths', 'inv:scalar-int', 'docs: examples mixing integer variables with fractional literals'],
    'likely', 'high',
    'Silent precision loss: the float literal is truncated to an integer. Reached only where a suite mixes a typed integer with a fractional JS literal inside a use-gpu function; '
    'mul-paths/new-findings already records related "v * 1.5 emitted as v * 1i" observations (vector path), so rows may shift there. Low-confidence reach.',
    commit='c96d9d484bd7c2f34c20b38252cb36aa1c5916d0', subject='fix: Choose `f32` when trying to find a type common with `abstractFloat` and `i32` (or `u32`) (#2396)',
    tier=1, behavior='medium', equiv='low', reach_class='gpu-suite', adapted='conversion.ts hunk only (concretized fields stay)')

add('M15', 'hasIndexBuffer is a constant false field', H,
    [P + 'core/pipeline/renderPipeline.ts'],
    'The getter derived from priors.indexBuffer was replaced by a readonly field initialised to false, so pipelines created with withIndexBuffer still report hasIndexBuffer === false.',
    'host-logic', ['(none)'],
    'likely', 'low',
    'Pure introspection flag, not used internally; GPU output unchanged. Expected unreachable.',
    commit='7cb1d1274e230f9a01ce587b3b61f8d490cce429', subject='fix: Properly update `hasIndexBuffer` (#2820)',
    tier=2, behavior='high', equiv='high', reach_class='host-only', adapted='exact')

add('M16', 'Piping a configuration duplicates its bindings', H,
    [P + 'core/root/configurableImpl.ts'],
    'ConfigurableImpl.pipe() concatenates this.bindings with transform(this).bindings (which already include them), so every slot binding appears twice.',
    'host-logic', [],
    'likely', 'low',
    'Later bindings of the same slot override earlier ones with identical values -> outputs equal; observable only through binding counts. Near-equivalent.',
    commit='d75039ea4fb869c67b3360ba7f0a9ab11eabb27b', subject='fix: Keep each binding once when piping a configuration (#3180)',
    tier=2, behavior='high', equiv='high', reach_class='host-only', adapted='exact')

add('M17', 'Generated identifiers may shadow WGSL template enumerants (read, write, uniform, rgba8unorm...)', H,
    [P + 'core/resolve/namespace.ts'],
    'templateEnumerants removed from takenGlobalIdentifiers: a user function/variable called e.g. `read` or `uniform` can be emitted verbatim and shadow the '
    'enumerant used in var<storage, read_write> / texture_storage_2d<rgba8unorm, write> templates.',
    'wgsl-text', ['docs:image-processing/monocular-light-injection (locals named read/write)'],
    'likely', 'medium',
    'Needs a TypeGPU-resolved declaration with an enumerant name; none of the GPU suites define one. Symptom would be a WGSL compile error.',
    commit='efe89a0ef67d0631675db69c3138a96100b51920', subject='fix: Keep generated identifiers off the template-parameter enumerants (#3151)',
    tier=2, behavior='medium', equiv='medium', reach_class='docs-only', adapted='exact')

add('M18', 'Unary minus on u32 no longer rejected by TypeGPU', H,
    [P + 'std/operators.ts'],
    'The u32 check in std.neg\'s signature was removed, so -u32Var is emitted as WGSL "-(x)" on an unsigned value and is rejected only by the WGSL compiler.',
    'validation', ['inv:scalar-int'],
    'likely', 'medium',
    'inv:scalar-int/scalar-contract.test.ts asserts exactly this error ("std.neg(u32) is rejected by TypeGPU at resolve time (#3118)"); host-side tgpu.resolve, no GPU needed. '
    'ported neg tests skip the CPU-only signature checks, so they do not see it.',
    commit='57f360200d1bae854d67b8eea26375fb23a02a8b', subject='fix: Reject unsigned negation (#3118)',
    tier=1, behavior='high', equiv='low', reach_class='gpu-suite', adapted='exact')

add('M19', 'Compiled writer uses unpadded element stride for arrays of vec3', S,
    [P + 'data/compiledIO.ts'],
    'In the compiled writer an array element stride is sizeOf(elementType) instead of roundUp(sizeOf, alignment): arrays of vec3f/vec3i/vec3u/vec3h '
    'written from JS arrays land at 12-byte (6 for vec3h) strides while WGSL reads 16-byte strides.',
    'bytes-layout', ['docs:algorithms/jump-flood-distance', 'docs:algorithms/probability', 'docs:simple/liquid-glass', 'docs:image-processing/blur', 'docs:tests/buffer-write-benchmark'],
    'likely', 'high',
    'Layout corruption only for arrays of vec3 written element-wise (typed-array inputs take the memcpy path). The 13 example tests and investigation suites '
    'only use standalone vec3 values, so likely unreachable by them.',
    tier=1, behavior='high', equiv='none', reach_class='docs-only')

add('M20', 'Struct size loses trailing padding', S,
    [P + 'data/schemaMemoryLayout.ts'],
    'computeMLOfStruct returns the unrounded size (no roundUp to struct alignment): standalone buffers of structs with tail padding are too small '
    '(binding-size validation error) and nested structs shift the following members.',
    'validation', ['ex13:log-test (nested ComplexStruct is logged from the shader)', 'docs: most examples with uniform/storage structs mixing vec/mat and scalars'],
    'likely', 'high',
    'Structs without tail padding (all-u32 structs of bitonic-sort/matrix-next, MatrixStruct of matrix-multiplication: 152 bytes, align 8) are unaffected; '
    'structs such as log-test\'s ComplexStruct (20 bytes, align 16) are. '
    'Loud (validation) on every backend that checks min binding size.',
    tier=1, behavior='high', equiv='low', reach_class='docs-only')

add('M21', 'vec3<f16> alignment 4 instead of 8', S,
    [P + 'data/alignmentOf.ts'],
    'knownAlignmentMap.vec3h = 4: structs/arrays containing vec3h get member offsets/strides that differ from WGSL (align 8).',
    'bytes-layout', [],
    'likely', 'medium',
    'Only matters for vec3h inside structs/arrays; suites use standalone vec3h values (no effect). f16-only.',
    tier=2, behavior='high', equiv='high', reach_class='none', backend_note='f16 only: SwiftShader cannot run it')

add('M22', 'mat3x3f columns written packed (36 bytes) by the compiled writer', S,
    [P + 'data/compiledIO.ts'],
    'wgslElementStride = matSize for matrices: mat3x3f columns are written at 12-byte pitch while WGSL expects 16-byte column pitch.',
    'bytes-layout', ['ported:auto/mul', 'ported:auto/add', 'ported:auto/sub', 'inv:mul-paths', 'ex13:tgsl-parsing-test (comptime only)'],
    'likely', 'high',
    'Any GPU test that uploads a mat3x3f from a JS value and uses it in a shader sees shifted columns.',
    tier=1, behavior='high', equiv='none', reach_class='gpu-suite')

add('M23', 'Compiled writer transposes matrices given as mat objects', S,
    [P + 'data/compiledIO.ts'],
    'For MatImpl inputs the writer reads columns[row].component[col] instead of columns[col].component[row] (row-/column-major mix-up). '
    'Typed-array and plain-array inputs are unaffected.',
    'bytes-layout', ['ported:auto/mul', 'ported:auto/add', 'ported:auto/sub', 'inv:mul-paths', 'inv:integer-mul'],
    'likely', 'high',
    'Invisible for symmetric matrices (identity, scalings); any asymmetric matrix upload flips results.',
    tier=1, behavior='high', equiv='low', reach_class='gpu-suite')

add('M24', 'std.mix emits mix(b, a, t)', S,
    [P + 'std/numeric.ts'],
    'Generated WGSL swaps the first two arguments of mix (argument-order bug).',
    'gpu-value', ['ported:mix', 'inv:vector-fns', 'inv:integer-mul (float cases)', 'docs: ~166 std.mix uses'],
    'likely', 'high',
    'Result is 1 - t weighted; identical for t = 0.5 or a == b, so very subtle for symmetric tests, loud for t in {0,1}.',
    tier=1, behavior='high', equiv='none', reach_class='gpu-suite')

add('M25', 'std.faceForward emits faceForward(e1, e3, e2)', S,
    [P + 'std/numeric.ts'],
    'Generated WGSL swaps the 2nd and 3rd arguments of faceForward.',
    'gpu-value', ['inv:vector-fns'],
    'unlikely', 'medium',
    'No mocked test mentions faceForward (grep over typegpu tests and docs snapshots). No CPU implementation, so only the GPU path exists.',
    tier=1, behavior='high', equiv='low', reach_class='gpu-suite')

add('M26', 'std.countLeadingZeros emits countTrailingZeros', S,
    [P + 'std/numeric.ts'],
    'Copy-paste bug in codegen: countLeadingZeros(x) is emitted as countTrailingZeros(x).',
    'gpu-value', ['inv:bitops', 'inv:scalar-int'],
    'unlikely', 'high',
    'No CPU implementation exists (string normalImpl) and no mocked test mentions countLeadingZeros, so only a real GPU run can see it.',
    tier=1, behavior='high', equiv='none', reach_class='gpu-suite')

add('M27', 'std.extractBits emits (offset, count) swapped', S,
    [P + 'std/numeric.ts'],
    'Generated WGSL calls extractBits(e, count, offset).',
    'gpu-value', ['inv:bitops'],
    'unlikely', 'high',
    'Equal result when offset == count; no CPU implementation; no mocked test mentions extractBits.',
    tier=1, behavior='high', equiv='low', reach_class='gpu-suite')

add('M28', 'CPU/comptime smoothstep has no clamp', S,
    [P + 'data/numberOps.ts'],
    'smoothstepScalar drops clampScalar(...,0,1): comptime-folded smoothstep(e0, e1, x) returns t*t*(3-2t) for x outside [e0,e1] (values > 1 or < 0).',
    'gpu-value', ['inv:vector-fns (const-fold + runtime CPU-vs-oracle)'],
    'likely', 'medium',
    'Only the CPU implementation changes: seen when arguments are comptime-known (folded into the shader as a constant) or when the CPU impl is compared with an oracle.',
    tier=1, behavior='high', equiv='none', reach_class='gpu-suite')

add('M29', 'CPU/comptime mod uses floored modulo', S,
    [P + 'std/operators.ts'],
    'The CPU implementation of std.mod uses ((a % b) + b) % b: differs from WGSL/truncated semantics for negative operands (and for floats).',
    'gpu-value', ['inv:scalar-int (const-bodies uses std.mod)'],
    'likely', 'medium',
    'Integer division/modulo sign class. Only std.mod calls with comptime arguments (or JS calls) change; the `%` operator and runtime GPU std.mod are untouched. '
    'The ported/auto/mod tests use runtime arguments and hard-coded expectations, so they do not see it.',
    tier=1, behavior='high', equiv='low', reach_class='gpu-suite')

add('M30', 'i32() cast saturates instead of wrapping', S,
    [P + 'data/numeric.ts'],
    'CPU/comptime i32(v) clamps the truncated value to the i32 range instead of "v | 0" wrap-around (e.g. i32(10000000000) becomes 2147483647 instead of 1410065408).',
    'gpu-value', ['inv:scalar-int (scalar-conv asserts d.i32(10000000000) === 1410065408)', 'inv:comptime'],
    'likely', 'medium',
    'u32/i32 overflow semantics. Only comptime/CPU-evaluated casts of out-of-range values are affected.',
    tier=1, behavior='high', equiv='low', reach_class='gpu-suite')

add('M31', 'for-of over std.range runs one extra iteration', S,
    [P + 'tgsl/forOfUtils.ts'],
    'Generated loop header uses "<=" instead of "<" for non-unrolled `for (const i of std.range(...))` loops with positive step.',
    'gpu-value', ['docs:simple/liquid-glass', 'docs:simulation/stable-fluid', 'docs:rendering/clouds', 'docs:rendering/radiance-cascades', 'docs:algorithms/genetic-racing'],
    'likely', 'high',
    'Off-by-one in generated code. No ex13/investigation suite uses non-unrolled std.range loops (checked by grep), so only docs examples reach it.',
    tier=2, behavior='high', equiv='none', reach_class='docs-only')

add('M32', 'Guarded compute pipeline guard uses ">" instead of ">="', S,
    [P + 'core/root/init.ts'],
    'The WGSL bounds guard of createGuardedComputePipeline becomes `any(in.id > sizeUniform)`: one extra thread per dimension executes the callback.',
    'gpu-value', ['ex13:dispatch (atomicAdd count 4x3x2)', 'ex13:log-test', 'docs: ~66 dispatchThreads users'],
    'likely', 'high',
    'Comparison swapped (< vs <=). Caught by dispatch\'s atomic counter on any backend; harness-based suites that dispatchThreads() with one thread are unaffected.',
    tier=1, behavior='high', equiv='none', reach_class='gpu-suite')

add('M33', 'dispatchThreads computes workgroup count with floor instead of ceil', S,
    [P + 'core/root/init.ts'],
    'dispatchWorkgroups(floor(threads / workgroupSize)): sizes not divisible by the workgroup size lose the last partial workgroup; sizes smaller than the workgroup dispatch nothing.',
    'gpu-value', ['ex13:dispatch', 'ex13:log-test', 'docs: ~66 dispatchThreads users'],
    'likely', 'high',
    'Dispatch-size class (cf. indirect dispatch size). dispatch test with 7 threads on a 256-wide group dispatches 0 groups.',
    tier=1, behavior='high', equiv='none', reach_class='gpu-suite')

add('M34', 'Workgroup barrier removed from the prefix-scan up-sweep', S,
    [ 'packages/typegpu-sort/src/scan/compute/shared.ts'],
    'The std.workgroupBarrier() at the top of each up-sweep iteration is deleted; threads read workgroupMemory entries other threads have not yet written.',
    'gpu-value', ['ex13:prefix-scan', 'ex13:concurrent-chart', 'docs:tests/prefix-scan'],
    'unlikely', 'high',
    'A race: deterministic wrong sums on emulators that run invocations sequentially/coroutine-style (Lavapipe, SwiftShader), possibly passing on lock-step '
    'hardware. @typegpu/sort has no unit tests in the repo and no docs snapshot covers the scan shaders.',
    tier=1, behavior='high', equiv='low', reach_class='gpu-suite')

add('M35', 'Workgroup barrier removed between down-sweep and the final read', S,
    ['packages/typegpu-sort/src/scan/compute/scan.ts'],
    'Deleted std.workgroupBarrier() after downsweep(localIdx): scannedSum is read before every invocation finished its down-sweep writes.',
    'gpu-value', ['ex13:prefix-scan', 'ex13:concurrent-chart', 'docs:tests/prefix-scan'],
    'unlikely', 'high',
    'Misplaced/missing barrier class; only the final write-back depends on the race, so results are subtler than M34.',
    tier=1, behavior='high', equiv='low', reach_class='gpu-suite')

add('M36', 'std.atomicSub emits atomicAdd', S,
    [P + 'std/atomic.ts'],
    'Copy-paste bug in the atomic op mapping: atomicSub(&a, v) is emitted as atomicAdd(&a, v).',
    'gpu-value', ['docs:simulation/fluid-with-atomics'],
    'likely', 'high',
    'Atomic op mapping class. Only one docs example uses atomicSub; none of the 13 tests or investigation suites does. Mocked docs snapshot contains the call text.',
    tier=2, behavior='high', equiv='none', reach_class='docs-only')

add('M37', 'rg* texture formats get the wrong bytes-per-texel (default 4)', S,
    [P + 'core/texture/textureFormats.ts'],
    'The texel-size regex no longer matches the "rg" prefix: rg8 formats report 4 bytes (should be 2), rg32 formats 4 (should be 8). texture.write() computes the wrong expected size / bytesPerRow.',
    'host-logic', ['docs:tests/texture-write', 'docs:tests/texture-write-3d', 'docs:tests/texture-compose'],
    'likely', 'medium',
    'Texture bytes-per-pixel class. rg16* are unaffected (16 bits x 2 = 4 by luck). Surfaces as a thrown size-mismatch error or garbage texels.',
    tier=1, behavior='high', equiv='none', reach_class='docs-only')

add('M38', 'u32To01F32 drops the lowest mantissa bit', S,
    ['packages/typegpu-noise/src/utils.ts'],
    'Mask 0x007fffff -> 0x007ffffe in the u32 -> [0,1) float conversion shared by every @typegpu/noise generator: all random floats lose one ulp of resolution.',
    'gpu-value', ['ex13:probability (bit patterns)', 'ex13:prng-cpu-gpu', 'ex13:bitonic-sort', 'docs:tests/uniformity', 'docs: ~30 noise users'],
    'likely', 'low',
    'Subtle 1-ulp numeric change; found by bit-exact comparison against the unmutated run, not by tolerance checks. CPU and GPU change together so prng-cpu-gpu stays consistent.',
    tier=1, behavior='high', equiv='none', reach_class='gpu-suite')

add('M39', 'GPU-side hash multiplier differs from the CPU one by one bit', S,
    ['packages/typegpu-noise/src/utils.ts'],
    'In hash() the transpiled (GPU) branch multiplies by 0xac4c1b50 while the CPU branch keeps 0xac4c1b51: seeded GPU sequences diverge from the CPU reference.',
    'gpu-value', ['ex13:prng-cpu-gpu', 'ex13:probability', 'docs:tests/uniformity'],
    'likely', 'medium',
    'Noise/numeric-constant class; CPU-vs-GPU mismatch is checked directly by the prng-cpu-gpu example. Mocked snapshots contain the hash WGSL.',
    tier=1, behavior='high', equiv='none', reach_class='gpu-suite')

add('M40', 'srgbToLinear uses gamma 2.2 instead of 2.4', S,
    ['packages/typegpu-color/src/srgb.ts'],
    'The power-curve branch of srgbToLinear uses exponent 2.2 (classic approximation) instead of the sRGB 2.4.',
    'gpu-value', ['docs:rendering/box-raytracing', 'docs:simple/oklab'],
    'unlikely', 'low',
    'Numeric-constant class in @typegpu/color (no unit tests there). Small colour shifts, visible only with an output hash/pixel comparison.',
    tier=1, behavior='high', equiv='none', reach_class='docs-only')

add('M41', 'opSmoothUnion blend term loses a factor h', S,
    ['packages/typegpu-sdf/src/operators.ts'],
    'smooth-min correction "h * h * k * 1/4" becomes "h * k * 1/4": the blend region is too wide/strong.',
    'gpu-value', ['docs:tests/sdf-docs-examples', 'docs:simple/ripple-cube'],
    'likely', 'medium',
    'SDF constant class. Only the smooth-union blend zone changes (visible near the seam of the two shapes).',
    tier=1, behavior='high', equiv='none', reach_class='docs-only')

add('M42', 'Bitonic sort default paddingValue 0x7fffffff instead of 0xffffffff', S,
    ['packages/typegpu-sort/src/bitonic/bitonicSort.ts'],
    'Default padding for non-power-of-two arrays is half of u32 range: arrays containing values >= 0x7fffffff sort incorrectly (padding is not the maximum).',
    'gpu-value', ['(none: example data are < 256 and the example passes paddingValue explicitly)'],
    'unlikely', 'medium',
    'Default-value class. Deliberately unreachable by the test inputs (values 0..255), a "test data too narrow" case.',
    tier=2, behavior='high', equiv='high', reach_class='none')

add('M43', 'std.select emits select(t, f, cond)', S,
    [P + 'std/boolean.ts'],
    'Generated WGSL swaps the false/true branches of std.select (argument-order bug; inverts the condition).',
    'gpu-value', ['inv:bitops', 'inv:vector-fns', 'inv:scalar-int', 'docs: ~70 std.select uses'],
    'likely', 'high',
    'Runtime GPU path only: select with comptime args is folded by the CPU impl, so the tgsl-parsing-test constants do not see it.',
    tier=1, behavior='high', equiv='none', reach_class='gpu-suite')

add('M44', 'CPU .rgb swizzle returns (r, b, g)', S,
    [P + 'data/vectorImpl.ts'],
    'The 3-length rgba-alias swizzles on the CPU pick components (e0, e2, e1): v.rgb of a CPU/comptime vector is wrong while v.xyz is right.',
    'host-logic', ['docs:*examples using .rgb on comptime/CPU vectors (few)'],
    'unknown', 'medium',
    'Swizzle/component mapping class. GPU codegen emits the swizzle text unchanged, so only CPU-evaluated or comptime-folded swizzles change.',
    tier=2, behavior='high', equiv='low', reach_class='host-only')

add('M45', 'rotationY4 WGSL sign error', S,
    [P + 'data/matrix.ts'],
    'The generated WGSL for d.mat4x4f.rotationY / std.rotateY4 flips the signs of the sin terms (rotates the other way); the CPU implementation stays correct.',
    'gpu-value', ['docs:rendering/3d-fish'],
    'likely', 'medium',
    'CPU vs GPU divergence. tgsl-parsing-test folds rotationY with constants (CPU impl), so the broken codegen text is only emitted for runtime angles.',
    tier=2, behavior='high', equiv='none', reach_class='docs-only')

add('M46', 'std.insertBits emits the base value and the inserted bits swapped', S,
    [P + 'std/numeric.ts'],
    'Generated WGSL calls insertBits(newbits, e, offset, count) instead of insertBits(e, newbits, offset, count).',
    'gpu-value', ['inv:bitops (ops, extract-insert-overflow)', 'inv:scalar-int', 'ported:semantics'],
    'unlikely', 'high',
    'Bit-op argument order. No CPU implementation and zero mocked-test mentions of insertBits (grep over unit tests and docs snapshots): a GPU-only catch candidate.',
    tier=1, behavior='high', equiv='low', reach_class='gpu-suite')

add('M47', 'std.firstLeadingBit emits firstTrailingBit', S,
    [P + 'std/numeric.ts'],
    'Copy-paste bug: firstLeadingBit(x) is emitted as firstTrailingBit(x).',
    'gpu-value', ['inv:bitops', 'inv:scalar-int'],
    'unlikely', 'high',
    'Equal for single-bit inputs, different for any value with several bits set. No mocked test mentions firstLeadingBit; no CPU implementation.',
    tier=1, behavior='high', equiv='low', reach_class='gpu-suite')

add('M48', 'std.countTrailingZeros emits firstTrailingBit', S,
    [P + 'std/numeric.ts'],
    'Copy-paste bug: countTrailingZeros(x) is emitted as firstTrailingBit(x). The two agree for every x != 0 and differ only at x == 0 (32 vs -1/0xFFFFFFFF).',
    'gpu-value', ['inv:bitops', 'inv:scalar-int'],
    'unlikely', 'high',
    'Extremely subtle: only the zero input exposes it (the suites include 0 in their edge lists). No CPU impl; zero mocked-test mentions of countTrailingZeros.',
    tier=1, behavior='high', equiv='medium', reach_class='gpu-suite')

add('M49', 'std.dot4U8Packed emits dot4I8Packed', S,
    [P + 'std/numeric.ts'],
    'Copy-paste bug: unsigned packed dot product is emitted as the signed variant: bytes >= 128 are treated as negative.',
    'gpu-value', ['inv:bitops (packed-int)', 'inv:scalar-int'],
    'unlikely', 'high',
    'Equal whenever every packed byte is < 128. Needs the dot4*Packed extension (WGSL language feature) on the backend. No mocked-test mentions.',
    tier=1, behavior='high', equiv='low', reach_class='gpu-suite')

add('M50', 'std.trunc emits floor', S,
    [P + 'std/numeric.ts'],
    'Copy-paste bug: trunc(x) is emitted as floor(x): differs for negative non-integers (round toward -inf instead of 0).',
    'gpu-value', ['inv:vector-fns', 'ported:semantics'],
    'unlikely', 'medium',
    'No CPU implementation and zero mocked-test mentions of trunc; vector-fns/specs.ts and ported/semantics exercise it on the GPU.',
    tier=1, behavior='high', equiv='low', reach_class='gpu-suite')


def main():
    only = None
    out = os.path.join(CAT, 'catalogue.json')
    a = sys.argv[1:]
    while a:
        k = a.pop(0)
        if k == '--only':
            only = set(a.pop(0).split(','))
        elif k == '--out':
            out = a.pop(0)
    ents = [e for e in E if only is None or e['id'] in only]
    ids = [e['id'] for e in ents]
    assert len(ids) == len(set(ids))
    for e in ents:
        r = []
        for x in e['expected_reachable_by']:
            if x.startswith('('):
                continue
            if x.startswith('docs: '):
                x = 'docs:*' + x[6:]
            elif not x.startswith('docs:*'):
                x = x.split(' (')[0]
            r.append(x)
        e['expected_reachable_by'] = r
        e['behavior_verification'] = ('executed CPU probe (evidence/probe-diffs.json)' if e['id'] in EXECUTED
                                      else 'static analysis only (not executed)')
        pf = os.path.join(CAT, 'patches', e['id'] + '.patch')
        assert os.path.exists(pf), pf
        e['patch'] = 'patches/' + e['id'] + '.patch'
    json.dump(ents, open(out, 'w'), indent=2, ensure_ascii=False)
    print('wrote', out, len(ents), 'entries')


if __name__ == '__main__':
    main()
