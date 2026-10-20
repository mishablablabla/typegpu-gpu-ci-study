#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(join(root, 'reports'), { recursive: true, force: true });
mkdirSync(join(root, 'reports', 'cases'), { recursive: true });

const extra = process.argv.slice(2);
const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--silent', '--reporter=dot', '--reporter=json', '--outputFile.json=reports/vitest.json', ...extra],
  { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] },
);
const report = spawnSync('node', ['scripts/report.mjs'], { cwd: root, stdio: 'inherit' });
process.exit(vitest.status || report.status || 0);
