import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const path = fileURLToPath(new URL('./results.json', import.meta.url));
export function saveEvidence(key: string, value: unknown) {
  const cur = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  cur[key] = value;
  writeFileSync(path, JSON.stringify(cur, null, 1));
}
