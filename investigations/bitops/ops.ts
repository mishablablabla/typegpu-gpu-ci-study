import { std } from 'typegpu';
import { COUNTS, OFFSETS, SHIFT_AMOUNTS, SHIFT_VALUES_I, SHIFT_VALUES_U, valuesOf, td, O, type Any, type Elem, type TD } from './lib.ts';

export interface OpDef {
  name: string;
  form: string;
  fn: Any;
  types: string[];
  argTs: (t: TD) => TD[];
  lists: (t: TD) => number[][];
  oracle: (e: Elem, args: number[]) => number;
  cpuExpected: 'impl' | 'noimpl';
  unverified?: (args: number[]) => boolean;
  outT?: (t: TD) => TD;
}

const I = ['i32', 'vec2i', 'vec3i', 'vec4i'], U = ['u32', 'vec2u', 'vec3u', 'vec4u'], IU = [...I, ...U];
const sameT = (t: TD) => [t];
const one = (t: TD) => [valuesOf(t.elem)];
const two = (t: TD) => [valuesOf(t.elem), valuesOf(t.elem)];
const scalarU = (t: TD) => td(t.lanes === 1 ? 'u32' : `vec${t.lanes}u`);

const countOneBits = (a: Any) => { 'use gpu'; return std.countOneBits(a); };
const reverseBits = (a: Any) => { 'use gpu'; return std.reverseBits(a); };
const countLeadingZeros = (a: Any) => { 'use gpu'; return std.countLeadingZeros(a); };
const countTrailingZeros = (a: Any) => { 'use gpu'; return std.countTrailingZeros(a); };
const firstLeadingBit = (a: Any) => { 'use gpu'; return std.firstLeadingBit(a); };
const firstTrailingBit = (a: Any) => { 'use gpu'; return std.firstTrailingBit(a); };
const abs = (a: Any) => { 'use gpu'; return std.abs(a); };
const sign = (a: Any) => { 'use gpu'; return std.sign(a); };
const bnot = (a: Any) => { 'use gpu'; return ~a; };
const band = (a: Any, b: Any) => { 'use gpu'; return a & b; };
const bor = (a: Any, b: Any) => { 'use gpu'; return a | b; };
const bxor = (a: Any, b: Any) => { 'use gpu'; return a ^ b; };
const shl = (a: Any, s: Any) => { 'use gpu'; return a << s; };
const shr = (a: Any, s: Any) => { 'use gpu'; return a >> s; };
const ushr = (a: Any, s: Any) => { 'use gpu'; return a >>> s; };
const stdShl = (a: Any, s: Any) => { 'use gpu'; return std.bitShiftLeft(a, s); };
const stdShr = (a: Any, s: Any) => { 'use gpu'; return std.bitShiftRight(a, s); };
const stdMin = (a: Any, b: Any) => { 'use gpu'; return std.min(a, b); };
const stdMax = (a: Any, b: Any) => { 'use gpu'; return std.max(a, b); };
const clamp = (a: Any, lo: Any, hi: Any) => { 'use gpu'; return std.clamp(a, lo, hi); };
const extractBits = (a: Any, o: Any, c: Any) => { 'use gpu'; return std.extractBits(a, o, c); };
const insertBits = (a: Any, n: Any, o: Any, c: Any) => { 'use gpu'; return std.insertBits(a, n, o, c); };
const clz32 = (a: Any) => { 'use gpu'; return Math.clz32(a); };
const mathAbs = (a: Any) => { 'use gpu'; return Math.abs(a); };
const mathSign = (a: Any) => { 'use gpu'; return Math.sign(a); };
const select1 = (f: Any, t: Any, c: Any) => { 'use gpu'; return std.select(f, t, c !== 0); };

const shlEq = (a: Any, s: Any) => { 'use gpu'; let x = std.max(a, a); x <<= s; return x; };
const shrEq = (a: Any, s: Any) => { 'use gpu'; let x = std.max(a, a); x >>= s; return x; };
const ushrEq = (a: Any, s: Any) => { 'use gpu'; let x = std.max(a, a); x >>>= s; return x; };
const andEq = (a: Any, b: Any) => { 'use gpu'; let x = std.max(a, a); x &= b; return x; };
const orEq = (a: Any, b: Any) => { 'use gpu'; let x = std.max(a, a); x |= b; return x; };
const xorEq = (a: Any, b: Any) => { 'use gpu'; let x = std.max(a, a); x ^= b; return x; };
const bandMixed = (a: Any, b: Any) => { 'use gpu'; return a & b; };
const borMixed = (a: Any, b: Any) => { 'use gpu'; return a | b; };
const bxorMixed = (a: Any, b: Any) => { 'use gpu'; return a ^ b; };

const shiftLists = (t: TD) => [t.elem === 'i32' ? SHIFT_VALUES_I : SHIFT_VALUES_U, SHIFT_AMOUNTS];

export const OPS: OpDef[] = [
  ...([
    ['countOneBits', countOneBits, O.countOneBits], ['reverseBits', reverseBits, O.reverseBits], ['countLeadingZeros', countLeadingZeros, O.countLeadingZeros],
    ['countTrailingZeros', countTrailingZeros, O.countTrailingZeros], ['firstLeadingBit', firstLeadingBit, O.firstLeadingBit], ['firstTrailingBit', firstTrailingBit, O.firstTrailingBit],
  ] as const).map(([name, fn, oracle]): OpDef => ({ name: `std.${name}`, form: `std.${name}(x)`, fn, types: IU, argTs: sameT, lists: one, oracle: (e, a) => oracle(e, a), cpuExpected: 'noimpl' })),
  { name: 'std.abs', form: 'std.abs(x)', fn: abs, types: IU, argTs: sameT, lists: one, oracle: O.abs, cpuExpected: 'impl' },
  { name: 'std.sign', form: 'std.sign(x)', fn: sign, types: I, argTs: sameT, lists: one, oracle: O.sign, cpuExpected: 'impl' },
  { name: 'Math.abs', form: 'Math.abs(x) (mapped to std.abs)', fn: mathAbs, types: ['i32', 'u32'], argTs: sameT, lists: one, oracle: O.abs, cpuExpected: 'impl' },
  { name: 'Math.sign', form: 'Math.sign(x) (mapped to std.sign)', fn: mathSign, types: ['i32'], argTs: sameT, lists: one, oracle: O.sign, cpuExpected: 'impl' },
  { name: 'Math.clz32', form: 'Math.clz32(x) (mapped to std.countLeadingZeros)', fn: clz32, types: ['i32', 'u32'], argTs: sameT, lists: one, oracle: O.countLeadingZeros, cpuExpected: 'impl' },
  { name: '~x', form: '~x', fn: bnot, types: IU, argTs: sameT, lists: one, oracle: O.not, cpuExpected: 'impl' },
  { name: 'a & b', form: 'a & b', fn: band, types: IU, argTs: (t) => [t, t], lists: two, oracle: O.and, cpuExpected: 'impl' },
  { name: 'a | b', form: 'a | b', fn: bor, types: IU, argTs: (t) => [t, t], lists: two, oracle: O.or, cpuExpected: 'impl' },
  { name: 'a ^ b', form: 'a ^ b', fn: bxor, types: IU, argTs: (t) => [t, t], lists: two, oracle: O.xor, cpuExpected: 'impl' },
  { name: 'a << s', form: 'a << s (s: u32 / vecNu)', fn: shl, types: IU, argTs: (t) => [t, scalarU(t)], lists: shiftLists, oracle: O.shl, cpuExpected: 'impl' },
  { name: 'a >> s', form: 'a >> s (s: u32 / vecNu)', fn: shr, types: IU, argTs: (t) => [t, scalarU(t)], lists: shiftLists, oracle: O.shr, cpuExpected: 'impl' },
  { name: 'a >>> s', form: 'a >>> s (u32 only; emitted as >>)', fn: ushr, types: U, argTs: (t) => [t, scalarU(t)], lists: shiftLists, oracle: O.ushr, cpuExpected: 'impl' },
  { name: 'std.bitShiftLeft', form: 'std.bitShiftLeft(v, s) (vectors only)', fn: stdShl, types: ['vec2i', 'vec3i', 'vec4i', 'vec2u', 'vec3u', 'vec4u'], argTs: (t) => [t, scalarU(t)], lists: shiftLists, oracle: O.shl, cpuExpected: 'impl' },
  { name: 'std.bitShiftRight', form: 'std.bitShiftRight(v, s) (vectors only)', fn: stdShr, types: ['vec2i', 'vec3i', 'vec4i', 'vec2u', 'vec3u', 'vec4u'], argTs: (t) => [t, scalarU(t)], lists: shiftLists, oracle: O.shr, cpuExpected: 'impl' },
  { name: 'a <<= s', form: 'x <<= s', fn: shlEq, types: IU, argTs: (t) => [t, scalarU(t)], lists: shiftLists, oracle: O.shl, cpuExpected: 'impl' },
  { name: 'a >>= s', form: 'x >>= s', fn: shrEq, types: IU, argTs: (t) => [t, scalarU(t)], lists: shiftLists, oracle: O.shr, cpuExpected: 'impl' },
  { name: 'a >>>= s', form: 'x >>>= s (u32 only)', fn: ushrEq, types: U, argTs: (t) => [t, scalarU(t)], lists: shiftLists, oracle: O.ushr, cpuExpected: 'impl' },
  { name: 'a &= b', form: 'x &= b', fn: andEq, types: IU, argTs: (t) => [t, t], lists: two, oracle: O.and, cpuExpected: 'impl' },
  { name: 'a |= b', form: 'x |= b', fn: orEq, types: IU, argTs: (t) => [t, t], lists: two, oracle: O.or, cpuExpected: 'impl' },
  { name: 'a ^= b', form: 'x ^= b', fn: xorEq, types: IU, argTs: (t) => [t, t], lists: two, oracle: O.xor, cpuExpected: 'impl' },
  { name: 'a & b (i32, u32)', form: 'a & b with a: i32, b: u32', fn: bandMixed, types: ['i32'], argTs: () => [td('i32'), td('u32')], lists: () => [valuesOf('i32'), valuesOf('u32')], oracle: O.and, cpuExpected: 'impl' },
  { name: 'a | b (i32, u32)', form: 'a | b with a: i32, b: u32', fn: borMixed, types: ['i32'], argTs: () => [td('i32'), td('u32')], lists: () => [valuesOf('i32'), valuesOf('u32')], oracle: O.or, cpuExpected: 'impl' },
  { name: 'a ^ b (i32, u32)', form: 'a ^ b with a: i32, b: u32', fn: bxorMixed, types: ['i32'], argTs: () => [td('i32'), td('u32')], lists: () => [valuesOf('i32'), valuesOf('u32')], oracle: O.xor, cpuExpected: 'impl' },
  { name: 'std.min', form: 'std.min(a, b)', fn: stdMin, types: IU, argTs: (t) => [t, t], lists: two, oracle: O.min, cpuExpected: 'impl' },
  { name: 'std.max', form: 'std.max(a, b)', fn: stdMax, types: IU, argTs: (t) => [t, t], lists: two, oracle: O.max, cpuExpected: 'impl' },
  {
    name: 'std.clamp', form: 'std.clamp(e, lo, hi)', fn: clamp, types: IU, argTs: (t) => [t, t, t],
    lists: (t) => { const v = valuesOf(t.elem); const small = [v[0]!, v[1]!, v[2]!, v[3]!, v[10]!, v[11]!, v[12]!, v[13]!, v[14]!, v[15]!, v[20]!]; return [v, small, small]; },
    oracle: O.clamp, cpuExpected: 'impl',
  },
  {
    name: 'std.extractBits', form: 'std.extractBits(e, offset: u32, count: u32)', fn: extractBits, types: IU,
    argTs: (t) => [t, td('u32'), td('u32')], lists: (t) => [valuesOf(t.elem), OFFSETS, COUNTS], oracle: O.extractBits, cpuExpected: 'noimpl',
    unverified: ([, o, c]) => o! + c! > 32,
  },
  {
    name: 'std.insertBits', form: 'std.insertBits(e, newbits, offset: u32, count: u32)', fn: insertBits, types: IU,
    argTs: (t) => [t, t, td('u32'), td('u32')],
    lists: (t) => { const v = valuesOf(t.elem); return [v.slice(0, 14), [v[0]!, v[1]!, v[4]!, v[11]!, v[12]!, v[14]!], OFFSETS, COUNTS]; },
    oracle: O.insertBits, cpuExpected: 'noimpl', unverified: ([, , o, c]) => o! + c! > 32,
  },
  {
    name: 'std.select (scalar cond)', form: 'std.select(f, t, c !== 0)', fn: select1, types: IU,
    argTs: (t) => [t, t, td('u32')], lists: (t) => [valuesOf(t.elem).slice(0, 12), valuesOf(t.elem).slice(0, 12), [0, 1, 7]], oracle: O.select, cpuExpected: 'impl',
  },
];
