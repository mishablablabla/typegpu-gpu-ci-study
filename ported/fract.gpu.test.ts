import { describe, expect, it } from 'vitest';
import { g } from '../harness.ts';

describe('fract (GPU)', () => {
  it('computes fractional part of a number', async () => {
    expect(await g.fract(2)).toBeCloseTo(0);
    expect(await g.fract(2.2)).toBeCloseTo(0.2);
    expect(await g.fract(-0.5)).toBeCloseTo(0.5);
    expect(await g.fract(-0.2)).toBeCloseTo(0.8);
  });
});
