import fs from 'node:fs';
const D = process.argv[2]; const rd = (f) => { try { return fs.readFileSync(`${D}/${f}`, 'utf8'); } catch { return ''; } };
const vk = rd('vulkaninfo.txt'), trace = rd('loader-trace.txt'), env = rd('env.txt'), icdFiles = rd('icd-dirs.txt');
let probe = {}; try { probe = JSON.parse(rd('adapter-strict.json')); } catch {}
const res = []; const chk = (name, ok, detail = '') => res.push({ name, ok: !!ok, detail });
const names = [...vk.matchAll(/^\s*deviceName\s*=\s*(.*)$/gm)].map((m) => m[1].trim());
chk('vulkaninfo lists exactly one device', names.length === 1, names.join(' | '));
chk('deviceName is llvmpipe', names.length === 1 && /^llvmpipe \(LLVM [\d.]+/.test(names[0]), names[0]);
chk('deviceType CPU', /deviceType\s*=\s*PHYSICAL_DEVICE_TYPE_CPU/.test(vk));
chk('no SwiftShader in vulkaninfo / loader trace / ICD dirs', !/swiftshader/i.test(vk + trace + icdFiles));
chk('loader trace mentions lvp', /lvp|llvmpipe/i.test(trace));
const info = (vk.match(/driverInfo\s*=\s*(.*)/) || [])[1]?.trim() ?? '';
const llvmVer = (names[0]?.match(/LLVM ([\d.]+)/) || [])[1] ?? '';
chk('driverInfo is Mesa', /^Mesa /.test(info), info);
const expect = process.env.EXPECT_MESA || '';
if (expect) { const up = expect.replace(/^\d+:/, '').match(/^(\d+\.\d+(?:\.\d+)?)/)?.[1]; chk(`driverInfo Mesa version == expected upstream ${up} (package ${expect})`, !!up && info.startsWith(`Mesa ${up}`) , info); }
chk('mesa-vulkan-drivers installed with expected version', !expect || new RegExp(`mesa-vulkan-drivers ${expect.replace(/[.*+?^${}()|[\]\\~]/g, '\\$&')}$`, 'm').test(env), expect);
chk('plain adapter non-null', probe.plainAdapterNull === false);
chk('adapter vendor mesa', probe.plain?.vendor === 'mesa', `${probe.plain?.vendor}/${probe.plain?.architecture}/${probe.plain?.device}`);
chk('adapter strings have no swiftshader/apple/nvidia/amd/intel', !/swiftshader|apple|metal|nvidia|amd|intel/i.test(JSON.stringify(probe.plain || {})));
chk('requestDevice (default) ok', probe.defaultDevice === 'ok', String(probe.defaultDevice));
const meta = { strictAdapterNull: probe.strictAdapterNull, plainAdapterNull: probe.plainAdapterNull, mesaDriverInfo: info, llvm: llvmVer, shaderF16: probe.shaderF16, ctsStyleDevice: probe.ctsStyleDevice, features: (probe.features || []).length, adapter: probe.plain };
const ok = res.every((r) => r.ok);
fs.writeFileSync(`${D}/backend-assert.txt`, res.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`).join('\n') + `\ninfo: ${JSON.stringify(meta)}\nRESULT: ${ok ? 'PASS' : 'FAIL'}\n`);
console.log(fs.readFileSync(`${D}/backend-assert.txt`, 'utf8')); process.exit(ok ? 0 : 3);
