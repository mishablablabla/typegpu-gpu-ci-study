import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';
import { run } from '../harness.ts';

type Any = any;

describe('modf (GPU only)', () => {
  const Modf = d.struct({ fract: d.f32, whole: d.f32 });
  const modf = (x: number) =>
    run((a: Any) => { 'use gpu'; const r = std.modf(a); return Modf({ fract: r.fract, whole: r.whole }); }, [x], Modf);

  it('splits positive and negative numbers (fract keeps the sign)', async () => {
    expect(await modf(2.5)).toStrictEqual({ fract: 0.5, whole: 2 });
    expect(await modf(-2.5)).toStrictEqual({ fract: -0.5, whole: -2 });
    expect(await modf(3)).toStrictEqual({ fract: 0, whole: 3 });
  });
});

describe('frexp (GPU only)', () => {
  const Frexp = d.struct({ fract: d.f32, exp: d.i32 });
  const frexp = (x: number) =>
    run((a: Any) => { 'use gpu'; const r = std.frexp(a); return Frexp({ fract: r.fract, exp: r.exp }); }, [x], Frexp);

  it('returns fract in [0.5, 1) and an integer exponent', async () => {
    expect(await frexp(8)).toStrictEqual({ fract: 0.5, exp: 4 });
    expect(await frexp(1)).toStrictEqual({ fract: 0.5, exp: 1 });
    expect(await frexp(-6)).toStrictEqual({ fract: -0.75, exp: 3 });
  });
});
