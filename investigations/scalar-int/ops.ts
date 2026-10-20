import { d, std } from 'typegpu';
import { type Any, type K, wgslDiv, wgslRem, wrapK } from './lib.ts';

export interface Op {
  name: string;
  fn: Any;
  ins: (T: 'i32' | 'u32') => K[];
  out: (T: 'i32' | 'u32') => K;
  types: ('i32' | 'u32')[];
  oracle: (T: 'i32' | 'u32', args: bigint[]) => bigint | null;
  skip?: (T: 'i32' | 'u32', args: bigint[]) => boolean;
  contract: string;
}

const same2 = (T: 'i32' | 'u32'): K[] => [T, T];
const sameT = (T: 'i32' | 'u32'): K => T;
const exact = (T: 'i32' | 'u32', x: bigint) => BigInt(wrapK(T, x));

const bin = (name: string, fn: Any, f: (a: bigint, b: bigint) => bigint, contract = '[TypeGPU] same as WGSL (wrap-around)'): Op => ({
  name, fn, ins: same2, out: sameT, types: ['i32', 'u32'], oracle: (T, [a, b]) => exact(T, f(a!, b!)), contract,
});

const shiftArgs = (T: 'i32' | 'u32'): K[] => [T, 'u32'];

export const OPS: Op[] = [
  bin('a + b', (a: Any, b: Any) => { 'use gpu'; return a + b; }, (a, b) => a + b),
  bin('std.add', (a: Any, b: Any) => { 'use gpu'; return std.add(a, b); }, (a, b) => a + b),
  bin('a - b', (a: Any, b: Any) => { 'use gpu'; return a - b; }, (a, b) => a - b),
  bin('std.sub', (a: Any, b: Any) => { 'use gpu'; return std.sub(a, b); }, (a, b) => a - b),
  bin('a * b', (a: Any, b: Any) => { 'use gpu'; return a * b; }, (a, b) => a * b),
  bin('std.mul', (a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); }, (a, b) => a * b),
  bin('x += b', (a: Any, b: Any) => { 'use gpu'; let x = a; x += b; return x; }, (a, b) => a + b),
  bin('x -= b', (a: Any, b: Any) => { 'use gpu'; let x = a; x -= b; return x; }, (a, b) => a - b),
  bin('x *= b', (a: Any, b: Any) => { 'use gpu'; let x = a; x *= b; return x; }, (a, b) => a * b),
  {
    name: 'x++', fn: (a: Any, _b: Any) => { 'use gpu'; let x = a; x++; return x; }, ins: same2, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a]) => exact(T, a! + 1n), contract: '[TypeGPU] same as WGSL (wrap-around)',
  },
  {
    name: 'x--', fn: (a: Any, _b: Any) => { 'use gpu'; let x = a; x--; return x; }, ins: same2, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a]) => exact(T, a! - 1n), contract: '[TypeGPU] same as WGSL (wrap-around)',
  },
  bin('std.min', (a: Any, b: Any) => { 'use gpu'; return std.min(a, b); }, (a, b) => (a < b ? a : b)),
  bin('std.max', (a: Any, b: Any) => { 'use gpu'; return std.max(a, b); }, (a, b) => (a > b ? a : b)),
  {
    name: 'a % b', fn: (a: Any, b: Any) => { 'use gpu'; return a % b; }, ins: same2, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a, b]) => wgslRem(T, a!, b!), contract: '[TypeGPU] `%` is emitted as WGSL integer % (not f32-wrapped)',
  },
  {
    name: 'x %= b', fn: (a: Any, b: Any) => { 'use gpu'; let x = a; x %= b; return x; }, ins: same2, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a, b]) => wgslRem(T, a!, b!), contract: '[TypeGPU] `%=` is emitted as WGSL integer %=',
  },
  {
    name: 'std.mod', fn: (a: Any, b: Any) => { 'use gpu'; return std.mod(a, b); }, ins: same2, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a, b]) => wgslRem(T, a!, b!), contract: '[TypeGPU] scalar std.mod is compiled to T(f32(a) % f32(b))',
    skip: (_T, [_a, b]) => b === 0n,
  },
  {
    name: 'a / b -> f32', fn: (a: Any, b: Any) => { 'use gpu'; return a / b; }, ins: same2, out: () => 'f32', types: ['i32', 'u32'],
    oracle: () => null, contract: '[TypeGPU] documented: scalar integer / is f32(a) / f32(b)', skip: (_T, [_a, b]) => b === 0n,
  },
  {
    name: 'T(a / b)', fn: (a: Any, b: Any) => { 'use gpu'; return a / b; }, ins: same2, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a, b]) => wgslDiv(T, a!, b!), contract: '[TypeGPU] a / b is f32 then converted (i32(f32(a)/f32(b)))',
    skip: (_T, [_a, b]) => b === 0n,
  },
  {
    name: 'std.div -> T', fn: (a: Any, b: Any) => { 'use gpu'; return std.div(a, b); }, ins: same2, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a, b]) => wgslDiv(T, a!, b!), contract: '[TypeGPU] std.div scalar is f32(a) / f32(b)', skip: (_T, [_a, b]) => b === 0n,
  },
  {
    name: 'x /= b', fn: (a: Any, b: Any) => { 'use gpu'; let x = a; x /= b; return x; }, ins: same2, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a, b]) => wgslDiv(T, a!, b!), contract: '[TypeGPU] ??? compound `/=` is emitted as WGSL integer /= (not f32-wrapped)',
  },
  {
    name: 'std.intdiv', fn: (a: Any, b: Any) => { 'use gpu'; return std.intdiv(a, b); }, ins: same2, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a, b]) => wgslDiv(T, a!, b!), contract: '[TypeGPU] std.intdiv is WGSL integer /',
  },
  bin('a & b', (a: Any, b: Any) => { 'use gpu'; return a & b; }, (a, b) => a & b),
  bin('a | b', (a: Any, b: Any) => { 'use gpu'; return a | b; }, (a, b) => a | b),
  bin('a ^ b', (a: Any, b: Any) => { 'use gpu'; return a ^ b; }, (a, b) => a ^ b),
  {
    name: 'a << b', fn: (a: Any, b: Any) => { 'use gpu'; return a << b; }, ins: shiftArgs, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a, b]) => exact(T, a! << (b! & 31n)), contract: '[WGSL] shift count modulo 32',
  },
  {
    name: 'a >> b (i32)', fn: (a: Any, b: Any) => { 'use gpu'; return a >> b; }, ins: shiftArgs, out: sameT, types: ['i32'],
    oracle: (_T, [a, b]) => BigInt.asIntN(32, a!) >> (b! & 31n), contract: '[WGSL] arithmetic shift on i32',
  },
  {
    name: 'a >> b (u32, deprecated)', fn: (a: Any, b: Any) => { 'use gpu'; return a >> b; }, ins: shiftArgs, out: sameT, types: ['u32'],
    oracle: (_T, [a, b]) => BigInt.asUintN(32, a!) >> (b! & 31n), contract: '[TypeGPU] u32 `>>` deprecated in favour of `>>>`',
  },
  {
    name: 'a >>> b (u32)', fn: (a: Any, b: Any) => { 'use gpu'; return a >>> b; }, ins: shiftArgs, out: sameT, types: ['u32'],
    oracle: (_T, [a, b]) => BigInt.asUintN(32, a!) >> (b! & 31n), contract: '[TypeGPU] `>>>` is logical shift, u32 only',
  },
  {
    name: 'a <<= b', fn: (a: Any, b: Any) => { 'use gpu'; let x = a; x <<= b; return x; }, ins: shiftArgs, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a, b]) => exact(T, a! << (b! & 31n)), contract: '[WGSL] shift count modulo 32',
  },
  {
    name: 'a >>>= b (u32)', fn: (a: Any, b: Any) => { 'use gpu'; let x = a; x >>>= b; return x; }, ins: shiftArgs, out: sameT, types: ['u32'],
    oracle: (_T, [a, b]) => BigInt.asUintN(32, a!) >> (b! & 31n), contract: '[TypeGPU] `>>>=` logical shift',
  },
  {
    name: 'a &= b', fn: (a: Any, b: Any) => { 'use gpu'; let x = a; x &= b; return x; }, ins: same2, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a, b]) => exact(T, a! & b!), contract: '[TypeGPU] same as WGSL',
  },
  {
    name: 'a |= b', fn: (a: Any, b: Any) => { 'use gpu'; let x = a; x |= b; return x; }, ins: same2, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a, b]) => exact(T, a! | b!), contract: '[TypeGPU] same as WGSL',
  },
  {
    name: 'a ^= b', fn: (a: Any, b: Any) => { 'use gpu'; let x = a; x ^= b; return x; }, ins: same2, out: sameT, types: ['i32', 'u32'],
    oracle: (T, [a, b]) => exact(T, a! ^ b!), contract: '[TypeGPU] same as WGSL',
  },
];

const un = (name: string, fn: Any, types: ('i32' | 'u32')[], f: (T: 'i32' | 'u32', a: bigint) => bigint, contract: string): Op => ({
  name, fn, ins: (T) => [T], out: sameT, types, oracle: (T, [a]) => f(T, a!), contract,
});
export const UNARY: Op[] = [
  un('-a', (a: Any) => { 'use gpu'; return -a; }, ['i32'], (T, a) => exact(T, -a), '[WGSL] -MIN = MIN (8.8)'),
  un('std.neg', (a: Any) => { 'use gpu'; return std.neg(a); }, ['i32'], (T, a) => exact(T, -a), '[WGSL] -MIN = MIN (8.8)'),
  un('std.abs', (a: Any) => { 'use gpu'; return std.abs(a); }, ['i32', 'u32'], (T, a) => exact(T, a < 0n ? -a : a), '[WGSL] abs(MIN) = MIN'),
  un('std.sign', (a: Any) => { 'use gpu'; return std.sign(a); }, ['i32'], (_T, a) => (a > 0n ? 1n : a < 0n ? -1n : 0n), '[WGSL] sign'),
  un('~a', (a: Any) => { 'use gpu'; return ~a; }, ['i32', 'u32'], (T, a) => exact(T, ~a), '[WGSL] 8.10 bitwise complement'),
  un('d.i32(a) / d.u32(a) identity', (a: Any) => { 'use gpu'; return a; }, ['i32', 'u32'], (_T, a) => a, 'identity'),
];

export const TERNARY: Op[] = [
  {
    name: 'std.clamp', fn: (a: Any, b: Any, c: Any) => { 'use gpu'; return std.clamp(a, b, c); }, ins: (T) => [T, T, T], out: sameT, types: ['i32', 'u32'],
    oracle: (_T, [a, lo, hi]) => { const m = a! > lo! ? a! : lo!; return m < hi! ? m : hi!; }, contract: '[WGSL] integer clamp = min(max(e, low), high)',
  },
];

export interface Conv { name: string; from: K; to: K; fn: Any; oracle: (v: number) => bigint | number | null }
const sat = (lo: number, hi: number, x: number) => Math.min(Math.max(Math.trunc(x), lo), hi);
export const CONVS: Conv[] = [
  { name: 'd.i32(u32)', from: 'u32', to: 'i32', fn: (a: Any) => { 'use gpu'; return d.i32(a); }, oracle: (v) => Number(BigInt.asIntN(32, BigInt(v))) },
  { name: 'd.u32(i32)', from: 'i32', to: 'u32', fn: (a: Any) => { 'use gpu'; return d.u32(a); }, oracle: (v) => Number(BigInt.asUintN(32, BigInt(v))) },
  { name: 'd.f32(i32)', from: 'i32', to: 'f32', fn: (a: Any) => { 'use gpu'; return d.f32(a); }, oracle: () => null },
  { name: 'd.f32(u32)', from: 'u32', to: 'f32', fn: (a: Any) => { 'use gpu'; return d.f32(a); }, oracle: () => null },
  { name: 'd.i32(f32)', from: 'f32', to: 'i32', fn: (a: Any) => { 'use gpu'; return d.i32(a); }, oracle: (v) => (Number.isFinite(v) ? sat(-(2 ** 31), 2 ** 31 - 1, v) : null) },
  { name: 'd.u32(f32)', from: 'f32', to: 'u32', fn: (a: Any) => { 'use gpu'; return d.u32(a); }, oracle: (v) => (Number.isFinite(v) ? sat(0, 2 ** 32 - 1, v) : null) },
];
