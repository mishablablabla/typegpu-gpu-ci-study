# Per-test attribution (pool1+own): which tests detected each mutant, per backend

type: status = pass->fail (or vanished); value = readback fingerprint changed in a BASE-deterministic test.


## M01 f32->f16 bit conversion rounds half-up and double-rounds subnormals

- **lavapipe**: DETECTED-value, 6 detecting tests
  - full / diff/f16.diff.test.ts [status]: 6 test(s), e.g. "[WGSL] add vec2h"
- **swiftshader**: not-run(f16) (f16-blocked tests: 12), 0 detecting tests
- **metal**: DETECTED-value, 6 detecting tests
  - full / diff/f16.diff.test.ts [status]: 6 test(s), e.g. "[WGSL] add vec2h"

## M02 Perlin dynamic cache never clears its dirty flag

- **lavapipe**: missed, 0 detecting tests
- **swiftshader**: missed, 0 detecting tests
- **metal**: missed, 0 detecting tests

## M03 tgpu.unroll over a range ending at 0 is dropped

- **lavapipe**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M03 tgpu.unroll(std.range(-3, 0)) unrolls three iterations (range ends at 0)"
- **swiftshader**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M03 tgpu.unroll(std.range(-3, 0)) unrolls three iterations (range ends at 0)"
- **metal**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M03 tgpu.unroll(std.range(-3, 0)) unrolls three iterations (range ends at 0)"

## M04 withIndexBuffer ignores the element-count size argument

- **lavapipe**: missed, 0 detecting tests
- **swiftshader**: missed, 0 detecting tests
- **metal**: missed, 0 detecting tests

## M05 isCloseTo for vectors emits "(lhs - lhs) + precision" (lhs evaluated twice)

- **lavapipe**: missed, 0 detecting tests
- **swiftshader**: missed, 0 detecting tests
- **metal**: missed, 0 detecting tests

## M06 CPU std.saturate throws for float vectors

- **lavapipe**: text-only, 0 detecting tests
- **swiftshader**: text-only, 0 detecting tests
- **metal**: text-only, 0 detecting tests

## M07 Integer-valued literals >= 2^63 typed as abstractInt (FLT_MAX in oklab)

- **lavapipe**: DETECTED-value, 1 detecting tests
  - ex / typegpu-examples/e-mnist-log-flood.test.ts [value]: 1 test(s), e.g. "jump-flood-voronoi: rendered 64x64 pixels (sha1)"
- **swiftshader**: DETECTED-value, 1 detecting tests
  - ex / typegpu-examples/e-mnist-log-flood.test.ts [value]: 1 test(s), e.g. "jump-flood-voronoi: rendered 64x64 pixels (sha1)"
- **metal**: DETECTED-value, 1 detecting tests
  - ex / typegpu-examples/e-mnist-log-flood.test.ts [value]: 1 test(s), e.g. "jump-flood-voronoi: rendered 64x64 pixels (sha1)"

## M08 Compiled writer leaves mat3x3f column padding unwritten

- **lavapipe**: missed, 0 detecting tests
- **swiftshader**: missed, 0 detecting tests
- **metal**: missed, 0 detecting tests

## M09 Buffer allocations/transfers no longer padded to a multiple of 4 bytes

- **lavapipe**: DETECTED-value, 14 detecting tests
  - full / diff/f16.diff.test.ts [value]: 3 test(s), e.g. "[WGSL] add f16"
  - full / ported/distance.gpu.test.ts [status]: 1 test(s), e.g. "distance (GPU) computes distance between two points (f16)"
  - full / ported/exp2.gpu.test.ts [status]: 1 test(s), e.g. "exp2 (GPU) computes exp2 of vec3h"
  - full / ported/mix.gpu.test.ts [status]: 1 test(s), e.g. "mix (GPU) should blend higher dimension vectors correctly"
  - full / ported/trig-misc.gpu.test.ts [status]: 1 test(s), e.g. "cross (GPU) computes cross product of two vec3h"
  - full / ported/auto/div.gpu.test.ts [status]: 1 test(s), e.g. "div (GPU) computes quotient of vecNh and vecNh"
  - full / ported/auto/mod.gpu.test.ts [status]: 5 test(s), e.g. "mod (GPU) computes component-wise modulo of vec3h vectors"
  - full / ported/auto/mul.gpu.test.ts [status]: 1 test(s), e.g. "mul (GPU) computes product of a vec3 and vec3"
- **swiftshader**: DETECTED-value, 6 detecting tests
  - full / ported/auto/mod.gpu.test.ts [value]: 5 test(s), e.g. "mod (GPU) computes component-wise modulo of vec3h vectors"
  - full / ported/auto/mul.gpu.test.ts [value]: 1 test(s), e.g. "mul (GPU) computes product of a vec3 and vec3"
- **metal**: DETECTED-value, 14 detecting tests
  - full / diff/f16.diff.test.ts [value]: 3 test(s), e.g. "[WGSL] add f16"
  - full / ported/distance.gpu.test.ts [status]: 1 test(s), e.g. "distance (GPU) computes distance between two points (f16)"
  - full / ported/exp2.gpu.test.ts [status]: 1 test(s), e.g. "exp2 (GPU) computes exp2 of vec3h"
  - full / ported/mix.gpu.test.ts [status]: 1 test(s), e.g. "mix (GPU) should blend higher dimension vectors correctly"
  - full / ported/trig-misc.gpu.test.ts [status]: 1 test(s), e.g. "cross (GPU) computes cross product of two vec3h"
  - full / ported/auto/div.gpu.test.ts [status]: 1 test(s), e.g. "div (GPU) computes quotient of vecNh and vecNh"
  - full / ported/auto/mod.gpu.test.ts [status]: 5 test(s), e.g. "mod (GPU) computes component-wise modulo of vec3h vectors"
  - full / ported/auto/mul.gpu.test.ts [status]: 1 test(s), e.g. "mul (GPU) computes product of a vec3 and vec3"

## M10 Non-finite comptime values are no longer rejected (Finite Math Assumption)

- **lavapipe**: DETECTED-value, 31 detecting tests
  - full / diff/int.diff.test.ts [status]: 12 test(s), e.g. "[TypeGPU] div vec2i"
  - full / selftest/observations.test.ts [status]: 3 test(s), e.g. "[TypeGPU] inf / NaN handling (Finite Math Assumption) vector constructors reject inf/NaN on the CPU"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [status]: 9 test(s), e.g. "[div / mod] integer std.div and std.mod: SCALARS compile to f32 operations, VECTORS to integer operations std."
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [status]: 1 test(s), e.g. "[observation] constant-folded scalar ops (direct call with captured constants) vs runtime GPU [TypeGPU] zero d"
  - inv-scalar-int / investigations/scalar-int/scalar-conv.test.ts [status]: 1 test(s), e.g. "[TypeGPU] non-finite values: CPU casts throw (Finite Math Assumption); GPU converts them (observation, indeter"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [status]: 3 test(s), e.g. "constant-folded vs runtime: sampled rows of every function asin vec2f"
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [status]: 1 test(s), e.g. "overflow / underflow of intermediates (length, normalize, distance, dot, mix, fma) [observation: expected diff"
  - inv-vector-fns / investigations/vector-fns/specials.test.ts [status]: 1 test(s), e.g. "inf/NaN observations [observation] vecNf constructors reject inf/NaN on the CPU [TypeGPU]"
- **swiftshader**: DETECTED-value, 31 detecting tests
  - full / diff/int.diff.test.ts [status]: 12 test(s), e.g. "[TypeGPU] div vec2i"
  - full / selftest/observations.test.ts [status]: 3 test(s), e.g. "[TypeGPU] inf / NaN handling (Finite Math Assumption) vector constructors reject inf/NaN on the CPU"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [status]: 9 test(s), e.g. "[div / mod] integer std.div and std.mod: SCALARS compile to f32 operations, VECTORS to integer operations std."
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [status]: 1 test(s), e.g. "[observation] constant-folded scalar ops (direct call with captured constants) vs runtime GPU [TypeGPU] zero d"
  - inv-scalar-int / investigations/scalar-int/scalar-conv.test.ts [status]: 1 test(s), e.g. "[TypeGPU] non-finite values: CPU casts throw (Finite Math Assumption); GPU converts them (observation, indeter"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [status]: 3 test(s), e.g. "constant-folded vs runtime: sampled rows of every function asin vec2f"
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [status]: 1 test(s), e.g. "overflow / underflow of intermediates (length, normalize, distance, dot, mix, fma) [observation: expected diff"
  - inv-vector-fns / investigations/vector-fns/specials.test.ts [status]: 1 test(s), e.g. "inf/NaN observations [observation] vecNf constructors reject inf/NaN on the CPU [TypeGPU]"
- **metal**: DETECTED-value, 31 detecting tests
  - full / diff/int.diff.test.ts [status]: 12 test(s), e.g. "[TypeGPU] div vec2i"
  - full / selftest/observations.test.ts [status]: 3 test(s), e.g. "[TypeGPU] inf / NaN handling (Finite Math Assumption) vector constructors reject inf/NaN on the CPU"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [status]: 9 test(s), e.g. "[div / mod] integer std.div and std.mod: SCALARS compile to f32 operations, VECTORS to integer operations std."
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [status]: 1 test(s), e.g. "[observation] constant-folded scalar ops (direct call with captured constants) vs runtime GPU [TypeGPU] zero d"
  - inv-scalar-int / investigations/scalar-int/scalar-conv.test.ts [status]: 1 test(s), e.g. "[TypeGPU] non-finite values: CPU casts throw (Finite Math Assumption); GPU converts them (observation, indeter"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [status]: 3 test(s), e.g. "constant-folded vs runtime: sampled rows of every function asin vec2f"
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [status]: 1 test(s), e.g. "overflow / underflow of intermediates (length, normalize, distance, dot, mix, fma) [observation: expected diff"
  - inv-vector-fns / investigations/vector-fns/specials.test.ts [status]: 1 test(s), e.g. "inf/NaN observations [observation] vecNf constructors reject inf/NaN on the CPU [TypeGPU]"

## M11 Auto vertex output does not receive fragment-determined varying locations

- **lavapipe**: missed, 0 detecting tests
- **swiftshader**: missed, 0 detecting tests
- **metal**: missed, 0 detecting tests

## M12 withLocations treats location 0 as "no location"

- **lavapipe**: text-only, 0 detecting tests
- **swiftshader**: text-only, 0 detecting tests
- **metal**: text-only, 0 detecting tests

## M13 Global identifier resolved inside a nested call can capture a caller-local name

- **lavapipe**: text-only, 0 detecting tests
- **swiftshader**: text-only, 0 detecting tests
- **metal**: text-only, 0 detecting tests

## M14 Implicit conversion i32/u32 <-> abstractFloat picks i32/u32 (truncates the float)

- **lavapipe**: DETECTED-value, 1 detecting tests
  - inv-scalar-int / investigations/scalar-int/scalar-contract.test.ts [status]: 1 test(s), e.g. "[expected difference] mixed i32/u32 operands and untyped literals i32 + 1.5: the integer silently becomes f32 "
- **swiftshader**: DETECTED-value, 1 detecting tests
  - inv-scalar-int / investigations/scalar-int/scalar-contract.test.ts [status]: 1 test(s), e.g. "[expected difference] mixed i32/u32 operands and untyped literals i32 + 1.5: the integer silently becomes f32 "
- **metal**: DETECTED-value, 1 detecting tests
  - inv-scalar-int / investigations/scalar-int/scalar-contract.test.ts [status]: 1 test(s), e.g. "[expected difference] mixed i32/u32 operands and untyped literals i32 + 1.5: the integer silently becomes f32 "

## M15 hasIndexBuffer is a constant false field

- **lavapipe**: missed, 0 detecting tests
- **swiftshader**: missed, 0 detecting tests
- **metal**: missed, 0 detecting tests

## M16 Piping a configuration duplicates its bindings

- **lavapipe**: missed, 0 detecting tests
- **swiftshader**: missed, 0 detecting tests
- **metal**: missed, 0 detecting tests

## M17 Generated identifiers may shadow WGSL template enumerants (read, write, uniform, rgba8unorm...)

- **lavapipe**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M17 resource named like a WGSL template enumerant (read) next to a read-only storage buffer"
- **swiftshader**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M17 resource named like a WGSL template enumerant (read) next to a read-only storage buffer"
- **metal**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M17 resource named like a WGSL template enumerant (read) next to a read-only storage buffer"

## M18 Unary minus on u32 no longer rejected by TypeGPU

- **lavapipe**: DETECTED-value, 2 detecting tests
  - inv-bitops / investigations/bitops/findings.test.ts [status]: 1 test(s), e.g. "[F11] unary minus / std.neg on u32 [observation] GPU code generation rejects -u32 / std.neg(u32) (loud, at res"
  - inv-scalar-int / investigations/scalar-int/scalar-contract.test.ts [status]: 1 test(s), e.g. "[TypeGPU] what each scalar integer spelling compiles to (generated WGSL) std.neg(u32) is rejected by TypeGPU a"
- **swiftshader**: DETECTED-value, 2 detecting tests
  - inv-bitops / investigations/bitops/findings.test.ts [status]: 1 test(s), e.g. "[F11] unary minus / std.neg on u32 [observation] GPU code generation rejects -u32 / std.neg(u32) (loud, at res"
  - inv-scalar-int / investigations/scalar-int/scalar-contract.test.ts [status]: 1 test(s), e.g. "[TypeGPU] what each scalar integer spelling compiles to (generated WGSL) std.neg(u32) is rejected by TypeGPU a"
- **metal**: DETECTED-value, 2 detecting tests
  - inv-bitops / investigations/bitops/findings.test.ts [status]: 1 test(s), e.g. "[F11] unary minus / std.neg on u32 [observation] GPU code generation rejects -u32 / std.neg(u32) (loud, at res"
  - inv-scalar-int / investigations/scalar-int/scalar-contract.test.ts [status]: 1 test(s), e.g. "[TypeGPU] what each scalar integer spelling compiles to (generated WGSL) std.neg(u32) is rejected by TypeGPU a"

## M19 Compiled writer uses unpadded element stride for arrays of vec3

- **lavapipe**: DETECTED-value, 1 detecting tests
  - own / own/own-layout.test.ts [status]: 1 test(s), e.g. "own: memory layout M19 array<vec3f, 4> written by the host reads back intact on the GPU (16-byte stride)"
- **swiftshader**: DETECTED-value, 1 detecting tests
  - own / own/own-layout.test.ts [status]: 1 test(s), e.g. "own: memory layout M19 array<vec3f, 4> written by the host reads back intact on the GPU (16-byte stride)"
- **metal**: DETECTED-value, 1 detecting tests
  - own / own/own-layout.test.ts [status]: 1 test(s), e.g. "own: memory layout M19 array<vec3f, 4> written by the host reads back intact on the GPU (16-byte stride)"

## M20 Struct size loses trailing padding

- **lavapipe**: missed, 0 detecting tests
- **swiftshader**: missed, 0 detecting tests
- **metal**: missed, 0 detecting tests

## M21 vec3<f16> alignment 4 instead of 8

- **lavapipe**: DETECTED-value, 1 detecting tests
  - own / own/own-layout.test.ts [status]: 1 test(s), e.g. "own: memory layout M21 struct{f16, vec3h} (vec3h align 8) round-trips (needs shader-f16)"
- **swiftshader**: not-run(f16) (f16-blocked tests: 2), 0 detecting tests
- **metal**: DETECTED-value, 1 detecting tests
  - own / own/own-layout.test.ts [status]: 1 test(s), e.g. "own: memory layout M21 struct{f16, vec3h} (vec3h align 8) round-trips (needs shader-f16)"

## M22 mat3x3f columns written packed (36 bytes) by the compiled writer

- **lavapipe**: DETECTED-value, 7 detecting tests
  - full / ported/auto/add.gpu.test.ts [status]: 1 test(s), e.g. "add (GPU) computes sum of two matrices"
  - full / ported/auto/mul.gpu.test.ts [status]: 5 test(s), e.g. "mul (GPU) computes product of a number and mat3x3f"
  - full / ported/auto/sub.gpu.test.ts [status]: 1 test(s), e.g. "sub (GPU) computes difference of two matrices"
- **swiftshader**: DETECTED-value, 7 detecting tests
  - full / ported/auto/add.gpu.test.ts [status]: 1 test(s), e.g. "add (GPU) computes sum of two matrices"
  - full / ported/auto/mul.gpu.test.ts [status]: 5 test(s), e.g. "mul (GPU) computes product of a number and mat3x3f"
  - full / ported/auto/sub.gpu.test.ts [status]: 1 test(s), e.g. "sub (GPU) computes difference of two matrices"
- **metal**: DETECTED-value, 7 detecting tests
  - full / ported/auto/add.gpu.test.ts [status]: 1 test(s), e.g. "add (GPU) computes sum of two matrices"
  - full / ported/auto/mul.gpu.test.ts [status]: 5 test(s), e.g. "mul (GPU) computes product of a number and mat3x3f"
  - full / ported/auto/sub.gpu.test.ts [status]: 1 test(s), e.g. "sub (GPU) computes difference of two matrices"

## M23 Compiled writer transposes matrices given as mat objects

- **lavapipe**: DETECTED-value, 17 detecting tests
  - full / ported/auto/add.gpu.test.ts [status]: 1 test(s), e.g. "add (GPU) computes sum of two matrices"
  - full / ported/auto/mul.gpu.test.ts [status]: 15 test(s), e.g. "mul (GPU) computes product of a number and mat2x2f"
  - full / ported/auto/sub.gpu.test.ts [status]: 1 test(s), e.g. "sub (GPU) computes difference of two matrices"
- **swiftshader**: DETECTED-value, 17 detecting tests
  - full / ported/auto/add.gpu.test.ts [status]: 1 test(s), e.g. "add (GPU) computes sum of two matrices"
  - full / ported/auto/mul.gpu.test.ts [status]: 15 test(s), e.g. "mul (GPU) computes product of a number and mat2x2f"
  - full / ported/auto/sub.gpu.test.ts [status]: 1 test(s), e.g. "sub (GPU) computes difference of two matrices"
- **metal**: DETECTED-value, 17 detecting tests
  - full / ported/auto/add.gpu.test.ts [status]: 1 test(s), e.g. "add (GPU) computes sum of two matrices"
  - full / ported/auto/mul.gpu.test.ts [status]: 15 test(s), e.g. "mul (GPU) computes product of a number and mat2x2f"
  - full / ported/auto/sub.gpu.test.ts [status]: 1 test(s), e.g. "sub (GPU) computes difference of two matrices"

## M24 std.mix emits mix(b, a, t)

- **lavapipe**: DETECTED-value, 26 detecting tests
  - full / ported/mix.gpu.test.ts [status]: 5 test(s), e.g. "mix (GPU) should blend scalar values correctly"
  - inv-mul-paths / investigations/mul-paths/float-paths.test.ts [status]: 3 test(s), e.g. "[TypeGPU] std.mix, std.dot, std.fma on f32 2: mix(vec, vec, scalar t) and mix(vec, vec, vec t): exact data, ex"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 7 test(s), e.g. "constant-folded vs runtime: sampled rows of every function mix f32"
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [status]: 1 test(s), e.g. "mix with t outside [0,1] and extreme t [WGSL: x*(1-z)+y*z] [WGSL] extrapolation and exactness of the formula"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 7 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle mix f32"
  - inv-vector-fns / investigations/vector-fns/specials.test.ts [value]: 3 test(s), e.g. "inf/NaN observations [observation] mix(f32) with inf/NaN: CPU (JS) vs GPU"
- **swiftshader**: DETECTED-value, 26 detecting tests
  - full / ported/mix.gpu.test.ts [status]: 4 test(s), e.g. "mix (GPU) should blend scalar values correctly"
  - inv-mul-paths / investigations/mul-paths/float-paths.test.ts [status]: 3 test(s), e.g. "[TypeGPU] std.mix, std.dot, std.fma on f32 2: mix(vec, vec, scalar t) and mix(vec, vec, vec t): exact data, ex"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 7 test(s), e.g. "constant-folded vs runtime: sampled rows of every function mix f32"
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [value]: 2 test(s), e.g. "overflow / underflow of intermediates (length, normalize, distance, dot, mix, fma) [observation: expected diff"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [value]: 7 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle mix f32"
  - inv-vector-fns / investigations/vector-fns/specials.test.ts [value]: 3 test(s), e.g. "inf/NaN observations [observation] mix(f32) with inf/NaN: CPU (JS) vs GPU"
- **metal**: DETECTED-value, 26 detecting tests
  - full / ported/mix.gpu.test.ts [status]: 5 test(s), e.g. "mix (GPU) should blend scalar values correctly"
  - inv-mul-paths / investigations/mul-paths/float-paths.test.ts [status]: 3 test(s), e.g. "[TypeGPU] std.mix, std.dot, std.fma on f32 2: mix(vec, vec, scalar t) and mix(vec, vec, vec t): exact data, ex"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 7 test(s), e.g. "constant-folded vs runtime: sampled rows of every function mix f32"
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [status]: 1 test(s), e.g. "mix with t outside [0,1] and extreme t [WGSL: x*(1-z)+y*z] [WGSL] extrapolation and exactness of the formula"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 7 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle mix f32"
  - inv-vector-fns / investigations/vector-fns/specials.test.ts [value]: 3 test(s), e.g. "inf/NaN observations [observation] mix(f32) with inf/NaN: CPU (JS) vs GPU"

## M25 std.faceForward emits faceForward(e1, e3, e2)

- **lavapipe**: text-only, 0 detecting tests
- **swiftshader**: text-only, 0 detecting tests
- **metal**: text-only, 0 detecting tests

## M26 std.countLeadingZeros emits countTrailingZeros

- **lavapipe**: DETECTED-value, 19 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 6 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.countLeadingZeros"
  - inv-bitops / investigations/bitops/extras.test.ts [status]: 1 test(s), e.g. "[observation] shift amount given as i32 / f32 and Math.clz32 on floats: CPU (JS ToUint32/ToInt32) vs GPU (WGSL"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 10 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.countLeadingZeros on i32"
  - inv-scalar-int / investigations/scalar-int/scalar-bits.test.ts [status]: 2 test(s), e.g. "[observation] integer bit builtins: GPU == standard definition; no CPU implementation (API limitation) std.cou"
- **swiftshader**: DETECTED-value, 19 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 6 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.countLeadingZeros"
  - inv-bitops / investigations/bitops/extras.test.ts [status]: 1 test(s), e.g. "[observation] shift amount given as i32 / f32 and Math.clz32 on floats: CPU (JS ToUint32/ToInt32) vs GPU (WGSL"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 10 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.countLeadingZeros on i32"
  - inv-scalar-int / investigations/scalar-int/scalar-bits.test.ts [status]: 2 test(s), e.g. "[observation] integer bit builtins: GPU == standard definition; no CPU implementation (API limitation) std.cou"
- **metal**: DETECTED-value, 19 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 6 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.countLeadingZeros"
  - inv-bitops / investigations/bitops/extras.test.ts [status]: 1 test(s), e.g. "[observation] shift amount given as i32 / f32 and Math.clz32 on floats: CPU (JS ToUint32/ToInt32) vs GPU (WGSL"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 10 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.countLeadingZeros on i32"
  - inv-scalar-int / investigations/scalar-int/scalar-bits.test.ts [status]: 2 test(s), e.g. "[observation] integer bit builtins: GPU == standard definition; no CPU implementation (API limitation) std.cou"

## M27 std.extractBits emits (offset, count) swapped

- **lavapipe**: DETECTED-value, 16 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.extractBits on i3"
  - inv-bitops / investigations/bitops/extract-insert-overflow.test.ts [value]: 4 test(s), e.g. "[observation] offset+count > 32 with runtime values std.extractBits on i32 (offset+count>32 region only)"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.extractBits on i32"
- **swiftshader**: DETECTED-value, 16 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.extractBits on i3"
  - inv-bitops / investigations/bitops/extract-insert-overflow.test.ts [value]: 4 test(s), e.g. "[observation] offset+count > 32 with runtime values std.extractBits on i32 (offset+count>32 region only)"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.extractBits on i32"
- **metal**: DETECTED-value, 16 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.extractBits on i3"
  - inv-bitops / investigations/bitops/extract-insert-overflow.test.ts [value]: 4 test(s), e.g. "[observation] offset+count > 32 with runtime values std.extractBits on i32 (offset+count>32 region only)"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.extractBits on i32"

## M28 CPU/comptime smoothstep has no clamp

- **lavapipe**: DETECTED-value, 9 detecting tests
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 4 test(s), e.g. "constant-folded vs runtime: sampled rows of every function smoothstep f32"
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [status]: 1 test(s), e.g. "clamp / smoothstep / step edges [WGSL] smoothstep with edge0 > edge1 descends (CPU and GPU), and values are in"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 4 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle smoothstep f32"
- **swiftshader**: DETECTED-value, 9 detecting tests
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 4 test(s), e.g. "constant-folded vs runtime: sampled rows of every function smoothstep f32"
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [status]: 1 test(s), e.g. "clamp / smoothstep / step edges [WGSL] smoothstep with edge0 > edge1 descends (CPU and GPU), and values are in"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 4 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle smoothstep f32"
- **metal**: DETECTED-value, 9 detecting tests
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 4 test(s), e.g. "constant-folded vs runtime: sampled rows of every function smoothstep f32"
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [status]: 1 test(s), e.g. "clamp / smoothstep / step edges [WGSL] smoothstep with edge0 > edge1 descends (CPU and GPU), and values are in"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 4 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle smoothstep f32"

## M29 CPU/comptime mod uses floored modulo

- **lavapipe**: DETECTED-value, 10 detecting tests
  - full / diff/int.diff.test.ts [status]: 6 test(s), e.g. "[TypeGPU] mod vec2i"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [status]: 3 test(s), e.g. "[div / mod] integer std.div and std.mod: SCALARS compile to f32 operations, VECTORS to integer operations std."
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [status]: 1 test(s), e.g. "[observation] constant-folded scalar ops (direct call with captured constants) vs runtime GPU [expected] silen"
- **swiftshader**: DETECTED-value, 13 detecting tests
  - full / diff/float.diff.test.ts [status]: 4 test(s), e.g. "[WGSL] mod f32"
  - full / diff/int.diff.test.ts [status]: 6 test(s), e.g. "[TypeGPU] mod vec2i"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [status]: 3 test(s), e.g. "[div / mod] integer std.div and std.mod: SCALARS compile to f32 operations, VECTORS to integer operations std."
- **metal**: DETECTED-value, 14 detecting tests
  - full / diff/float.diff.test.ts [status]: 4 test(s), e.g. "[WGSL] mod f32"
  - full / diff/int.diff.test.ts [status]: 6 test(s), e.g. "[TypeGPU] mod vec2i"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [status]: 3 test(s), e.g. "[div / mod] integer std.div and std.mod: SCALARS compile to f32 operations, VECTORS to integer operations std."
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [status]: 1 test(s), e.g. "[observation] constant-folded scalar ops (direct call with captured constants) vs runtime GPU [expected] silen"

## M30 i32() cast saturates instead of wrapping

- **lavapipe**: DETECTED-value, 57 detecting tests
  - full / diff/int.diff.test.ts [status]: 12 test(s), e.g. "[WGSL] add vec2i"
  - full / selftest/observations.test.ts [status]: 1 test(s), e.g. "[TypeGPU] CPU implementation quirks integer vector multiply on the CPU loses precision (INT_MAX * INT_MAX)"
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.abs on vec3i"
  - inv-bitops / investigations/bitops/findings.test.ts [status]: 2 test(s), e.g. "[F6] CPU scalar std.abs(INT_MIN) [observation, family of known scalar-int CPU fact] std.abs(i32 INT_MIN) = 214"
  - inv-comptime / investigations/comptime/comptime-vs-runtime.test.ts [value]: 6 test(s), e.g. "comptime (captured-constant) vs runtime (buffer) evaluation of integer ops std.add vec2i"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [status]: 17 test(s), e.g. "[WGSL semantics] GPU std.mul(vec2i) conforms; [CPU] characterised CPU is always either correct or explained by"
  - inv-mul-paths / investigations/mul-paths/int-propagation.test.ts [value]: 6 test(s), e.g. "[CONFIRMED DEFECT #1 propagation] constant-folded paths (op called directly in the traced body) [CONFIRMED DEF"
  - inv-mul-paths / investigations/mul-paths/int-propagation.test.ts [status]: 2 test(s), e.g. "std.sub / std.add / std.neg share cpuMul(-1, x) / generalizeFn but are NOT affected (control rows) vec2i: std."
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [status]: 3 test(s), e.g. "[observation] constant-folded scalar ops (direct call with captured constants) vs runtime GPU [expected] silen"
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [value]: 1 test(s), e.g. "conversions: folded casts vs runtime casts [observation] plain captured JS numbers: d.u32(-1) / d.i32(1e10) fo"
  - inv-scalar-int / investigations/scalar-int/scalar-conv.test.ts [status]: 3 test(s), e.g. "[WGSL] i32 <-> u32 conversions reinterpret bits; CPU agrees d.i32(u32): GPU == BigInt reinterpretation and CPU"
- **swiftshader**: DETECTED-value, 56 detecting tests
  - full / diff/int.diff.test.ts [status]: 12 test(s), e.g. "[WGSL] add vec2i"
  - full / selftest/observations.test.ts [status]: 1 test(s), e.g. "[TypeGPU] CPU implementation quirks integer vector multiply on the CPU loses precision (INT_MAX * INT_MAX)"
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.abs on vec3i"
  - inv-bitops / investigations/bitops/findings.test.ts [status]: 2 test(s), e.g. "[F6] CPU scalar std.abs(INT_MIN) [observation, family of known scalar-int CPU fact] std.abs(i32 INT_MIN) = 214"
  - inv-comptime / investigations/comptime/comptime-vs-runtime.test.ts [value]: 6 test(s), e.g. "comptime (captured-constant) vs runtime (buffer) evaluation of integer ops std.add vec2i"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [status]: 17 test(s), e.g. "[WGSL semantics] GPU std.mul(vec2i) conforms; [CPU] characterised CPU is always either correct or explained by"
  - inv-mul-paths / investigations/mul-paths/int-propagation.test.ts [value]: 6 test(s), e.g. "[CONFIRMED DEFECT #1 propagation] constant-folded paths (op called directly in the traced body) [CONFIRMED DEF"
  - inv-mul-paths / investigations/mul-paths/int-propagation.test.ts [status]: 2 test(s), e.g. "std.sub / std.add / std.neg share cpuMul(-1, x) / generalizeFn but are NOT affected (control rows) vec2i: std."
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [status]: 2 test(s), e.g. "conversions: folded casts vs runtime casts [WGSL] i32 <-> u32 reinterpretation and int -> f32 widening: folded"
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [value]: 1 test(s), e.g. "conversions: folded casts vs runtime casts [observation] plain captured JS numbers: d.u32(-1) / d.i32(1e10) fo"
  - inv-scalar-int / investigations/scalar-int/scalar-conv.test.ts [status]: 3 test(s), e.g. "[WGSL] i32 <-> u32 conversions reinterpret bits; CPU agrees d.i32(u32): GPU == BigInt reinterpretation and CPU"
- **metal**: DETECTED-value, 57 detecting tests
  - full / diff/int.diff.test.ts [status]: 12 test(s), e.g. "[WGSL] add vec2i"
  - full / selftest/observations.test.ts [status]: 1 test(s), e.g. "[TypeGPU] CPU implementation quirks integer vector multiply on the CPU loses precision (INT_MAX * INT_MAX)"
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.abs on vec3i"
  - inv-bitops / investigations/bitops/findings.test.ts [status]: 2 test(s), e.g. "[F6] CPU scalar std.abs(INT_MIN) [observation, family of known scalar-int CPU fact] std.abs(i32 INT_MIN) = 214"
  - inv-comptime / investigations/comptime/comptime-vs-runtime.test.ts [value]: 6 test(s), e.g. "comptime (captured-constant) vs runtime (buffer) evaluation of integer ops std.add vec2i"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [status]: 17 test(s), e.g. "[WGSL semantics] GPU std.mul(vec2i) conforms; [CPU] characterised CPU is always either correct or explained by"
  - inv-mul-paths / investigations/mul-paths/int-propagation.test.ts [value]: 6 test(s), e.g. "[CONFIRMED DEFECT #1 propagation] constant-folded paths (op called directly in the traced body) [CONFIRMED DEF"
  - inv-mul-paths / investigations/mul-paths/int-propagation.test.ts [status]: 2 test(s), e.g. "std.sub / std.add / std.neg share cpuMul(-1, x) / generalizeFn but are NOT affected (control rows) vec2i: std."
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [status]: 3 test(s), e.g. "[observation] constant-folded scalar ops (direct call with captured constants) vs runtime GPU [expected] silen"
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [value]: 1 test(s), e.g. "conversions: folded casts vs runtime casts [observation] plain captured JS numbers: d.u32(-1) / d.i32(1e10) fo"
  - inv-scalar-int / investigations/scalar-int/scalar-conv.test.ts [status]: 3 test(s), e.g. "[WGSL] i32 <-> u32 conversions reinterpret bits; CPU agrees d.i32(u32): GPU == BigInt reinterpretation and CPU"

## M31 for-of over std.range runs one extra iteration

- **lavapipe**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M31 for-of over std.range(4) runs exactly 4 iterations"
- **swiftshader**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M31 for-of over std.range(4) runs exactly 4 iterations"
- **metal**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M31 for-of over std.range(4) runs exactly 4 iterations"

## M32 Guarded compute pipeline guard uses ">" instead of ">="

- **lavapipe**: DETECTED-value, 2 detecting tests
  - full / step2.test.ts [status]: 1 test(s), e.g. "TypeGPU on a real device (dawn.node) writes x*2 into 64 u32 (64 threads)"
  - full / step3.test.ts [value]: 1 test(s), e.g. "E3: generated WGSL compiles on the real compiler struct + vec3f math + branching + loop"
- **swiftshader**: DETECTED-value, 2 detecting tests
  - full / step2.test.ts [status]: 1 test(s), e.g. "TypeGPU on a real device (dawn.node) writes x*2 into 64 u32 (64 threads)"
  - full / step3.test.ts [value]: 1 test(s), e.g. "E3: generated WGSL compiles on the real compiler struct + vec3f math + branching + loop"
- **metal**: text-only, 0 detecting tests

## M33 dispatchThreads computes workgroup count with floor instead of ceil

- **lavapipe**: DETECTED-value, 965 detecting tests
  - full / step2.test.ts [status]: 1 test(s), e.g. "TypeGPU on a real device (dawn.node) writes x*2 into 64 u32 (64 threads)"
  - full / step3.test.ts [value]: 1 test(s), e.g. "E3: generated WGSL compiles on the real compiler struct + vec3f math + branching + loop"
  - full / diff/f16.diff.test.ts [status]: 9 test(s), e.g. "[WGSL] add f16"
  - full / diff/float.diff.test.ts [status]: 56 test(s), e.g. "[WGSL] add f32"
  - full / diff/float.diff.test.ts [value]: 16 test(s), e.g. "[WGSL] mod f32"
  - full / diff/int.diff.test.ts [status]: 86 test(s), e.g. "[WGSL] add i32"
  - full / selftest/integrity.test.ts [value]: 4 test(s), e.g. "[engine] negative controls: broken operations must fail result off by +1 is detected (scalar)"
  - full / selftest/integrity.test.ts [status]: 2 test(s), e.g. "[engine] negative controls: broken operations must fail an unmodified op is NOT flagged (control for the contr"
  - inv-bitops / investigations/bitops/extract-insert-overflow.test.ts [value]: 8 test(s), e.g. "[observation] offset+count > 32 with runtime values std.extractBits on i32 (offset+count>32 region only)"
  - inv-bitops / investigations/bitops/extras.test.ts [status]: 17 test(s), e.g. "[bitcast] std.bitcast(from, to)(x) and deprecated bitcastU32toI32 / U32toF32 / F32toU32 bitcast i32 -> u32: GP"
  - inv-bitops / investigations/bitops/packed-int.test.ts [status]: 8 test(s), e.g. "[runtime] packed integer functions: CPU vs GPU vs BigInt oracle pack4xI8"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 224 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.countOneBits on i32"
  - inv-comptime / investigations/comptime/comptime-vs-runtime.test.ts [value]: 64 test(s), e.g. "comptime (captured-constant) vs runtime (buffer) evaluation of integer ops std.add vec2i"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [value]: 10 test(s), e.g. "[WGSL semantics] GPU std.mul(vec2i) conforms; [CPU] characterised collect"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [status]: 29 test(s), e.g. "[WGSL semantics] GPU std.mul(vec2i) conforms; [CPU] characterised GPU equals the BigInt expectation (32-bit wr"
  - inv-scalar-int / investigations/scalar-int/scalar-bits.test.ts [status]: 14 test(s), e.g. "[observation] integer bit builtins: GPU == standard definition; no CPU implementation (API limitation) std.cou"
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [status]: 4 test(s), e.g. "[observation] constant-folded scalar ops (direct call with captured constants) vs runtime GPU [expected] silen"
  - inv-scalar-int / investigations/scalar-int/scalar-contract.test.ts [status]: 3 test(s), e.g. "[expected difference] mixed i32/u32 operands and untyped literals i32 + u32: the u32 operand is converted with"
  - inv-scalar-int / investigations/scalar-int/scalar-conv.test.ts [status]: 7 test(s), e.g. "[WGSL] i32 <-> u32 conversions reinterpret bits; CPU agrees d.i32(u32): GPU == BigInt reinterpretation and CPU"
  - inv-scalar-int / investigations/scalar-int/scalar-conv.test.ts [value]: 1 test(s), e.g. "[TypeGPU] non-finite values: CPU casts throw (Finite Math Assumption); GPU converts them (observation, indeter"
  - inv-scalar-int / investigations/scalar-int/scalar-pow.test.ts [value]: 4 test(s), e.g. "[observation] scalar integer pow goes through f32 pow(): exactly representable integer results are not reliabl"
  - inv-scalar-int / investigations/scalar-int/scalar-runtime.test.ts [status]: 82 test(s), e.g. "[WGSL] GPU runtime equals the BigInt oracle for every op that TypeGPU emits as a plain WGSL operator/builtin a"
  - inv-scalar-int / investigations/scalar-int/scalar-runtime.test.ts [value]: 1 test(s), e.g. "[PROBABLE DEFECT S1] scalar integer std.mod goes through f32 and returns wrong remainders [observation] zero d"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 124 test(s), e.g. "constant-folded vs runtime: sampled rows of every function abs f32"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [status]: 2 test(s), e.g. "targeted constant-expression cases [WGSL] constant overflow is a shader-creation error: length(vec3f(3e38)) = "
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [status]: 7 test(s), e.g. "round: ties to even [WGSL], and the sign of zero [WGSL] GPU round = round-half-even for every tie / near-tie ("
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [value]: 5 test(s), e.g. "round: ties to even [WGSL], and the sign of zero [observation] sign of zero: round(-0.5) is -0 on the GPU and "
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 108 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle abs f32"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [value]: 11 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle asin f32"
  - inv-vector-fns / investigations/vector-fns/specials.test.ts [value]: 57 test(s), e.g. "inf/NaN observations [observation] abs(f32) with inf/NaN: CPU (JS) vs GPU"
- **swiftshader**: DETECTED-value, 953 detecting tests
  - full / step2.test.ts [status]: 1 test(s), e.g. "TypeGPU on a real device (dawn.node) writes x*2 into 64 u32 (64 threads)"
  - full / step3.test.ts [value]: 1 test(s), e.g. "E3: generated WGSL compiles on the real compiler struct + vec3f math + branching + loop"
  - full / diff/float.diff.test.ts [status]: 60 test(s), e.g. "[WGSL] add f32"
  - full / diff/float.diff.test.ts [value]: 12 test(s), e.g. "[WGSL] log f32"
  - full / diff/int.diff.test.ts [status]: 86 test(s), e.g. "[WGSL] add i32"
  - full / selftest/integrity.test.ts [value]: 4 test(s), e.g. "[engine] negative controls: broken operations must fail result off by +1 is detected (scalar)"
  - full / selftest/integrity.test.ts [status]: 2 test(s), e.g. "[engine] negative controls: broken operations must fail an unmodified op is NOT flagged (control for the contr"
  - inv-bitops / investigations/bitops/extract-insert-overflow.test.ts [value]: 8 test(s), e.g. "[observation] offset+count > 32 with runtime values std.extractBits on i32 (offset+count>32 region only)"
  - inv-bitops / investigations/bitops/extras.test.ts [status]: 17 test(s), e.g. "[bitcast] std.bitcast(from, to)(x) and deprecated bitcastU32toI32 / U32toF32 / F32toU32 bitcast i32 -> u32: GP"
  - inv-bitops / investigations/bitops/packed-int.test.ts [status]: 8 test(s), e.g. "[runtime] packed integer functions: CPU vs GPU vs BigInt oracle pack4xI8"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 224 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.countOneBits on i32"
  - inv-comptime / investigations/comptime/comptime-vs-runtime.test.ts [value]: 64 test(s), e.g. "comptime (captured-constant) vs runtime (buffer) evaluation of integer ops std.add vec2i"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [value]: 10 test(s), e.g. "[WGSL semantics] GPU std.mul(vec2i) conforms; [CPU] characterised collect"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [status]: 29 test(s), e.g. "[WGSL semantics] GPU std.mul(vec2i) conforms; [CPU] characterised GPU equals the BigInt expectation (32-bit wr"
  - inv-scalar-int / investigations/scalar-int/scalar-bits.test.ts [status]: 14 test(s), e.g. "[observation] integer bit builtins: GPU == standard definition; no CPU implementation (API limitation) std.cou"
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [status]: 3 test(s), e.g. "[observation] constant-folded scalar ops (direct call with captured constants) vs runtime GPU [observation] bi"
  - inv-scalar-int / investigations/scalar-int/scalar-contract.test.ts [status]: 3 test(s), e.g. "[expected difference] mixed i32/u32 operands and untyped literals i32 + u32: the u32 operand is converted with"
  - inv-scalar-int / investigations/scalar-int/scalar-conv.test.ts [status]: 6 test(s), e.g. "[WGSL] i32 <-> u32 conversions reinterpret bits; CPU agrees d.i32(u32): GPU == BigInt reinterpretation and CPU"
  - inv-scalar-int / investigations/scalar-int/scalar-conv.test.ts [value]: 1 test(s), e.g. "[TypeGPU] non-finite values: CPU casts throw (Finite Math Assumption); GPU converts them (observation, indeter"
  - inv-scalar-int / investigations/scalar-int/scalar-pow.test.ts [value]: 4 test(s), e.g. "[observation] scalar integer pow goes through f32 pow(): exactly representable integer results are not reliabl"
  - inv-scalar-int / investigations/scalar-int/scalar-runtime.test.ts [status]: 82 test(s), e.g. "[WGSL] GPU runtime equals the BigInt oracle for every op that TypeGPU emits as a plain WGSL operator/builtin a"
  - inv-scalar-int / investigations/scalar-int/scalar-runtime.test.ts [value]: 1 test(s), e.g. "[PROBABLE DEFECT S1] scalar integer std.mod goes through f32 and returns wrong remainders [observation] zero d"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 124 test(s), e.g. "constant-folded vs runtime: sampled rows of every function abs f32"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [status]: 2 test(s), e.g. "targeted constant-expression cases [WGSL] constant overflow is a shader-creation error: length(vec3f(3e38)) = "
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [status]: 5 test(s), e.g. "round: ties to even [WGSL], and the sign of zero [WGSL] GPU round = round-half-even for every tie / near-tie ("
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [value]: 7 test(s), e.g. "round: ties to even [WGSL], and the sign of zero [observation] sign of zero: round(-0.5) is -0 on the GPU and "
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 105 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle abs f32"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [value]: 14 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle fract f32"
  - inv-vector-fns / investigations/vector-fns/specials.test.ts [value]: 56 test(s), e.g. "inf/NaN observations [observation] abs(f32) with inf/NaN: CPU (JS) vs GPU"
- **metal**: DETECTED-value, 965 detecting tests
  - full / step2.test.ts [status]: 1 test(s), e.g. "TypeGPU on a real device (dawn.node) writes x*2 into 64 u32 (64 threads)"
  - full / step3.test.ts [value]: 1 test(s), e.g. "E3: generated WGSL compiles on the real compiler struct + vec3f math + branching + loop"
  - full / diff/f16.diff.test.ts [status]: 9 test(s), e.g. "[WGSL] add f16"
  - full / diff/float.diff.test.ts [status]: 68 test(s), e.g. "[WGSL] add f32"
  - full / diff/float.diff.test.ts [value]: 4 test(s), e.g. "[WGSL] tanh f32"
  - full / diff/int.diff.test.ts [status]: 86 test(s), e.g. "[WGSL] add i32"
  - full / selftest/integrity.test.ts [value]: 4 test(s), e.g. "[engine] negative controls: broken operations must fail result off by +1 is detected (scalar)"
  - full / selftest/integrity.test.ts [status]: 2 test(s), e.g. "[engine] negative controls: broken operations must fail an unmodified op is NOT flagged (control for the contr"
  - inv-bitops / investigations/bitops/extract-insert-overflow.test.ts [value]: 8 test(s), e.g. "[observation] offset+count > 32 with runtime values std.extractBits on i32 (offset+count>32 region only)"
  - inv-bitops / investigations/bitops/extras.test.ts [status]: 17 test(s), e.g. "[bitcast] std.bitcast(from, to)(x) and deprecated bitcastU32toI32 / U32toF32 / F32toU32 bitcast i32 -> u32: GP"
  - inv-bitops / investigations/bitops/packed-int.test.ts [status]: 8 test(s), e.g. "[runtime] packed integer functions: CPU vs GPU vs BigInt oracle pack4xI8"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 224 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.countOneBits on i32"
  - inv-comptime / investigations/comptime/comptime-vs-runtime.test.ts [value]: 64 test(s), e.g. "comptime (captured-constant) vs runtime (buffer) evaluation of integer ops std.add vec2i"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [value]: 10 test(s), e.g. "[WGSL semantics] GPU std.mul(vec2i) conforms; [CPU] characterised collect"
  - inv-integer-mul / investigations/integer-mul/integer-boundaries.test.ts [status]: 29 test(s), e.g. "[WGSL semantics] GPU std.mul(vec2i) conforms; [CPU] characterised GPU equals the BigInt expectation (32-bit wr"
  - inv-scalar-int / investigations/scalar-int/scalar-bits.test.ts [status]: 14 test(s), e.g. "[observation] integer bit builtins: GPU == standard definition; no CPU implementation (API limitation) std.cou"
  - inv-scalar-int / investigations/scalar-int/scalar-const.test.ts [status]: 4 test(s), e.g. "[observation] constant-folded scalar ops (direct call with captured constants) vs runtime GPU [expected] silen"
  - inv-scalar-int / investigations/scalar-int/scalar-contract.test.ts [status]: 3 test(s), e.g. "[expected difference] mixed i32/u32 operands and untyped literals i32 + u32: the u32 operand is converted with"
  - inv-scalar-int / investigations/scalar-int/scalar-conv.test.ts [status]: 7 test(s), e.g. "[WGSL] i32 <-> u32 conversions reinterpret bits; CPU agrees d.i32(u32): GPU == BigInt reinterpretation and CPU"
  - inv-scalar-int / investigations/scalar-int/scalar-conv.test.ts [value]: 1 test(s), e.g. "[TypeGPU] non-finite values: CPU casts throw (Finite Math Assumption); GPU converts them (observation, indeter"
  - inv-scalar-int / investigations/scalar-int/scalar-pow.test.ts [value]: 4 test(s), e.g. "[observation] scalar integer pow goes through f32 pow(): exactly representable integer results are not reliabl"
  - inv-scalar-int / investigations/scalar-int/scalar-runtime.test.ts [status]: 82 test(s), e.g. "[WGSL] GPU runtime equals the BigInt oracle for every op that TypeGPU emits as a plain WGSL operator/builtin a"
  - inv-scalar-int / investigations/scalar-int/scalar-runtime.test.ts [value]: 1 test(s), e.g. "[PROBABLE DEFECT S1] scalar integer std.mod goes through f32 and returns wrong remainders [observation] zero d"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 122 test(s), e.g. "constant-folded vs runtime: sampled rows of every function abs f32"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [status]: 4 test(s), e.g. "targeted constant-expression cases [observation] length/normalize of ordinary-looking vectors: the baked const"
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [status]: 9 test(s), e.g. "round: ties to even [WGSL], and the sign of zero [WGSL] GPU round = round-half-even for every tie / near-tie ("
  - inv-vector-fns / investigations/vector-fns/edge-cases.test.ts [value]: 3 test(s), e.g. "round: ties to even [WGSL], and the sign of zero [observation] sign of zero: round(-0.5) is -0 on the GPU and "
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 116 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle abs f32"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [value]: 3 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle refract vec2f"
  - inv-vector-fns / investigations/vector-fns/specials.test.ts [value]: 57 test(s), e.g. "inf/NaN observations [observation] abs(f32) with inf/NaN: CPU (JS) vs GPU"

## M34 Workgroup barrier removed from the prefix-scan up-sweep

- **lavapipe**: DETECTED-value, 2 detecting tests
  - ex / typegpu-examples/d-sort-scan.test.ts [status]: 2 test(s), e.g. "concurrent-chart calculator (needs timestamp-query)"
- **swiftshader**: DETECTED-value, 2 detecting tests
  - ex / typegpu-examples/d-sort-scan.test.ts [status]: 2 test(s), e.g. "concurrent-chart calculator (needs timestamp-query)"
- **metal**: DETECTED-value, 2 detecting tests
  - ex / typegpu-examples/d-sort-scan.test.ts [status]: 2 test(s), e.g. "concurrent-chart calculator (needs timestamp-query)"

## M35 Workgroup barrier removed between down-sweep and the final read

- **lavapipe**: text-only, 0 detecting tests
- **swiftshader**: text-only, 0 detecting tests
- **metal**: DETECTED-value, 2 detecting tests
  - ex / typegpu-examples/d-sort-scan.test.ts [status]: 2 test(s), e.g. "concurrent-chart calculator (needs timestamp-query)"

## M36 std.atomicSub emits atomicAdd

- **lavapipe**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M36 atomicSub: 30 threads each subtract 1 from an atomic<u32> holding 100"
- **swiftshader**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M36 atomicSub: 30 threads each subtract 1 from an atomic<u32> holding 100"
- **metal**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M36 atomicSub: 30 threads each subtract 1 from an atomic<u32> holding 100"

## M37 rg* texture formats get the wrong bytes-per-texel (default 4)

- **lavapipe**: DETECTED-value, 1 detecting tests
  - own / own/own-texture.test.ts [status]: 1 test(s), e.g. "own: texture upload M37 raw write of a 4x4 rg8unorm texture reads back byte-exact (bytes per texel = 2)"
- **swiftshader**: DETECTED-value, 1 detecting tests
  - own / own/own-texture.test.ts [status]: 1 test(s), e.g. "own: texture upload M37 raw write of a 4x4 rg8unorm texture reads back byte-exact (bytes per texel = 2)"
- **metal**: DETECTED-value, 1 detecting tests
  - own / own/own-texture.test.ts [status]: 1 test(s), e.g. "own: texture upload M37 raw write of a 4x4 rg8unorm texture reads back byte-exact (bytes per texel = 2)"

## M38 u32To01F32 drops the lowest mantissa bit

- **lavapipe**: DETECTED-value, 2 detecting tests
  - ex / typegpu-examples/c-prng-prob.test.ts [value]: 2 test(s), e.g. "prng-cpu-gpu (CPU vs GPU generators; BPETER has no CPU implementation by design)"
- **swiftshader**: DETECTED-value, 2 detecting tests
  - ex / typegpu-examples/c-prng-prob.test.ts [value]: 2 test(s), e.g. "prng-cpu-gpu (CPU vs GPU generators; BPETER has no CPU implementation by design)"
- **metal**: DETECTED-value, 2 detecting tests
  - ex / typegpu-examples/c-prng-prob.test.ts [value]: 2 test(s), e.g. "prng-cpu-gpu (CPU vs GPU generators; BPETER has no CPU implementation by design)"

## M39 GPU-side hash multiplier differs from the CPU one by one bit

- **lavapipe**: DETECTED-value, 4 detecting tests
  - ex / typegpu-examples/c-prng-prob.test.ts [value]: 2 test(s), e.g. "prng-cpu-gpu (CPU vs GPU generators; BPETER has no CPU implementation by design)"
  - ex / typegpu-examples/d-sort-scan.test.ts [value]: 1 test(s), e.g. "bitonic-sort: sorted + permutation for 3 orders (n=1000, padded)"
  - ex / typegpu-examples/e-mnist-log-flood.test.ts [value]: 1 test(s), e.g. "jump-flood-voronoi: rendered 64x64 pixels (sha1)"
- **swiftshader**: DETECTED-value, 4 detecting tests
  - ex / typegpu-examples/c-prng-prob.test.ts [value]: 2 test(s), e.g. "prng-cpu-gpu (CPU vs GPU generators; BPETER has no CPU implementation by design)"
  - ex / typegpu-examples/d-sort-scan.test.ts [value]: 1 test(s), e.g. "bitonic-sort: sorted + permutation for 3 orders (n=1000, padded)"
  - ex / typegpu-examples/e-mnist-log-flood.test.ts [value]: 1 test(s), e.g. "jump-flood-voronoi: rendered 64x64 pixels (sha1)"
- **metal**: DETECTED-value, 4 detecting tests
  - ex / typegpu-examples/c-prng-prob.test.ts [value]: 2 test(s), e.g. "prng-cpu-gpu (CPU vs GPU generators; BPETER has no CPU implementation by design)"
  - ex / typegpu-examples/d-sort-scan.test.ts [value]: 1 test(s), e.g. "bitonic-sort: sorted + permutation for 3 orders (n=1000, padded)"
  - ex / typegpu-examples/e-mnist-log-flood.test.ts [value]: 1 test(s), e.g. "jump-flood-voronoi: rendered 64x64 pixels (sha1)"

## M40 srgbToLinear uses gamma 2.2 instead of 2.4

- **lavapipe**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M40 srgbToLinear matches the sRGB EOTF (gamma 2.4 piecewise)"
- **swiftshader**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M40 srgbToLinear matches the sRGB EOTF (gamma 2.4 piecewise)"
- **metal**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M40 srgbToLinear matches the sRGB EOTF (gamma 2.4 piecewise)"

## M41 opSmoothUnion blend term loses a factor h

- **lavapipe**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M41 opSmoothUnion matches the quadratic smooth-min polynomial"
- **swiftshader**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M41 opSmoothUnion matches the quadratic smooth-min polynomial"
- **metal**: DETECTED-value, 1 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M41 opSmoothUnion matches the quadratic smooth-min polynomial"

## M42 Bitonic sort default paddingValue 0x7fffffff instead of 0xffffffff

- **lavapipe**: DETECTED-value, 1 detecting tests
  - own / own/own-layout.test.ts [status]: 1 test(s), e.g. "own: sort package M42 createBitonicSorter on 1000 u32 (non power of two) sorts values both below and above 0x7"
- **swiftshader**: DETECTED-value, 1 detecting tests
  - own / own/own-layout.test.ts [status]: 1 test(s), e.g. "own: sort package M42 createBitonicSorter on 1000 u32 (non power of two) sorts values both below and above 0x7"
- **metal**: DETECTED-value, 1 detecting tests
  - own / own/own-layout.test.ts [status]: 1 test(s), e.g. "own: sort package M42 createBitonicSorter on 1000 u32 (non power of two) sorts values both below and above 0x7"

## M43 std.select emits select(t, f, cond)

- **lavapipe**: DETECTED-value, 25 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M40 srgbToLinear matches the sRGB EOTF (gamma 2.4 piecewise)"
  - own / own/own-layout.test.ts [status]: 1 test(s), e.g. "own: sort package M42 createBitonicSorter on 1000 u32 (non power of two) sorts values both below and above 0x7"
  - ex / typegpu-examples/c-prng-prob.test.ts [value]: 1 test(s), e.g. "probability: 13 distributions x 1000 samples (bit patterns recorded)"
  - ex / typegpu-examples/d-sort-scan.test.ts [status]: 1 test(s), e.g. "bitonic-sort: sorted + permutation for 3 orders (n=1000, padded)"
  - ex / typegpu-examples/e-mnist-log-flood.test.ts [value]: 1 test(s), e.g. "jump-flood-voronoi: rendered 64x64 pixels (sha1)"
  - inv-bitops / investigations/bitops/extras.test.ts [status]: 2 test(s), e.g. "[select] std.select with boolean-vector condition on integer vectors select(vec3i, vec3i, vec3b) CPU == GPU =="
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.select (scalar cond) on i32"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 4 test(s), e.g. "constant-folded vs runtime: sampled rows of every function select vec2f"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 4 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle select vec2f"
  - inv-vector-fns / investigations/vector-fns/specials.test.ts [value]: 2 test(s), e.g. "inf/NaN observations [observation] select(f32) with inf/NaN: CPU (JS) vs GPU"
- **swiftshader**: DETECTED-value, 25 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M40 srgbToLinear matches the sRGB EOTF (gamma 2.4 piecewise)"
  - own / own/own-layout.test.ts [status]: 1 test(s), e.g. "own: sort package M42 createBitonicSorter on 1000 u32 (non power of two) sorts values both below and above 0x7"
  - ex / typegpu-examples/c-prng-prob.test.ts [value]: 1 test(s), e.g. "probability: 13 distributions x 1000 samples (bit patterns recorded)"
  - ex / typegpu-examples/d-sort-scan.test.ts [status]: 1 test(s), e.g. "bitonic-sort: sorted + permutation for 3 orders (n=1000, padded)"
  - ex / typegpu-examples/e-mnist-log-flood.test.ts [value]: 1 test(s), e.g. "jump-flood-voronoi: rendered 64x64 pixels (sha1)"
  - inv-bitops / investigations/bitops/extras.test.ts [status]: 2 test(s), e.g. "[select] std.select with boolean-vector condition on integer vectors select(vec3i, vec3i, vec3b) CPU == GPU =="
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.select (scalar cond) on i32"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 4 test(s), e.g. "constant-folded vs runtime: sampled rows of every function select vec2f"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 4 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle select vec2f"
  - inv-vector-fns / investigations/vector-fns/specials.test.ts [value]: 2 test(s), e.g. "inf/NaN observations [observation] select(f32) with inf/NaN: CPU (JS) vs GPU"
- **metal**: DETECTED-value, 25 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M40 srgbToLinear matches the sRGB EOTF (gamma 2.4 piecewise)"
  - own / own/own-layout.test.ts [status]: 1 test(s), e.g. "own: sort package M42 createBitonicSorter on 1000 u32 (non power of two) sorts values both below and above 0x7"
  - ex / typegpu-examples/c-prng-prob.test.ts [value]: 1 test(s), e.g. "probability: 13 distributions x 1000 samples (bit patterns recorded)"
  - ex / typegpu-examples/d-sort-scan.test.ts [status]: 1 test(s), e.g. "bitonic-sort: sorted + permutation for 3 orders (n=1000, padded)"
  - ex / typegpu-examples/e-mnist-log-flood.test.ts [value]: 1 test(s), e.g. "jump-flood-voronoi: rendered 64x64 pixels (sha1)"
  - inv-bitops / investigations/bitops/extras.test.ts [status]: 2 test(s), e.g. "[select] std.select with boolean-vector condition on integer vectors select(vec3i, vec3i, vec3b) CPU == GPU =="
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.select (scalar cond) on i32"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 4 test(s), e.g. "constant-folded vs runtime: sampled rows of every function select vec2f"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 4 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle select vec2f"
  - inv-vector-fns / investigations/vector-fns/specials.test.ts [value]: 2 test(s), e.g. "inf/NaN observations [observation] select(f32) with inf/NaN: CPU (JS) vs GPU"

## M44 CPU .rgb swizzle returns (r, b, g)

- **lavapipe**: missed, 0 detecting tests
- **swiftshader**: missed, 0 detecting tests
- **metal**: missed, 0 detecting tests

## M45 rotationY4 WGSL sign error

- **lavapipe**: DETECTED-value, 3 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M45 rotationY4 rotates +x by +90 degrees about y onto -z (right-handed)"
  - inv-mul-paths / investigations/mul-paths/matrix-ctors.test.ts [status]: 2 test(s), e.g. "[TypeGPU] matrix constructors: CPU (f64 trig) and GPU runtime vs f64 oracle rotationY4"
- **swiftshader**: DETECTED-value, 3 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M45 rotationY4 rotates +x by +90 degrees about y onto -z (right-handed)"
  - inv-mul-paths / investigations/mul-paths/matrix-ctors.test.ts [status]: 2 test(s), e.g. "[TypeGPU] matrix constructors: CPU (f64 trig) and GPU runtime vs f64 oracle rotationY4"
- **metal**: DETECTED-value, 3 detecting tests
  - own / own/own-compute.test.ts [status]: 1 test(s), e.g. "own: std / codegen M45 rotationY4 rotates +x by +90 degrees about y onto -z (right-handed)"
  - inv-mul-paths / investigations/mul-paths/matrix-ctors.test.ts [status]: 2 test(s), e.g. "[TypeGPU] matrix constructors: CPU (f64 trig) and GPU runtime vs f64 oracle rotationY4"

## M46 std.insertBits emits the base value and the inserted bits swapped

- **lavapipe**: DETECTED-value, 16 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.insertBits on i32"
  - inv-bitops / investigations/bitops/extract-insert-overflow.test.ts [value]: 4 test(s), e.g. "[observation] offset+count > 32 with runtime values std.insertBits on i32 (offset+count>32 region only)"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.insertBits on i32"
- **swiftshader**: DETECTED-value, 16 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.insertBits on i32"
  - inv-bitops / investigations/bitops/extract-insert-overflow.test.ts [value]: 4 test(s), e.g. "[observation] offset+count > 32 with runtime values std.insertBits on i32 (offset+count>32 region only)"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.insertBits on i32"
- **metal**: DETECTED-value, 16 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.insertBits on i32"
  - inv-bitops / investigations/bitops/extract-insert-overflow.test.ts [value]: 4 test(s), e.g. "[observation] offset+count > 32 with runtime values std.insertBits on i32 (offset+count>32 region only)"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.insertBits on i32"

## M47 std.firstLeadingBit emits firstTrailingBit

- **lavapipe**: DETECTED-value, 14 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.firstLeadingBit o"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.firstLeadingBit on i32"
  - inv-scalar-int / investigations/scalar-int/scalar-bits.test.ts [status]: 2 test(s), e.g. "[observation] integer bit builtins: GPU == standard definition; no CPU implementation (API limitation) std.fir"
- **swiftshader**: DETECTED-value, 14 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.firstLeadingBit o"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.firstLeadingBit on i32"
  - inv-scalar-int / investigations/scalar-int/scalar-bits.test.ts [status]: 2 test(s), e.g. "[observation] integer bit builtins: GPU == standard definition; no CPU implementation (API limitation) std.fir"
- **metal**: DETECTED-value, 14 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.firstLeadingBit o"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.firstLeadingBit on i32"
  - inv-scalar-int / investigations/scalar-int/scalar-bits.test.ts [status]: 2 test(s), e.g. "[observation] integer bit builtins: GPU == standard definition; no CPU implementation (API limitation) std.fir"

## M48 std.countTrailingZeros emits firstTrailingBit

- **lavapipe**: DETECTED-value, 14 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.countTrailingZero"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.countTrailingZeros on i32"
  - inv-scalar-int / investigations/scalar-int/scalar-bits.test.ts [status]: 2 test(s), e.g. "[observation] integer bit builtins: GPU == standard definition; no CPU implementation (API limitation) std.cou"
- **swiftshader**: DETECTED-value, 14 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.countTrailingZero"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.countTrailingZeros on i32"
  - inv-scalar-int / investigations/scalar-int/scalar-bits.test.ts [status]: 2 test(s), e.g. "[observation] integer bit builtins: GPU == standard definition; no CPU implementation (API limitation) std.cou"
- **metal**: DETECTED-value, 14 detecting tests
  - inv-bitops / investigations/bitops/const-fold.test.ts [status]: 4 test(s), e.g. "[constants] captured constants: TypeGPU folding / Dawn const-evaluation vs BigInt oracle std.countTrailingZero"
  - inv-bitops / investigations/bitops/runtime-diff.test.ts [status]: 8 test(s), e.g. "[runtime] CPU vs GPU vs BigInt oracle std.countTrailingZeros on i32"
  - inv-scalar-int / investigations/scalar-int/scalar-bits.test.ts [status]: 2 test(s), e.g. "[observation] integer bit builtins: GPU == standard definition; no CPU implementation (API limitation) std.cou"

## M49 std.dot4U8Packed emits dot4I8Packed

- **lavapipe**: DETECTED-value, 2 detecting tests
  - inv-bitops / investigations/bitops/packed-int.test.ts [status]: 1 test(s), e.g. "[runtime] packed integer functions: CPU vs GPU vs BigInt oracle dot4U8Packed"
  - inv-bitops / investigations/bitops/packed-int.test.ts [value]: 1 test(s), e.g. "[constants] packed integer functions with captured constants fold / const-eval agree with the oracle (spot che"
- **swiftshader**: DETECTED-value, 2 detecting tests
  - inv-bitops / investigations/bitops/packed-int.test.ts [status]: 1 test(s), e.g. "[runtime] packed integer functions: CPU vs GPU vs BigInt oracle dot4U8Packed"
  - inv-bitops / investigations/bitops/packed-int.test.ts [value]: 1 test(s), e.g. "[constants] packed integer functions with captured constants fold / const-eval agree with the oracle (spot che"
- **metal**: DETECTED-value, 2 detecting tests
  - inv-bitops / investigations/bitops/packed-int.test.ts [status]: 1 test(s), e.g. "[runtime] packed integer functions: CPU vs GPU vs BigInt oracle dot4U8Packed"
  - inv-bitops / investigations/bitops/packed-int.test.ts [value]: 1 test(s), e.g. "[constants] packed integer functions with captured constants fold / const-eval agree with the oracle (spot che"

## M50 std.trunc emits floor

- **lavapipe**: DETECTED-value, 9 detecting tests
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 4 test(s), e.g. "constant-folded vs runtime: sampled rows of every function trunc f32"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [status]: 1 test(s), e.g. "targeted constant-expression cases [API limitation] round(vec) / trunc / faceForward / refract with constant a"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 4 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle trunc f32"
- **swiftshader**: DETECTED-value, 9 detecting tests
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 4 test(s), e.g. "constant-folded vs runtime: sampled rows of every function trunc f32"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [status]: 1 test(s), e.g. "targeted constant-expression cases [API limitation] round(vec) / trunc / faceForward / refract with constant a"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 4 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle trunc f32"
- **metal**: DETECTED-value, 9 detecting tests
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [value]: 4 test(s), e.g. "constant-folded vs runtime: sampled rows of every function trunc f32"
  - inv-vector-fns / investigations/vector-fns/const-fold.test.ts [status]: 1 test(s), e.g. "targeted constant-expression cases [API limitation] round(vec) / trunc / faceForward / refract with constant a"
  - inv-vector-fns / investigations/vector-fns/runtime-matrix.test.ts [status]: 4 test(s), e.g. "runtime matrix: CPU vs GPU vs oracle trunc f32"
