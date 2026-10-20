import { std } from 'typegpu';
import { f16round, fround, i32, u32w, uniform, uniformInt, ulp32 } from './num.ts';
import * as P from './policy.ts';
import { F16_TYPES, FLOAT_TYPES, I32_TYPES, TY, U32_TYPES, shiftAmountType, type TypeDesc } from './types.ts';

type Any = any;
export type Fn = (...a: Any[]) => Any;
export type Semantics = 'WGSL' | 'TypeGPU' | 'implementation-specific';

export interface OpSpec {
  name: string;
  semantics: Semantics;
  group: 'float' | 'int' | 'f16';
  arity: 1 | 2;
  types: string[];
  fn: (t: TypeDesc) => Fn;
  argTypes?: (t: TypeDesc) => TypeDesc[];
  lists: (t: TypeDesc) => number[][];
  oracle: (args: number[], t: TypeDesc) => number;
  policy: (t: TypeDesc) => P.Policy;
  cpuDivergence?: (t: TypeDesc) => string | undefined;
}

const add = (a: Any, b: Any) => { 'use gpu'; return std.add(a, b); };
const sub = (a: Any, b: Any) => { 'use gpu'; return std.sub(a, b); };
const mul = (a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); };
const div = (a: Any, b: Any) => { 'use gpu'; return std.div(a, b); };
const mod = (a: Any, b: Any) => { 'use gpu'; return std.mod(a, b); };
const rem = (a: Any, b: Any) => { 'use gpu'; return a % b; };
const min = (a: Any, b: Any) => { 'use gpu'; return std.min(a, b); };
const max = (a: Any, b: Any) => { 'use gpu'; return std.max(a, b); };
const neg = (a: Any) => { 'use gpu'; return std.neg(a); };
const intdiv = (a: Any, b: Any) => { 'use gpu'; return std.intdiv(a, b); };
const sqrt = (a: Any) => { 'use gpu'; return std.sqrt(a); };
const inverseSqrt = (a: Any) => { 'use gpu'; return std.inverseSqrt(a); };
const sin = (a: Any) => { 'use gpu'; return std.sin(a); };
const cos = (a: Any) => { 'use gpu'; return std.cos(a); };
const exp = (a: Any) => { 'use gpu'; return std.exp(a); };
const exp2 = (a: Any) => { 'use gpu'; return std.exp2(a); };
const log = (a: Any) => { 'use gpu'; return std.log(a); };
const log2 = (a: Any) => { 'use gpu'; return std.log2(a); };
const tanh = (a: Any) => { 'use gpu'; return std.tanh(a); };
const pow = (a: Any, b: Any) => { 'use gpu'; return std.pow(a, b); };
const shlS = (a: Any, b: Any) => { 'use gpu'; return a << b; };
const shrS = (a: Any, b: Any) => { 'use gpu'; return a >> b; };
const shlV = (a: Any, b: Any) => { 'use gpu'; return std.bitShiftLeft(a, b); };
const shrV = (a: Any, b: Any) => { 'use gpu'; return std.bitShiftRight(a, b); };

const F32_EDGE = [
  0, -0, 1, -1, 0.5, -0.5, 2, -2, 3, 0.1, -0.1, 0.3, 1 + 2 ** -23, 1 - 2 ** -24, 16777216, 123.456, 65504,
  3.4028234663852886e38, -3.4028234663852886e38, 1.1754943508222875e-38, 1e-40, -1e-40, 1e-30, NaN, Infinity, -Infinity,
].map(fround);
const f32Ordinary = (seed: number, lo = -100, hi = 100) => uniform(24, lo, hi, seed);
const I32_EDGE = [0, 1, -1, 2, -2, 3, 7, -7, 31, 32, 255, 65535, 65536, 46341, 1073741824, -1073741824, 2147483647, -2147483648, -2147483647];
const U32_EDGE = [0, 1, 2, 3, 7, 31, 32, 255, 65535, 65536, 2147483647, 2147483648, 4294967294, 4294967295];
const SHIFT_AMOUNTS = [0, 1, 2, 4, 15, 16, 31, 32, 33, 63];
const F16_EDGE = [0, -0, 1, -1, 0.5, 2, 1.0009765625, 65504, -65504, 6.103515625e-5, 2048, 3, 0.1].map(f16round);

const floatList = (...extra: number[][]) => [...F32_EDGE, ...extra.flat()];
const intList = (t: TypeDesc) => (t.elem === 'i32' ? [...I32_EDGE, ...uniformInt(16, -1000, 1000, 5)] : [...U32_EDGE, ...uniformInt(16, 0, 1000, 6)]);

const isF32 = (t: TypeDesc) => t.elem === 'f32';
const scalarIntReason = (t: TypeDesc) =>
  !t.vec ? 'TypeGPU evaluates scalar i32/u32 on the CPU as plain JS numbers (no wrap-around, float division, signed shifts)' : undefined;

const mulReason = 'CONFIRMED DEFECT #1 (investigations/integer-mul/FINDINGS.md): TypeGPU CPU integer multiply goes through f64 (no Math.imul): wrong whenever the exact product exceeds 2^53, e.g. vec2i(2147483647) * vec2i(2147483647) -> 0, expected 1';
const same = (t: TypeDesc) => [t, t];

export const OPS: OpSpec[] = [
  ...(['add', 'sub', 'mul'] as const).map((name): OpSpec => {
    const f = { add, sub, mul }[name];
    const o = { add: (a: number, b: number) => a + b, sub: (a: number, b: number) => a - b, mul: (a: number, b: number) => a * b }[name];
    return { name, semantics: 'WGSL', group: 'float', arity: 2, types: FLOAT_TYPES, fn: () => f, argTypes: same,
      lists: () => [floatList(f32Ordinary(1)), floatList(f32Ordinary(2))], oracle: ([a, b]) => o(a!, b!),
      policy: () => P.correctlyRounded(fround) };
  }),
  { name: 'div', semantics: 'WGSL', group: 'float', arity: 2, types: FLOAT_TYPES, fn: () => div, argTypes: same,
    lists: () => [floatList(f32Ordinary(3)), floatList(f32Ordinary(4))], oracle: ([a, b]) => a! / b!,
    policy: () => P.ulpBound('div-2.5ulp', 'WGSL: x / y is accurate to 2.5 ULP for |y| in [2^-126, 2^126]', () => 2.5,
      { domain: ([, y]) => (Math.abs(y!) < 2 ** -126 || Math.abs(y!) > 2 ** 126 ? '|y| outside [2^-126, 2^126]' : null) }) },
  ...(['min', 'max'] as const).map((name): OpSpec => ({ name, semantics: 'WGSL', group: 'float', arity: 2, types: FLOAT_TYPES,
    fn: () => (name === 'min' ? min : max), argTypes: same, lists: () => [floatList(f32Ordinary(7)), floatList(f32Ordinary(8))],
    oracle: ([a, b]) => (name === 'min' ? Math.min(a!, b!) : Math.max(a!, b!)), policy: () => P.exactSelect })),
  { name: 'mod', semantics: 'WGSL', group: 'float', arity: 2, types: FLOAT_TYPES, fn: () => mod, argTypes: same,
    lists: () => [floatList(f32Ordinary(31), [0.5, 1.5, 3, 6, 9, 10, 691, 1382, 2073].map(fround)), floatList(f32Ordinary(32), [0.5, 1.5, 3, 6, 9, 10, 691, 1382, 2073].map(fround))],
    oracle: ([a, b]) => a! % b!, policy: () => P.floatRemainder },
  { name: 'neg', semantics: 'WGSL', group: 'float', arity: 1, types: FLOAT_TYPES, fn: () => neg, lists: () => [floatList(f32Ordinary(9))],
    oracle: ([a]) => -a!, policy: () => P.exactSelect },
  { name: 'sqrt', semantics: 'WGSL', group: 'float', arity: 1, types: FLOAT_TYPES, fn: () => sqrt,
    lists: () => [floatList(uniform(24, 0.001, 1000, 11), [4, 0.25, 1e30, 1.1754943508222875e-38].map(fround))], oracle: ([a]) => Math.sqrt(a!), policy: () => P.sqrtDerived },
  { name: 'inverseSqrt', semantics: 'WGSL', group: 'float', arity: 1, types: FLOAT_TYPES, fn: () => inverseSqrt,
    lists: () => [floatList(uniform(24, 0.001, 1000, 12), [4, 0.25].map(fround))], oracle: ([a]) => 1 / Math.sqrt(a!),
    policy: () => P.ulpBound('inverseSqrt-2ulp', 'WGSL: inverseSqrt is accurate to 2 ULP', () => 2, { domain: ([x]) => (x! <= 0 ? 'x <= 0' : null) }) },
  ...(['sin', 'cos'] as const).map((name): OpSpec => ({ name, semantics: 'WGSL', group: 'float', arity: 1, types: FLOAT_TYPES, fn: () => (name === 'sin' ? sin : cos),
    lists: () => [[0, -0, Math.PI, -Math.PI, Math.PI / 2, 1e-30, 1e-40, 0.5, 1, 2, 3, -3, 3.1415927, 10, 100, 1e6, NaN, Infinity].map(fround).concat(uniform(24, -Math.PI, Math.PI, name === 'sin' ? 13 : 14))],
    oracle: ([a]) => (name === 'sin' ? Math.sin(a!) : Math.cos(a!)),
    policy: () => P.absBound(`${name}-abs-2^-11`, `WGSL: ${name} has absolute error <= 2^-11 for x in [-pi, pi] (no bound is stated elsewhere)`, 2 ** -11,
      ([x]) => (Math.abs(x!) > Math.PI ? '|x| > pi' : null)) })),
  ...(['exp', 'exp2'] as const).map((name): OpSpec => ({ name, semantics: 'WGSL', group: 'float', arity: 1, types: FLOAT_TYPES, fn: () => (name === 'exp' ? exp : exp2),
    lists: () => [[0, -0, 1, -1, 0.5, 10, -10, 50, 88, 89, -87, -100, 1e-10, 127, 128, -126, -149, NaN].map(fround).concat(uniform(24, -20, 20, name === 'exp' ? 15 : 16))],
    oracle: ([a]) => (name === 'exp' ? Math.exp(a!) : 2 ** a!),
    policy: () => P.ulpBound(`${name}-3+2|x|ulp`, `WGSL: ${name} is accurate to 3 + 2*|x| ULP`, ([x]) => 3 + 2 * Math.abs(x!)) })),
  ...(['log', 'log2'] as const).map((name): OpSpec => ({ name, semantics: 'WGSL', group: 'float', arity: 1, types: FLOAT_TYPES, fn: () => (name === 'log' ? log : log2),
    lists: () => [[1, 0.5, 2, 1.0000001, 0.9999999, Math.E, 10, 1e-10, 1e-38, 1e38, 3.4028234663852886e38, 0, -1, 1e-40, NaN, Infinity].map(fround)
      .concat(uniform(24, 0.001, 1000, 17), uniform(12, 0.5, 2, 18))],
    oracle: ([a]) => (name === 'log' ? Math.log(a!) : Math.log2(a!)), policy: () => P.logPolicy })),
  { name: 'tanh', semantics: 'WGSL', group: 'float', arity: 1, types: FLOAT_TYPES, fn: () => tanh,
    lists: () => [[0, -0, 1, -1, 0.5, 5, 10, 20, -20, 1e-30, 1e-8, NaN].map(fround).concat(uniform(24, -5, 5, 19))], oracle: ([a]) => Math.tanh(a!),
    policy: () => P.absBound('tanh-abs-1e-5', 'WGSL: tanh error is the worse of abs 1e-5 and an inherited bound; abs <= 1e-5 is sufficient, exceeding it is inconclusive', 1e-5, undefined, 'investigate') },
  { name: 'pow', semantics: 'WGSL', group: 'float', arity: 2, types: FLOAT_TYPES, fn: () => pow, argTypes: same,
    lists: () => [[1, 2, 3, 0.5, 10, 0.1, 1.5, 3.3, 0, -2, 100, 1e-5].map(fround).concat(uniform(12, 0.5, 8, 20)), [0, 1, -1, 2, 0.5, 3, -2, 2.5, 3.5, 10, -10, 0.3].map(fround).concat(uniform(12, -3, 3, 21))],
    oracle: ([a, b]) => Math.pow(a!, b!), policy: () => P.powDerived },

  ...(['add', 'sub', 'mul'] as const).map((name): OpSpec => ({ name, semantics: 'WGSL', group: 'int', arity: 2, types: [...I32_TYPES, ...U32_TYPES], fn: () => ({ add, sub, mul })[name], argTypes: same,
    lists: (t) => [intList(t), intList(t)],
    oracle: ([a, b], t) => {
      const w = t.elem === 'i32' ? i32 : u32w;
      return name === 'add' ? w(a! + b!) : name === 'sub' ? w(a! - b!) : w(Math.imul(a!, b!));
    },
    policy: () => P.exactInt, cpuDivergence: (t) => (!t.vec ? scalarIntReason(t) : name === 'mul' ? mulReason : undefined) })),
  { name: 'intdiv', semantics: 'TypeGPU', group: 'int', arity: 2, types: [...I32_TYPES, ...U32_TYPES], fn: () => intdiv, argTypes: same, lists: (t) => [intList(t), intList(t)],
    oracle: ([a, b], t) => {
      if (b === 0) return a!;
      if (t.elem === 'i32' && a === -2147483648 && b === -1) return a!;
      return Number(BigInt(a!) / BigInt(b!));
    },
    policy: () => P.exactInt, cpuDivergence: scalarIntReason },
  { name: 'div', semantics: 'TypeGPU', group: 'int', arity: 2, types: [...I32_TYPES, ...U32_TYPES], fn: () => div, argTypes: same, lists: (t) => [intList(t), intList(t)],
    oracle: ([a, b], t) => (t.vec ? (b === 0 || (t.elem === 'i32' && a === -2147483648 && b === -1) ? a! : Number(BigInt(a!) / BigInt(b!))) : b === 0 ? 0 : Number(BigInt(a!) / BigInt(b!))),
    policy: (t) => (t.vec ? P.exactInt : P.intViaF32('div')), cpuDivergence: scalarIntReason },
  { name: 'mod', semantics: 'TypeGPU', group: 'int', arity: 2, types: [...I32_TYPES, ...U32_TYPES], fn: () => mod, argTypes: same, lists: (t) => [intList(t), intList(t)],
    oracle: ([a, b], t) => (t.vec ? (b === 0 || (t.elem === 'i32' && a === -2147483648 && b === -1) ? 0 : (a! % b!) + 0) : b === 0 ? 0 : (a! % b!) + 0),
    policy: (t) => (t.vec ? P.exactInt : P.intViaF32('mod')), cpuDivergence: scalarIntReason },
  { name: 'remainder(%)', semantics: 'WGSL', group: 'int', arity: 2, types: [...I32_TYPES, ...U32_TYPES], fn: () => rem, argTypes: same, lists: (t) => [intList(t), intList(t)],
    oracle: ([a, b], t) => (b === 0 || (t.elem === 'i32' && a === -2147483648 && b === -1) ? 0 : (a! % b!) + 0),
    policy: () => P.exactInt, cpuDivergence: scalarIntReason },
  ...(['min', 'max'] as const).map((name): OpSpec => ({ name, semantics: 'WGSL', group: 'int', arity: 2, types: [...I32_TYPES, ...U32_TYPES], fn: () => (name === 'min' ? min : max), argTypes: same,
    lists: (t) => [intList(t), intList(t)], oracle: ([a, b]) => (name === 'min' ? Math.min(a!, b!) : Math.max(a!, b!)), policy: () => P.exactInt })),
  { name: 'neg', semantics: 'WGSL', group: 'int', arity: 1, types: I32_TYPES, fn: () => neg, lists: (t) => [intList(t)],
    oracle: ([a]) => (-a!) | 0 , policy: () => P.exactInt, cpuDivergence: scalarIntReason },
  ...(['shl', 'shr'] as const).map((name): OpSpec => ({ name: `bitShift${name === 'shl' ? 'Left' : 'Right'}`, semantics: 'WGSL', group: 'int', arity: 2, types: [...I32_TYPES, ...U32_TYPES],
    fn: (t) => (t.vec ? (name === 'shl' ? shlV : shrV) : name === 'shl' ? shlS : shrS), argTypes: (t) => [t, shiftAmountType(t)],
    lists: (t) => [intList(t), SHIFT_AMOUNTS],
    oracle: ([a, s], t) => {
      const k = s! & 31;
      if (name === 'shl') return t.elem === 'i32' ? (a! << k) | 0 : (a! << k) >>> 0;
      return t.elem === 'i32' ? a! >> k : a! >>> k;
    },
    policy: () => P.exactInt, cpuDivergence: scalarIntReason })),

  ...(['add', 'sub', 'mul'] as const).map((name): OpSpec => ({ name, semantics: 'WGSL', group: 'f16', arity: 2, types: F16_TYPES, fn: () => ({ add, sub, mul })[name], argTypes: same,
    lists: () => [F16_EDGE, F16_EDGE],
    oracle: ([a, b]) => (name === 'add' ? a! + b! : name === 'sub' ? a! - b! : a! * b!),
    policy: () => P.correctlyRounded(f16round, 2 ** -14) })),
];

export const typeOf = (name: string) => TY[name]!;
export { ulp32 };
