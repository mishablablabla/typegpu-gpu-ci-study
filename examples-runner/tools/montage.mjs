// usage: node montage.mjs <out.png> <cp> <ex1,ex2,...> <label=rundir> [...]   rows = examples, columns = each backend's canvas0 PNG (repeat 1) + |diff| vs the first backend (x4, amplified)
import fs from 'node:fs'; import path from 'node:path'; import { PNG } from 'pngjs';
const [, , out, cp, exs, ...specs] = process.argv; const runs = specs.map((s) => { const [l, d] = s.split('='); return { l, d: path.resolve(d) }; });
const W = 256, H = 256; const rows = exs.split(',');
const cols = runs.length + (runs.length - 1);
const img = new PNG({ width: cols * W + (cols + 1) * 2, height: rows.length * H + (rows.length + 1) * 2, fill: true }); img.data.fill(40);
const load = (d, ex) => { try { return PNG.sync.read(fs.readFileSync(path.join(d, ex.replace('/', '--'), 'r1', `cp${cp}`, 'canvas0.png'))); } catch { return null; } };
rows.forEach((ex, r) => {
  const ps = runs.map((x) => load(x.d, ex)); const y0 = 2 + r * (H + 2);
  ps.forEach((p, c) => { if (!p) return; const x0 = 2 + c * (W + 2); for (let y = 0; y < Math.min(H, p.height); y++) for (let x = 0; x < Math.min(W, p.width); x++) { const si = (y * p.width + x) * 4, di = ((y0 + y) * img.width + x0 + x) * 4; img.data.set(p.data.subarray(si, si + 4), di); } });
  for (let k = 1; k < runs.length; k++) { const a = ps[0], b = ps[k]; if (!a || !b) continue; const x0 = 2 + (runs.length + k - 1) * (W + 2); for (let y = 0; y < Math.min(H, a.height, b.height); y++) for (let x = 0; x < Math.min(W, a.width, b.width); x++) { const ai = (y * a.width + x) * 4, bi = (y * b.width + x) * 4, di = ((y0 + y) * img.width + x0 + x) * 4; for (let c = 0; c < 3; c++) img.data[di + c] = Math.min(255, 4 * Math.abs(a.data[ai + c] - b.data[bi + c])); img.data[di + 3] = 255; } }
});
fs.writeFileSync(out, PNG.sync.write(img)); console.error('wrote', out, rows.join(' '));
