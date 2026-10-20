import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('./results.json', import.meta.url));
export function saveSection(key: string, data: unknown) {
  let cur: Record<string, unknown> = {};
  try { if (existsSync(file)) cur = JSON.parse(readFileSync(file, 'utf8')); } catch { cur = {}; }
  cur[key] = data;
  writeFileSync(file, JSON.stringify(cur, null, 1));
}
