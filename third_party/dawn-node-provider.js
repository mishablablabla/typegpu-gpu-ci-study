const path = require('node:path');
const w = require(process.env.WEBGPU_PKG || path.resolve(__dirname, '../node_modules/webgpu'));
Object.assign(globalThis, w.globals);
module.exports = { create: (flags) => w.create(flags) };
