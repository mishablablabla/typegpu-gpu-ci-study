import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

const matrix: Record<string, { a: number[][]; b: number[][]; gpu: number[][] }> = JSON.parse(readFileSync(process.env.GPU_MATRIX!, 'utf8'));
describe('CPU std.mul vs recorded GPU results (same rows)', () => {
  it.each(Object.keys(matrix))('%s', (name) => {
    const { a, b, gpu } = matrix[name]!;
    const mismatches: unknown[] = [];
    a.forEach((ra, r) => {
      const cpu = Array.from(std.mul((d as any)[name](...ra), (d as any)[name](...b[r]!)) as any);
      if (JSON.stringify(cpu) !== JSON.stringify(gpu[r])) mismatches.push({ a: ra, b: b[r], cpu, gpu: gpu[r] });
    });
    expect(a.length).toBe(400);
    expect(mismatches.slice(0, 3)).toEqual([]);
  });
});
