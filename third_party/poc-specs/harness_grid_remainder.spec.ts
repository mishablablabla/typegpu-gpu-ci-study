export const description = `PoC-only: the REAL CTS machinery (run + remainderInterval + compare) on the PoC harness' own 59x59 input grid for f32 x % y. Lives only in the isolated cts-control clone.`;

import * as fs from 'fs';

import { makeTestGroup } from '../../../../../common/framework/test_group.js';
import { AllFeaturesMaxLimitsGPUTest } from '../../../../gpu_test.js';
import { Type } from '../../../../util/conversion.js';
import { FP } from '../../../../util/floating_point.js';
import { run } from '../expression.js';

import { binary } from './binary.js';

export const g = makeTestGroup(AllFeaturesMaxLimitsGPUTest);

const dec = (v: number | string): number => (v === 'NaN' ? NaN : v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v === '-0' ? -0 : (v as number));

g.test('harness_grid')
  .desc('f32 x % y over the harness grid, unfiltered (non-finite inputs and unbounded intervals included)')
  .params(u => u.combine('inputSource', ['uniform', 'storage_r', 'storage_rw'] as const))
  .fn(async t => {
    const grid = JSON.parse(fs.readFileSync(process.env.HARNESS_GRID as string, 'utf8'));
    const xs = grid.xs.map(dec).filter((v: number) => !Number.isNaN(v)), ys = grid.ys.map(dec).filter((v: number) => !Number.isNaN(v));
    const cases = FP.f32.generateScalarPairToIntervalCases(xs, ys, 'unfiltered', FP.f32.remainderInterval);
    await run(t, binary('%'), [Type.f32, Type.f32], Type.f32, t.params, cases);
  });
