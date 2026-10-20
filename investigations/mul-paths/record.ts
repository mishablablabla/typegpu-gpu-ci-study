import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const path = fileURLToPath(new URL('./results.json', import.meta.url));
export function record(section: string, data: unknown) {
  const cur = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  cur[section] = data;
  writeFileSync(path, JSON.stringify(cur, null, 1));
}
