import fs from 'node:fs';
import zlib from 'node:zlib';
export function readJson(p) {
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  if (fs.existsSync(p + '.gz')) return JSON.parse(zlib.gunzipSync(fs.readFileSync(p + '.gz')).toString('utf8'));
  throw new Error('missing ' + p + '(.gz)');
}
