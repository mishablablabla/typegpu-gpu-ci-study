import fs from 'node:fs'; import path from 'node:path';
const R = process.env.TYPEGPU_ROOT; if (!R) throw new Error('set TYPEGPU_ROOT to a TypeGPU checkout at e893ad11');
const walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, acc); else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) acc.push(p); } return acc; };
const usedIn = (src) => { const names = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](?:typegpu\/std|\.\.?\/[^'"]*\/std(?:\/index)?(?:\.js|\.ts)?)['"]/g)) for (const n of m[1].split(',')) { const nm = n.trim().split(/\s+as\s+/)[0]?.trim(); if (nm && !nm.startsWith('type ')) names.add(nm); }
  const ns = [...src.matchAll(/import\s*\*\s*as\s+(\w+)\s+from\s*['"]typegpu\/std['"]/g)].map((m) => m[1]); for (const a of ns) for (const m of src.matchAll(new RegExp(`\\b${a}\\.(\\w+)\\b`, 'g'))) names.add(m[1]);
  for (const m of src.matchAll(/\bstd\.(\w+)\b/g)) names.add(m[1]);
  return names; };
const ex = path.join(R, 'apps/typegpu-docs/src/examples'); const exFiles = walk(ex); const perExample = {};
for (const f of exFiles) { const rel = path.relative(ex, f).split('/'); if (rel.length < 3) continue; const key = `${rel[0]}/${rel[1]}`; const names = usedIn(fs.readFileSync(f, 'utf8')); (perExample[key] ??= new Set()); for (const n of names) perExample[key].add(n); }
const libs = fs.readdirSync(path.join(R, 'packages')).filter((d) => /^typegpu-(noise|sdf|color|geometry|sort|radiance-cascades|gl|three|react)$/.test(d)); const perLib = {};
for (const l of libs) { const files = walk(path.join(R, 'packages', l, 'src')); const set = new Map(); for (const f of files) for (const n of usedIn(fs.readFileSync(f, 'utf8'))) set.set(n, (set.get(n) ?? 0) + 1); perLib[l] = Object.fromEntries(set); }
const exCount = {}; for (const [k, s] of Object.entries(perExample)) for (const n of s) exCount[n] = (exCount[n] ?? 0) + 1;
const libCount = {}; for (const [l, m] of Object.entries(perLib)) for (const n of Object.keys(m)) libCount[n] = (libCount[n] ?? 0) + 1;
const out = { snapshot: R, examplesScanned: Object.keys(perExample).length, examplesWithAnyStd: Object.values(perExample).filter((s) => s.size).length, exCount, libCount, perLib, perExample: Object.fromEntries(Object.entries(perExample).map(([k, s]) => [k, [...s].sort()])) };
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1)); const top = Object.entries(exCount).sort((a, b) => b[1] - a[1]); console.log('examples', out.examplesScanned, 'with std', out.examplesWithAnyStd); console.log(top.map(([n, c]) => `${n}:${c}${libCount[n] ? '/L' + libCount[n] : ''}`).join(' '));
