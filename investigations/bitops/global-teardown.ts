import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default function setup() {
  const dir = fileURLToPath(new URL('./raw', import.meta.url));
  mkdirSync(dir, { recursive: true });
  return () => {
    const out: Record<string, unknown> = { generatedBy: 'investigations/bitops (npx vitest run --config investigations/bitops/vitest.config.mts)' };
    for (const f of existsSync(dir) ? readdirSync(dir).sort() : []) if (f.endsWith('.json')) out[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
    writeFileSync(fileURLToPath(new URL('./results.json', import.meta.url)), JSON.stringify(out, null, 1));
  };
}
