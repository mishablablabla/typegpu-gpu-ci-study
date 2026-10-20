import { beforeAll, describe, expect, it, vi } from 'vitest';
import { d } from 'typegpu';
import { type Any, MAX, MIN, UMAX, constRun, gpuMap } from './lib.ts';
import { saveEvidence } from './evidence.ts';
import { CONST_BODIES } from './const-bodies.ts';
import { CONVS, OPS, TERNARY, UNARY } from './ops.ts';
import { SPECIAL_F } from './sweep.ts';

const IC = [MIN, MIN + 1, -1, 0, 1, 2, 7, 47, 46341, 16777217, MAX - 1, MAX];
const UC = [0, 1, 2, 7, 47, 46341, 16777217, 2147483648, 3000000000, 4294967040, UMAX - 1, UMAX];
const SHC = [0, 1, 5, 31, 32, 33];
const sch = (T: string): Any => (T === 'i32' ? d.i32 : T === 'u32' ? d.u32 : d.f32);

const RT: Record<string, (T: 'i32' | 'u32') => string> = {};
for (const n of ['a + b', 'std.add', 'a - b', 'std.sub', 'a * b', 'std.mul', 'std.min', 'std.max', 'a % b', 'std.mod', 'T(a / b)', 'std.div -> T', 'std.intdiv', 'a & b', 'a | b', 'a ^ b', 'a << b', '-a', 'std.neg', 'std.abs', 'std.sign', '~a', 'std.clamp']) RT[n] = () => n;
RT['a >> b'] = (T) => (T === 'i32' ? 'a >> b (i32)' : 'a >> b (u32, deprecated)');
RT['a >>> b'] = () => 'a >>> b (u32)';
const ALLOPS = [...OPS, ...UNARY, ...TERNARY];
const arity = (n: string) => (['-a', 'std.neg', 'std.abs', 'std.sign', '~a'].includes(n) ? 1 : n === 'std.clamp' ? 3 : 2);
const isShiftName = (n: string) => n.startsWith('a <<') || n.startsWith('a >>');

interface Row { op: string; T: string; x: number; y: number; z: number; wgsl: string; rejected: string | null; folded: boolean; constVal: number | null; runtime: number | null; oracle: number | null; verdict: 'loud-reject' | 'agree' | 'SILENT-leak' }
const rows: Row[] = [];
const evidence: Any = {};
const rejectKind = (m: string) => /cannot be represented/.test(m) ? 'out-of-range literal' : /division by zero/.test(m) ? 'const division by zero' : /shift left value must be less/.test(m) ? 'const shift >= 32' : /no matching overload for 'operator - \(u32\)'/.test(m) ? 'negative literal for u32' : /TypeGPU resolve error/.test(m) ? 'TypeGPU resolve error (CPU value not finite)' : m.slice(0, 60);

beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  for (const name of Object.keys(RT)) for (const T of ['i32', 'u32'] as const) {
    if (name === 'a >>> b' && T === 'i32') continue;
    if ((name === '-a' || name === 'std.neg' || name === 'std.sign') && T === 'u32') continue;
    const op = ALLOPS.find((o) => o.name === RT[name]!(T))!;
    const V = T === 'i32' ? IC : UC, n = arity(name);
    const combos: number[][] = [];
    if (n === 1) for (const x of V) combos.push([x, 0, 0]);
    else if (n === 2) for (const x of V) for (const y of isShiftName(name) ? SHC : V) combos.push([x, y, 0]);
    else for (const x of V) for (const y of [V[0]!, V[3]!, V[6]!]) for (const z of [V[1]!, V[5]!, V[V.length - 1]!]) combos.push([x, y, z]);
    const kinds = op.ins(T), ins = kinds.map((k, j) => ({ k, values: combos.map((c) => c[j]!) }));
    const g = (await gpuMap(op.fn, ins, op.out(T))) as Any;
    if (g.error) throw new Error(`${name} ${T} runtime: ${g.error}`);
    for (let i = 0; i < combos.length; i++) {
      const [x, y, z] = combos[i]! as [number, number, number];
      const body = CONST_BODIES[name]!(x, y, z, sch(T), d.u32, d.i32, d.f32);
      const c = await constRun(body, op.out(T));
      const oracle = op.oracle(T, combos[i]!.slice(0, kinds.length).map(BigInt));
      const runtime = g.out[i] as number;
      const verdict = c.rejected ? 'loud-reject' : c.value === runtime ? 'agree' : 'SILENT-leak';
      rows.push({ op: name, T, x, y, z, wgsl: c.wgsl, rejected: c.rejected, folded: c.folded, constVal: c.value, runtime, oracle: oracle === null ? null : Number(oracle), verdict });
    }
  }
}, 1800000);

const sel = (op: string, T?: string) => rows.filter((r) => r.op === op && (!T || r.T === T));

describe('[observation] constant-folded scalar ops (direct call with captured constants) vs runtime GPU', () => {
  it('the folded path really exists: results are baked as literals for + - * / std.* (so a leak is possible)', () => {
    const r = sel('a + b', 'i32').find((x) => x.x === 1 && x.y === 2)!;
    expect(r.folded).toBe(true); expect(r.constVal).toBe(3);
  });
  it('summary per op: loud rejections / agreements / silent leaks (written to results.json)', () => {
    const summary: Any = {};
    for (const r of rows) {
      const k = `${r.op} | ${r.T}`; const s = (summary[k] ??= { rows: 0, agree: 0, loudReject: 0, silentLeak: 0, rejectKinds: {}, leakSamples: [], constFoldedLiteralRows: 0 });
      s.rows++; if (r.folded) s.constFoldedLiteralRows++;
      if (r.verdict === 'agree') s.agree++;
      else if (r.verdict === 'loud-reject') { s.loudReject++; const kk = rejectKind(r.rejected!); s.rejectKinds[kk] = (s.rejectKinds[kk] ?? 0) + 1; }
      else { s.silentLeak++; if (s.leakSamples.length < 5) s.leakSamples.push({ x: r.x, y: r.y, z: r.z, wgsl: r.wgsl, const: r.constVal, runtime: r.runtime, oracle: r.oracle }); }
    }
    evidence.summary = summary;
    expect(Object.keys(summary).length).toBeGreaterThan(30);
  });
  it('[expected] silent leaks occur ONLY for the f32-compiled family (std.mod, T(a / b), std.div): the folded value is the CPU f64 evaluation on the f32-rounded operands (fmod exact; quotient NOT rounded to f32), the runtime value is the GPU\'s less accurate f32 one', () => {
    const leaking = new Set(rows.filter((r) => r.verdict === 'SILENT-leak').map((r) => r.op));
    expect([...leaking].sort()).toEqual(['T(a / b)', 'std.div -> T', 'std.mod'].sort());
    const cast = (T: string, v: number) => (T === 'i32' ? d.i32(v) : d.u32(v));
    for (const r of rows.filter((x) => x.op === 'std.mod' || x.op === 'T(a / b)' || x.op === 'std.div -> T')) {
      if (r.rejected) continue;
      const fa = Math.fround(r.x), fb = Math.fround(r.y);
      const model = r.op === 'std.mod' ? cast(r.T, fa % fb) : cast(r.T, fa / fb);
      expect(r.constVal, JSON.stringify(r)).toBe(model);
    }
    evidence.leakRowCounts = Object.fromEntries([...leaking].map((o) => [o, rows.filter((r) => r.op === o && r.verdict === 'SILENT-leak').length]));
  });
  it('[TypeGPU] out-of-range scalar results are baked as out-of-range literals and rejected by Dawn at pipeline creation (loud); never a silent wrong value', () => {
    for (const r of rows) if (r.verdict === 'loud-reject' && /cannot be represented/.test(r.rejected!) && r.folded) expect(r.wgsl).toMatch(/\d{9,}/);
    const mk = (op: string, T: string, x: number, y: number) => sel(op, T).find((r) => r.x === x && r.y === y)!;
    expect(mk('a + b', 'i32', MAX, 1).rejected).toMatch(/cannot be represented as 'i32'/);
    expect(mk('a + b', 'u32', UMAX, 1).rejected).toMatch(/cannot be represented as 'u32'/);
    expect(mk('a * b', 'i32', MAX, MAX).rejected).toMatch(/cannot be represented as 'i32'/);
    expect(mk('a - b', 'u32', 0, 1).rejected).toBeTruthy();
    expect(sel('-a', 'i32').find((r) => r.x === MIN)!.rejected).toMatch(/cannot be represented/);
    expect(sel('std.abs', 'i32').find((r) => r.x === MIN)!.rejected).toMatch(/cannot be represented/);
  });
  it('[TypeGPU] zero divisor and non-finite folded values: `%` is NOT folded (Dawn rejects `7i % 0i`); std.mod / T(a / b) / std.intdiv fail loudly in TypeGPU (Finite Math Assumption)', () => {
    expect(sel('a % b', 'i32').find((r) => r.x === 7 && r.y === 0)!.rejected).toMatch(/division by zero/);
    for (const op of ['std.mod', 'T(a / b)', 'std.intdiv']) expect(sel(op, 'i32').find((r) => r.x === 7 && r.y === 0)!.rejected, op).toBeTruthy();
  });
  it('[WGSL] const shift >= 32 is rejected by Dawn (shader-creation error) for << with a constant count; runtime shift count wraps modulo 32', () => {
    expect(sel('a << b', 'u32').find((r) => r.x === 1 && r.y === 32)!.rejected).toMatch(/shift left value must be less/);
    expect(sel('a << b', 'u32').find((r) => r.x === 1 && r.y === 31)!.constVal).toBe(2147483648);
  });
  it('[observation] bitwise ops and shifts are NOT folded by TypeGPU (emitted as WGSL expressions; Dawn const-evaluates them) -> always agree with runtime', () => {
    for (const op of ['a & b', 'a | b', 'a ^ b', '~a', 'a >> b', 'a >>> b'])
      for (const r of sel(op)) if (!r.rejected) expect(r.verdict, JSON.stringify(r)).toBe('agree');
  });
});

interface CRow { body: string; X: number; wgsl: string; rejected: string | null; constVal: number | null; runtime: number | null }
const crows: CRow[] = [];
beforeAll(async () => {
  const defs: [string, string, string, string, number[]][] = [
    ['d.u32(d.f32(X))', 'd.u32(f32)', 'f32', 'u32', SPECIAL_F], ['d.i32(d.f32(X))', 'd.i32(f32)', 'f32', 'i32', SPECIAL_F],
    ['d.u32(d.i32(X))', 'd.u32(i32)', 'i32', 'u32', IC], ['d.i32(d.u32(X))', 'd.i32(u32)', 'u32', 'i32', UC],
    ['d.f32(d.i32(X))', 'd.f32(i32)', 'i32', 'f32', [...IC, 16777219, -16777219]], ['d.f32(d.u32(X))', 'd.f32(u32)', 'u32', 'f32', [...UC, 16777219, 2147483649]],
  ];
  for (const [body, convName, from, to, vals] of defs) {
    const conv = CONVS.find((c) => c.name === convName)!;
    const g = (await gpuMap(conv.fn, [{ k: from as Any, values: vals }], to as Any)) as Any;
    for (let i = 0; i < vals.length; i++) {
      const c = await constRun(CONST_BODIES[body]!(vals[i], 0, 0, sch(to), d.u32, d.i32, d.f32), to as Any);
      crows.push({ body, X: vals[i]!, wgsl: c.wgsl, rejected: c.rejected, constVal: c.value, runtime: g.out[i] });
    }
  }
}, 600000);
const cs = (b: string) => crows.filter((r) => r.body === b);

describe('conversions: folded casts vs runtime casts', () => {
  it('[WGSL] i32 <-> u32 reinterpretation and int -> f32 widening: folded == runtime for every value (except the already-known loud INT_MIN literal rejection)', () => {
    for (const b of ['d.u32(d.i32(X))', 'd.i32(d.u32(X))', 'd.f32(d.i32(X))', 'd.f32(d.u32(X))']) for (const r of cs(b)) {
      if (r.rejected) { expect(r.wgsl, `${b} ${r.X}`).toContain('-2147483648i'); continue; }
      expect(r.constVal, `${b} ${r.X}`).toBe(r.runtime);
    }
  });
  it.fails('[PROBABLE DEFECT S4] folded d.u32(d.f32(X)) / d.i32(d.f32(X)) should equal the runtime (and WGSL const-eval) result: d.u32(d.f32(-1)) bakes 4294967295, the GPU/WGSL give 0', () => {
    for (const b of ['d.u32(d.f32(X))', 'd.i32(d.f32(X))']) for (const r of cs(b)) expect(r.constVal, `${b} X=${r.X}`).toBe(r.runtime);
  });
  it('[observation] S4 quantified: rows where the folded f32 -> int cast differs from runtime (all are integral f32 values outside the target range)', () => {
    const rep: Any = {};
    for (const b of ['d.u32(d.f32(X))', 'd.i32(d.f32(X))']) {
      const all = cs(b), bad = all.filter((r) => r.constVal !== r.runtime);
      rep[b] = { rows: all.length, differ: bad.length, rejected: all.filter((r) => r.rejected).length, samples: bad.slice(0, 6).map((r) => ({ X: r.X, wgsl: r.wgsl, folded: r.constVal, runtime: r.runtime })) };
      for (const r of bad) expect(Number.isInteger(r.X)).toBe(true);
      expect(bad.length).toBeGreaterThan(0);
    }
    evidence.s4 = rep;
    const m1 = cs('d.u32(d.f32(X))').find((r) => r.X === -1)!;
    expect(m1.constVal).toBe(4294967295); expect(m1.runtime).toBe(0);
    const m2 = cs('d.i32(d.f32(X))').find((r) => r.X === 3e9)!;
    expect(m2.constVal).toBe(-1294967296); expect(m2.runtime).toBe(2147483520);
  });
  it('[observation] plain captured JS numbers: d.u32(-1) / d.i32(1e10) fold to the documented CPU values (no runtime counterpart: an untyped number has no GPU type)', async () => {
    const out: Any = {};
    for (const [b, X, T] of [['d.u32(X) [plain number]', -1, 'u32'], ['d.u32(X) [plain number]', -1.5, 'u32'], ['d.i32(X) [plain number]', 1e10, 'i32'], ['d.u32(X) [plain number]', 5e9, 'u32']] as const) {
      const c = await constRun(CONST_BODIES[b]!(X, 0, 0, sch(T), d.u32, d.i32, d.f32), T);
      out[`${b} X=${X}`] = { wgsl: c.wgsl, rejected: c.rejected, value: c.value };
    }
    evidence.plainNumberCasts = out;
    expect(out['d.u32(X) [plain number] X=-1'].value).toBe(4294967295);
  });
});

describe('evidence', () => {
  it('writes results.json (const folding)', () => {
    saveEvidence('constFolding', { ...evidence, rows: rows.length, convRows: crows.length, sampleRows: rows.filter((r) => r.verdict !== 'agree').slice(0, 40) });
  });
});
