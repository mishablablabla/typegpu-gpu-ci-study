const path = require('node:path');
const CTS = process.env.CTS_DIR || path.resolve(__dirname, 'cts');
process.chdir(CTS);
require(path.join(CTS, 'src/common/tools/setup-ts-in-node.js'));
const fp = require(path.join(CTS, 'src/webgpu/util/floating_point.ts'));
const num = require(path.join(CTS, 'src/webgpu/util/math.ts'));
module.exports = { FP: fp.FP, fp, num, CTS };
