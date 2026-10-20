// usage: node assert-identity.mjs <lavapipe|swiftshader> <dir>   (dir has vulkaninfo.txt loader-trace.txt adapter-strict.json). Exit 3 on failure. Writes backend-assert.txt + identity.json.
// Derived from docker/in-container/assert-backend.mjs (SwiftShader checks) + the Lavapipe identity rule of docker/in-container/ex-in-container.sh; "other ICD manifests / mesa installed" are recorded, not gated, on a native runner (VK_DRIVER_FILES restricts the loader).
import fs from 'node:fs';
const [B, D] = process.argv.slice(2); const rd = (f) => { try { return fs.readFileSync(`${D}/${f}`, 'utf8'); } catch { return ''; } };
const vk = rd('vulkaninfo.txt'), trace = rd('loader-trace.txt'); let probe = {}; try { probe = JSON.parse(rd('adapter-strict.json')); } catch {}
const res = []; const chk = (name, ok, detail = '') => res.push({ name, ok: !!ok, detail });
const gpus = vk.match(/^GPU\d+:/gm) || []; chk('vulkaninfo lists exactly one GPU', gpus.length === 1, gpus.join(','));
chk('deviceType CPU', /deviceType\s*=\s*PHYSICAL_DEVICE_TYPE_CPU/.test(vk));
if (B === 'swiftshader') {
  chk('vendorID 0x1ae0', /vendorID\s*=\s*0x1ae0/i.test(vk)); chk('deviceID 0xc0de', /deviceID\s*=\s*0xc0de/i.test(vk));
  chk('deviceName SwiftShader Device', /deviceName\s*=\s*SwiftShader Device/.test(vk)); chk('driverID SwiftShader', /driverID\s*=\s*DRIVER_ID_GOOGLE_SWIFTSHADER/.test(vk));
  chk('loader trace mentions swiftshader', /swiftshader/i.test(trace)); chk('no lvp/llvmpipe in loader trace or vulkaninfo', !/lvp|llvmpipe/i.test(trace + vk));
  chk('strict adapter (forceFallbackAdapter) non-null', probe.strictAdapterNull === false); chk('strict == plain adapter', probe.sameAdapterStrictVsPlain === true);
  chk('adapter vendor google / architecture swiftshader', probe.plain?.vendor === 'google' && probe.plain?.architecture === 'swiftshader', `${probe.plain?.vendor}/${probe.plain?.architecture}/${probe.plain?.device}`);
  chk('no mesa/llvmpipe/apple/nvidia/amd/intel in adapter strings', !/mesa|llvmpipe|apple|metal|nvidia|amd|intel/i.test(JSON.stringify(probe.plain || {})));
} else if (B === 'lavapipe') {
  chk('deviceName llvmpipe', /deviceName\s*=\s*llvmpipe/.test(vk)); chk('driverID MESA_LLVMPIPE', /driverID\s*=\s*DRIVER_ID_MESA_LLVMPIPE/.test(vk));
  chk('no swiftshader in loader trace or vulkaninfo', !/swiftshader/i.test(trace + vk));
  chk('adapter vendor mesa / device llvmpipe*', probe.plain?.vendor === 'mesa' && /^llvmpipe/.test(probe.plain?.device || ''), `${probe.plain?.vendor}/${probe.plain?.architecture}/${probe.plain?.device}`);
  chk('no swiftshader/apple/nvidia/amd/intel in adapter strings', !/swiftshader|apple|metal|nvidia|amd|intel/i.test(JSON.stringify(probe.plain || {})));
} else chk('known backend argument', false, B);
chk('requestDevice (default) ok', probe.defaultDevice === 'ok', String(probe.defaultDevice));
const ok = res.every((r) => r.ok);
const idn = { schema: 'soak-identity/1', backend: B, pass: ok, adapter: probe.plain ?? null, isFallbackAdapter: probe.plain?.isFallbackAdapter ?? null, shaderF16: probe.shaderF16 ?? null, featureCount: (probe.features || []).length, ctsStyleDevice: probe.ctsStyleDevice ?? null,
  vulkan: { deviceName: (vk.match(/deviceName\s*=\s*(.*)/) || [])[1] ?? null, driverInfo: (vk.match(/driverInfo\s*=\s*(.*)/) || [])[1] ?? null, driverVersion: (vk.match(/driverVersion\s*=\s*(.*)/) || [])[1] ?? null, apiVersion: (vk.match(/apiVersion\s*=\s*(.*)/) || [])[1] ?? null, instanceVersion: (vk.match(/Vulkan Instance Version:\s*(.*)/) || [])[1] ?? null },
  checks: res };
fs.writeFileSync(`${D}/identity.json`, JSON.stringify(idn, null, 1));
fs.writeFileSync(`${D}/backend-assert.txt`, res.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`).join('\n') + `\nRESULT: ${ok ? 'PASS' : 'FAIL'}\n`);
console.log(fs.readFileSync(`${D}/backend-assert.txt`, 'utf8')); process.exit(ok ? 0 : 3);
