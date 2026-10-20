import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { d, std } from 'typegpu';
import { dawnError, oneLine, resolveOrError, type Any } from './lib.ts';

type Fn = Any;
const U = { countOneBits: (a: Any) => { 'use gpu'; return std.countOneBits(a); }, reverseBits: (a: Any) => { 'use gpu'; return std.reverseBits(a); },
  countLeadingZeros: (a: Any) => { 'use gpu'; return std.countLeadingZeros(a); }, countTrailingZeros: (a: Any) => { 'use gpu'; return std.countTrailingZeros(a); },
  firstLeadingBit: (a: Any) => { 'use gpu'; return std.firstLeadingBit(a); }, firstTrailingBit: (a: Any) => { 'use gpu'; return std.firstTrailingBit(a); },
  abs: (a: Any) => { 'use gpu'; return std.abs(a); }, sign: (a: Any) => { 'use gpu'; return std.sign(a); }, '~x': (a: Any) => { 'use gpu'; return ~a; },
  'std.not': (a: Any) => { 'use gpu'; return std.not(a); }, 'Math.clz32': (a: Any) => { 'use gpu'; return Math.clz32(a); } };
const B = { 'a & b': (a: Any, b: Any) => { 'use gpu'; return a & b; }, 'a | b': (a: Any, b: Any) => { 'use gpu'; return a | b; }, 'a ^ b': (a: Any, b: Any) => { 'use gpu'; return a ^ b; },
  'a << s': (a: Any, b: Any) => { 'use gpu'; return a << b; }, 'a >> s': (a: Any, b: Any) => { 'use gpu'; return a >> b; }, 'a >>> s': (a: Any, b: Any) => { 'use gpu'; return a >>> b; },
  'std.bitShiftLeft': (a: Any, b: Any) => { 'use gpu'; return std.bitShiftLeft(a, b); }, 'std.bitShiftRight': (a: Any, b: Any) => { 'use gpu'; return std.bitShiftRight(a, b); },
  'std.min': (a: Any, b: Any) => { 'use gpu'; return std.min(a, b); }, 'std.max': (a: Any, b: Any) => { 'use gpu'; return std.max(a, b); } };
const T3 = { 'std.clamp': (a: Any, b: Any, c: Any) => { 'use gpu'; return std.clamp(a, b, c); }, 'std.extractBits': (a: Any, b: Any, c: Any) => { 'use gpu'; return std.extractBits(a, b, c); },
  'std.select': (a: Any, b: Any, c: Any) => { 'use gpu'; return std.select(a, b, c); } };
const T4 = { 'std.insertBits': (a: Any, b: Any, c: Any, e: Any) => { 'use gpu'; return std.insertBits(a, b, c, e); } };

const SCH: Record<string, Any> = { i32: d.i32, u32: d.u32, f32: d.f32, f16: d.f16, bool: d.bool, vec3i: d.vec3i, vec3u: d.vec3u, vec3f: d.vec3f, vec3h: d.vec3h, vec3b: d.vec3b };
export interface Row { op: string; args: string; outcome: 'rejected-by-typegpu' | 'ok' | 'typegpu-ok-DAWN-REJECTS'; detail: string; returns?: string; implicitConversionWarning?: boolean }
const rows: Row[] = [];
afterAll(() => { mkdirSync(new URL('./raw', import.meta.url).pathname, { recursive: true }); writeFileSync(new URL('./raw/api-matrix.json', import.meta.url).pathname, JSON.stringify(rows, null, 1)); });

async function classify(op: string, argNames: string[], body: () => unknown): Promise<Row> {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const r = resolveOrError(body);
    const implicit = warn.mock.calls.some((c) => String(c[1] ?? c[0]).includes('mplicit'));
    if (r.error !== undefined) return { op, args: argNames.join(','), outcome: 'rejected-by-typegpu', detail: r.error.slice(0, 160) };
    const text = oneLine(r.wgsl!);
    const err = await dawnError(r.wgsl!);
    const names = [...text.matchAll(/fn ([A-Za-z_0-9]+)\(\) -> ([^ ]+)/g)];
    const returns = names[names.length - 1]?.[2];
    if (err) return { op, args: argNames.join(','), outcome: 'typegpu-ok-DAWN-REJECTS', detail: err.slice(0, 140), returns, implicitConversionWarning: implicit };
    return { op, args: argNames.join(','), outcome: 'ok', detail: text.slice(-160), returns, implicitConversionWarning: implicit };
  } finally { warn.mockRestore(); }
}
const find = (op: string, args: string) => rows.find((r) => r.op === op && r.args === args)!;

describe('[API matrix] unary integer functions / operators', () => {
  const TY = Object.keys(SCH);
  it('classifies all', async () => {
    for (const [op, f] of Object.entries(U) as [string, Fn][]) {
      for (const tn of TY) { const S = SCH[tn]; rows.push(await classify(op, [tn], () => { 'use gpu'; const a = S(); return f(a); })); }
      for (const [ln, lit] of [['lit 7', 7], ['lit -7', -7], ['lit 1.5', 1.5], ['lit 4294967295', 4294967295]] as const) rows.push(await classify(op, [ln], () => { 'use gpu'; return f(lit); }));
    }
    expect(rows.length).toBeGreaterThan(100);
  });

  it('[TypeGPU] integer-only builtins accept i32/u32/vecNi/vecNu and reject float/bool VECTORS at resolve time', () => {
    for (const op of ['countOneBits', 'reverseBits', 'countLeadingZeros', 'countTrailingZeros']) {
      for (const tn of ['i32', 'u32', 'vec3i', 'vec3u']) expect(find(op, tn).outcome, `${op} ${tn}`).toBe('ok');
      for (const tn of ['vec3f', 'vec3h', 'vec3b']) expect(find(op, tn).outcome, `${op} ${tn}`).toBe('rejected-by-typegpu');
    }
  });
  it('[observation] scalar f32/f16/bool args to integer-only builtins are IMPLICITLY converted to i32 (console warning only); vectors are rejected -> scalar/vector inconsistency', () => {
    for (const op of ['countOneBits', 'reverseBits', 'countLeadingZeros', 'countTrailingZeros']) for (const tn of ['f32', 'f16', 'bool']) {
      const r = find(op, tn);
      expect(r.outcome).toBe('ok'); expect(r.returns).toBe('i32'); expect(r.implicitConversionWarning).toBe(true);
    }
  });
  it('[observation] sign(u32) is silently converted to sign(f32(x)) and RETURNS f32 (WGSL has no sign for u32); sign(vecNu) is rejected', () => {
    const r = find('sign', 'u32');
    expect(r.outcome).toBe('ok'); expect(r.returns).toBe('f32'); expect(r.implicitConversionWarning).toBe(true);
    expect(find('sign', 'vec3u').outcome).toBe('rejected-by-typegpu');
  });
  it.fails('[PROBABLE DEFECT #1] std.firstLeadingBit rejects non-integer argument types at resolve time like its siblings (f32/f16/bool/vec3f/vec3h/vec3b)', () => {
    for (const tn of ['f32', 'f16', 'bool', 'vec3f', 'vec3h', 'vec3b']) expect(find('firstLeadingBit', tn).outcome, tn).toBe('rejected-by-typegpu');
  });
  it('[observation] firstLeadingBit(f32/f16/bool/vecN<f|h|bool>) currently passes TypeGPU and generates WGSL that Dawn rejects (error surfaces late, from the driver)', () => {
    for (const tn of ['f32', 'f16', 'bool', 'vec3f', 'vec3h', 'vec3b']) expect(find('firstLeadingBit', tn).outcome, tn).toBe('typegpu-ok-DAWN-REJECTS');
  });
  it.fails('[PROBABLE DEFECT #2] std.abs rejects bool / vecN<bool> at resolve time (WGSL abs takes numeric types only)', () => {
    for (const tn of ['bool', 'vec3b']) expect(find('abs', tn).outcome, tn).toBe('rejected-by-typegpu');
  });
  it('[observation] abs(bool) / abs(vec3b) pass TypeGPU and are rejected by Dawn', () => {
    for (const tn of ['bool', 'vec3b']) expect(find('abs', tn).outcome, tn).toBe('typegpu-ok-DAWN-REJECTS');
  });
  it.fails('[PROBABLE DEFECT #3] unary ~ rejects f32 / f16 / bool / float and bool vectors at resolve time (WGSL ~ takes integers only)', () => {
    for (const tn of ['f32', 'f16', 'bool', 'vec3f', 'vec3h', 'vec3b']) expect(find('~x', tn).outcome, tn).toBe('rejected-by-typegpu');
  });
  it('[observation] ~f32 etc. pass TypeGPU and are rejected by Dawn; ~i32 / ~u32 / ~vecNi / ~vecNu are fine', () => {
    for (const tn of ['f32', 'f16', 'bool', 'vec3f', 'vec3h', 'vec3b']) expect(find('~x', tn).outcome, tn).toBe('typegpu-ok-DAWN-REJECTS');
    for (const tn of ['i32', 'u32', 'vec3i', 'vec3u']) expect(find('~x', tn).outcome, tn).toBe('ok');
  });
  it('[TypeGPU] std.not accepts only bool / vecN<bool>', () => {
    for (const tn of ['i32', 'u32', 'f32', 'vec3i', 'vec3u', 'vec3f']) expect(find('std.not', tn).outcome, tn).toBe('rejected-by-typegpu');
    for (const tn of ['bool', 'vec3b']) expect(find('std.not', tn).outcome, tn).toBe('ok');
  });
  it('[observation] out-of-range integer literal 4294967295 passed to an i32-typed builtin is emitted as `4294967295i` and rejected by Dawn (loud)', () => {
    for (const op of ['countOneBits', 'abs', '~x']) expect(['typegpu-ok-DAWN-REJECTS', 'rejected-by-typegpu']).toContain(find(op, 'lit 4294967295').outcome);
  });
});

describe('[API matrix] binary operators / functions', () => {
  const TY = ['i32', 'u32', 'f32', 'bool', 'vec3i', 'vec3u', 'vec3f', 'vec3b'];
  it('classifies all', async () => {
    for (const [op, f] of Object.entries(B) as [string, Fn][]) for (const a of TY) for (const b of TY) {
      const A = SCH[a], Bs = SCH[b];
      rows.push(await classify(op, [a, b], () => { 'use gpu'; const x = A(); const y = Bs(); return f(x, y); }));
    }
    expect(rows.length).toBeGreaterThan(500);
  });
  it('[TypeGPU] bitwise & | ^ on same-typed ints and int vectors are valid', () => {
    for (const op of ['a & b', 'a | b', 'a ^ b']) for (const tn of ['i32', 'u32', 'vec3i', 'vec3u']) expect(find(op, `${tn},${tn}`).outcome, `${op} ${tn}`).toBe('ok');
  });
  it.fails('[PROBABLE DEFECT #3b] binary & | ^ reject float operands, vector-with-scalar, vecNi-with-vecNu and bool ^ bool at resolve time (WGSL has no such overloads)', () => {
    for (const op of ['a & b', 'a | b', 'a ^ b']) for (const k of ['f32,f32', 'vec3f,vec3f', 'vec3i,i32', 'vec3i,vec3u']) expect(find(op, k).outcome, `${op} ${k}`).toBe('rejected-by-typegpu');
    expect(find('a ^ b', 'bool,bool').outcome).toBe('rejected-by-typegpu');
  });
  it('[observation] & | ^ with float / bool^bool / vector-scalar mixes pass TypeGPU but are rejected by Dawn (no operand type check in TypeGPU for these operators)', () => {
    const bad = (op: string, a: string, b: string) => expect(find(op, `${a},${b}`).outcome, `${op} ${a},${b}`).toBe('typegpu-ok-DAWN-REJECTS');
    for (const op of ['a & b', 'a | b', 'a ^ b']) { bad(op, 'f32', 'f32'); bad(op, 'vec3f', 'vec3f'); bad(op, 'vec3i', 'i32'); bad(op, 'vec3i', 'vec3u'); }
    bad('a ^ b', 'bool', 'bool'); bad('a ^ b', 'vec3b', 'vec3b');
  });
  it('[observation] & | on bool,bool and vec3b,vec3b are valid WGSL (logical, non short-circuit)', () => {
    for (const op of ['a & b', 'a | b']) { expect(find(op, 'bool,bool').outcome).toBe('ok'); expect(find(op, 'vec3b,vec3b').outcome).toBe('ok'); }
  });
  it('[observation] mixed i32/u32 operands are implicitly converted: result type of i32 & u32 and u32 & i32', () => {
    expect([find('a & b', 'i32,u32').returns, find('a & b', 'u32,i32').returns]).toEqual(['i32', 'i32']);
  });
  it('[TypeGPU] operator shifts: scalar lhs needs scalar rhs, vector lhs needs vecNu rhs; vec << scalar via operator is rejected (std.bitShiftLeft accepts it)', () => {
    expect(find('a << s', 'i32,u32').outcome).toBe('ok'); expect(find('a << s', 'vec3i,vec3u').outcome).toBe('ok');
    expect(find('a << s', 'vec3i,u32').outcome).toBe('rejected-by-typegpu'); expect(find('a << s', 'vec3i,vec3i').outcome).toBe('rejected-by-typegpu');
    expect(find('std.bitShiftLeft', 'vec3i,u32').outcome).toBe('ok'); expect(find('std.bitShiftLeft', 'vec3i,vec3u').outcome).toBe('ok');
  });
  it('[TypeGPU] std.bitShiftLeft/Right with a SCALAR lhs throw (documented: vectors only)', () => {
    for (const op of ['std.bitShiftLeft', 'std.bitShiftRight']) for (const tn of ['i32', 'u32']) for (const s of ['i32', 'u32']) expect(find(op, `${tn},${s}`).outcome).toBe('rejected-by-typegpu');
  });
  it('[TypeGPU] a >>> s is only valid for u32 / vecNu lhs (i32 lhs rejected with "Use >> instead")', () => {
    expect(find('a >>> s', 'u32,u32').outcome).toBe('ok'); expect(find('a >>> s', 'i32,u32').outcome).toBe('rejected-by-typegpu');
  });
  it('[observation] shift rhs of type i32 / f32 / bool is converted with u32(...) (documented); lhs must be integer', () => {
    for (const s of ['i32', 'f32', 'bool']) expect(find('a << s', `i32,${s}`).outcome).toBe('ok');
    expect(find('a << s', 'f32,u32').outcome).toBe('rejected-by-typegpu');
  });
});

describe('[API matrix] ternary / quaternary', () => {
  it('classifies extractBits / insertBits / clamp / select', async () => {
    const TY = ['i32', 'u32', 'f32', 'vec3i', 'vec3u', 'vec3f'], CT = ['u32', 'i32', 'f32', 'vec3u'];
    for (const e of TY) for (const o of CT) for (const c of CT) {
      const E = SCH[e], O = SCH[o], C = SCH[c];
      rows.push(await classify('std.extractBits', [e, o, c], () => { 'use gpu'; const x = E(); const y = O(); const z = C(); return std.extractBits(x, y, z); }));
    }
    for (const e of ['i32', 'u32', 'vec3i', 'vec3u', 'f32']) for (const n of ['i32', 'u32', 'vec3i', 'vec3u']) for (const o of ['u32', 'i32']) {
      const E = SCH[e], N = SCH[n], O = SCH[o];
      rows.push(await classify('std.insertBits', [e, n, o, o], () => { 'use gpu'; const x = E(); const y = N(); const z = O(); return std.insertBits(x, y, z, z); }));
    }
    for (const [a, b, c] of [['i32', 'i32', 'i32'], ['u32', 'u32', 'u32'], ['vec3i', 'vec3i', 'vec3i'], ['i32', 'u32', 'i32'], ['vec3i', 'i32', 'i32'], ['f32', 'i32', 'i32']]) {
      const A = SCH[a], Bs = SCH[b], C = SCH[c];
      rows.push(await classify('std.clamp', [a, b, c], () => { 'use gpu'; const x = A(); const y = Bs(); const z = C(); return std.clamp(x, y, z); }));
    }
    expect(rows.filter((r) => r.op === 'std.extractBits').length).toBe(6 * 16);
  });
  it('[TypeGPU] extractBits(e: int|vecN<int>, offset: u32, count: u32) is valid for every int type; signed returns same type', () => {
    for (const e of ['i32', 'u32', 'vec3i', 'vec3u']) { const r = find('std.extractBits', `${e},u32,u32`); expect(r.outcome).toBe('ok'); expect(r.returns).toBe(e === 'vec3i' ? 'vec3i' : e === 'vec3u' ? 'vec3u' : e); }
  });
  it('[observation] extractBits with a float scalar e is implicitly converted to i32 (warning) -> returns i32; with float vector it is rejected; vec offset/count rejected', () => {
    expect(find('std.extractBits', 'f32,u32,u32').returns).toBe('i32');
    expect(find('std.extractBits', 'vec3f,u32,u32').outcome).toBe('rejected-by-typegpu');
    expect(find('std.extractBits', 'i32,vec3u,vec3u').outcome).toBe('rejected-by-typegpu');
  });
  it('[observation] signed offset/count (i32) are implicitly converted to u32: negative values wrap to huge u32 (spec: min(offset,32) -> saturates)', () => {
    expect(find('std.extractBits', 'i32,i32,i32').outcome).toBe('ok');
  });
  it('[TypeGPU] insertBits valid for same-typed (e, newbits) ints; vector with scalar newbits is rejected', () => {
    for (const e of ['i32', 'u32', 'vec3i', 'vec3u']) expect(find('std.insertBits', `${e},${e},u32,u32`).outcome).toBe('ok');
    expect(find('std.insertBits', 'vec3i,i32,u32,u32').outcome).not.toBe('ok');
  });
  it('[observation] clamp with mixed i32/u32 or vec/scalar: record outcome', () => {
    for (const k of ['i32,u32,i32', 'vec3i,i32,i32', 'f32,i32,i32']) console.log('clamp', k, find('std.clamp', k).outcome, find('std.clamp', k).returns ?? find('std.clamp', k).detail);
  });
});
