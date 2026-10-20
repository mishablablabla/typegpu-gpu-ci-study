import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { GroupResult } from './engine.ts';

export interface KnownDivergence { label: string; reason: string; observed: string }
export interface Observation { label: string; value: unknown }

const groups: GroupResult[] = [];
const known: KnownDivergence[] = [];
const observations: Observation[] = [];

export const recordGroup = (g: GroupResult) => void groups.push(g);
export const recordObservation = (label: string, value: unknown) => void observations.push({ label, value });

export function knownDivergence(label: string, reason: string, assertion: () => void) {
  try {
    assertion();
  } catch (e) {
    known.push({ label, reason, observed: String((e as Error).message).split('\n').slice(0, 3).join(' | ') });
  }
}

export function flush(name: string) {
  const dir = fileURLToPath(new URL('../reports/cases/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}${name}.json`, JSON.stringify({ file: name, groups, knownDivergences: known, observations }, null, 1));
}
