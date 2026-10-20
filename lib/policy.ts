import { MIN_NORMAL_F32, flushSub32, fmt, fround, isSubnormal32, ulp32 } from './num.ts';
import type { TypeDesc } from './types.ts';

export type Verdict = 'pass' | 'fail' | 'investigate';
export interface PolicyResult { verdict: Verdict; detail?: string; ulp?: number }
export interface LaneCtx {
  type: TypeDesc;
  args: number[];
  oracle: (args: number[]) => number;
}
export interface Policy {
  id: string;
  basis: 'spec' | 'derived' | 'observation';
  describe: string;
  check(got: number, want: number, c: LaneCtx): PolicyResult;
}

const PASS: PolicyResult = { verdict: 'pass' };
const investigate = (detail: string): PolicyResult => ({ verdict: 'investigate', detail });
const fail = (detail: string, ulp?: number): PolicyResult => ({ verdict: 'fail', detail, ulp });

function nonFinite(got: number, want: number, c: LaneCtx): PolicyResult | undefined {
  if (c.args.some((a) => !Number.isFinite(a)) || !Number.isFinite(want) || !Number.isFinite(got)) {
    return investigate('inf/NaN involved (WGSL: implementations may assume these do not occur) — observation only');
  }
  return undefined;
}

export const observe = (why: string): Policy => ({
  id: 'observation', basis: 'observation', describe: why,
  check: (got, want) => investigate(`${why}; got ${fmt(got)}, reference ${fmt(want)}`),
});

export const exactInt: Policy = {
  id: 'exact-integer', basis: 'spec', describe: 'integer result must equal the WGSL-defined value exactly (wrap-around, div/rem-by-zero rules)',
  check: (got, want) => (got === want ? PASS : fail(`expected ${fmt(want)} (spec value), got ${fmt(got)}`)),
};

export const exactSelect: Policy = {
  id: 'exact-select', basis: 'spec', describe: 'min/max must return one of the operands exactly (subnormal inputs may be flushed to zero before comparing; ±0 and inf/NaN are observations)',
  check(got, want, c) {
    const nf = nonFinite(got, want, c); if (nf) return nf;
    if (Object.is(got, want)) return PASS;
    if (c.args.some(isSubnormal32)) {
      const alt = c.oracle(c.args.map(flushSub32));
      const isOperand = c.args.some((a) => Object.is(a, got));
      if (isOperand && (flushSub32(got) === alt || (flushSub32(got) === 0 && alt === 0))) return PASS;
    }
    if (got === 0 && want === 0) return investigate('sign of zero differs; WGSL text does not specify it for min/max');
    return fail(`expected ${fmt(want)}, got ${fmt(got)}`);
  },
};

export function correctlyRounded(round: (x: number) => number, minNormal = MIN_NORMAL_F32): Policy {
  const isSub = (x: number) => x !== 0 && Math.abs(x) < minNormal;
  const flush = (x: number) => (isSub(x) ? (x < 0 ? -0 : 0) : x);
  return {
    id: 'correctly-rounded', basis: 'spec',
    describe: 'WGSL: addition, subtraction and multiplication are correctly rounded; subnormal inputs/outputs may be flushed to zero',
    check(got, exact, c) {
      const nf = nonFinite(got, exact, c); if (nf) return nf;
      const alts = [round(exact)];
      if (isSub(exact)) alts.push(0, -0);
      if (c.args.some(isSub)) {
        const e2 = c.oracle(c.args.map(flush));
        alts.push(round(e2));
        if (isSub(e2)) alts.push(0, -0);
      }
      if (alts.some((x) => Object.is(x, got))) return PASS;
      if (alts.some((x) => x === got)) return investigate('result is a zero with a different sign than the reference; WGSL text does not specify the sign of zero here');
      const want = alts[0]!;
      const u = ulp32(want);
      return fail(`not the correctly rounded value ${fmt(want)} (off by ${(Math.abs(got - want) / u).toPrecision(3)} ULP)`, Math.abs(got - want) / u);
    },
  };
}

interface UlpOpts {
  domain?: (args: number[]) => string | null;
  basis?: 'spec' | 'derived';
}
export function ulpBound(id: string, describe: string, bound: (args: number[], want: number) => number, opts: UlpOpts = {}): Policy {
  return {
    id, basis: opts.basis ?? 'spec', describe,
    check(got, want, c) {
      const nf = nonFinite(got, want, c); if (nf) return nf;
      const out = opts.domain?.(c.args); if (out) return investigate(`outside the range with a stated bound: ${out}`);
      if (Math.abs(want) > 3.4028234663852886e38) return investigate('exact result overflows f32');
      const wants = [want];
      if (c.args.some(isSubnormal32)) wants.push(c.oracle(c.args.map(flushSub32)));
      if (wants.some((w) => Math.abs(w) < MIN_NORMAL_F32) && got === 0) return PASS;
      let best = Infinity, limit = 0;
      for (const w of wants) {
        if (!Number.isFinite(w)) continue;
        const ulps = Math.abs(got - w) / ulp32(w);
        const b = bound(c.args, w);
        if (ulps <= b * (1 + 1e-9)) return { verdict: 'pass', ulp: ulps };
        if (ulps < best) { best = ulps; limit = b; }
      }
      return fail(`${best.toPrecision(4)} ULP from the exact value ${fmt(want)}, bound is ${limit.toPrecision(4)} ULP`, best);
    },
  };
}

export function absBound(id: string, describe: string, bound: number, domain?: (args: number[]) => string | null, whenExceeded: 'fail' | 'investigate' = 'fail'): Policy {
  return {
    id, basis: 'spec', describe,
    check(got, want, c) {
      const nf = nonFinite(got, want, c); if (nf) return nf;
      const out = domain?.(c.args); if (out) return investigate(`outside the range with a stated bound: ${out}`);
      const err = Math.abs(got - want);
      if (err <= bound) return { verdict: 'pass' };
      const msg = `abs error ${err.toExponential(3)} > ${bound.toExponential(3)}`;
      return whenExceeded === 'fail' ? fail(msg) : investigate(`${msg} (spec bound is the worse of this and an inherited bound; cannot conclude)`);
    },
  };
}

export const logPolicy: Policy = (() => {
  const inner = ulpBound('3ulp', '', () => 3, { domain: (a) => (a[0]! <= 0 ? 'x <= 0 is outside the domain' : null) });
  return {
    id: 'log-abs2^-21-on-[0.5,2]-else-3ulp', basis: 'spec' as const,
    describe: 'WGSL log/log2: absolute error <= 2^-21 for x in [0.5, 2], otherwise 3 ULP',
    check(got, want, c) {
      const x = c.args[0]!;
      if (x >= 0.5 && x <= 2 && Number.isFinite(got) && Number.isFinite(want)) {
        const err = Math.abs(got - want);
        return err <= 2 ** -21 ? PASS : fail(`abs error ${err.toExponential(3)} > 2^-21 on [0.5, 2]`);
      }
      return inner.check(got, want, c);
    },
  };
})();

export function intViaF32(kind: 'div' | 'mod'): Policy {
  return {
    id: `int-${kind}-via-f32`, basis: 'derived',
    describe: `TypeGPU emits integer std.${kind} as an f32 operation: exact for |operands| <= 2^24 (off-by-one = observation), anything else is an observation`,
    check(got, want, c) {
      const [a, b] = c.args as [number, number];
      if (b === 0) return investigate('divisor 0: f32 result is inf/NaN, conversion to integer is unspecified');
      if (Math.abs(a) > 2 ** 24 || Math.abs(b) > 2 ** 24) return investigate('operand > 2^24 is not exactly representable in f32 (TypeGPU computes this in f32)');
      if (got === want) return PASS;
      if (kind === 'mod' && want === 0 && Math.abs(got) === Math.abs(b)) return investigate(`result equals the divisor (${fmt(got)}): remainder is a - b*trunc(a/b) and the f32 quotient a/b rounded below an integer`);
      if (kind === 'div' && Math.abs(got - want) === 1) return investigate('off by one: f32 quotient rounded across an integer boundary');
      return fail(`expected ${fmt(want)}, got ${fmt(got)}`);
    },
  };
}

export const floatRemainder: Policy = {
  id: 'float-remainder-derived', basis: 'derived',
  describe: 'WGSL: x % y = x - y*trunc(x/y); exact remainder expected, a result off by exactly |y| (quotient rounded across an integer) is an observation',
  check(got, want, c) {
    const nf = nonFinite(got, want, c); if (nf) return nf;
    const [a, b] = c.args as [number, number];
    if (b === 0) return investigate('divisor 0');
    if (Object.is(got, want) || got === want) return PASS;
    if (c.args.some(isSubnormal32)) {
      const alt = c.oracle(c.args.map(flushSub32));
      if (got === alt || (isSubnormal32(want) && got === 0)) return PASS;
    }
    const diff = Math.abs(got - want);
    if (Math.abs(diff - Math.abs(b)) <= 2 * ulp32(b)) return investigate(`off by |y|: quotient ${fmt(a / b)} rounded across an integer in f32 (got ${fmt(got)}, exact remainder ${fmt(want)})`);
    if (diff <= 2 * ulp32(Math.max(Math.abs(a), Math.abs(want)))) return PASS;
    return fail(`remainder ${fmt(got)} differs from the exact ${fmt(want)} by ${diff.toExponential(3)}`);
  },
};

export const powDerived: Policy = ulpBound(
  'pow-derived-composition',
  'DERIVED (not a literal spec number): composes the spec bounds of log2 (abs 2^-21 on [0.5,2] else 3 ULP), the f32 product y*log2(x) (0.5 ULP) and exp2 (3+2|z| ULP)',
  (args, want) => {
    const [x, y] = args as [number, number];
    const L = Math.log2(x);
    const errL = x >= 0.5 && x <= 2 ? 2 ** -21 : 3 * ulp32(L);
    const z = y * L;
    const errZ = Math.abs(y) * errL + 0.5 * ulp32(z);
    const abs = Math.abs(want) * Math.LN2 * errZ * 1.01 + (3 + 2 * Math.abs(z)) * ulp32(want);
    return abs / ulp32(want);
  },
  { basis: 'derived', domain: (a) => (a[0]! <= 0 ? 'x <= 0' : Math.abs(a[1]! * Math.log2(a[0]!)) > 125 ? 'result near overflow/underflow' : null) },
);

export const sqrtDerived: Policy = ulpBound(
  'sqrt-derived-from-inverseSqrt', 'DERIVED: spec says sqrt is inherited from 1/inverseSqrt(x) (2 ULP) and division (2.5 ULP); conservatively 9 ULP',
  () => 9, { basis: 'derived', domain: (a) => (a[0]! <= 0 ? 'x <= 0' : null) },
);

export { fround };
