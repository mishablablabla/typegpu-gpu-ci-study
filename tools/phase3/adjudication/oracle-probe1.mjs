import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
const { FP } = require('../../../third_party/cts-oracle.cjs');
const f=Math.fround; const show=(n,I,got)=>console.log(n, 'I=[',I.begin,',',I.end,']','got',got, I.begin<=got&&got<=I.end?'INSIDE':'OUTSIDE');
show('asin(-0.5) lav', FP.f32.asinInterval(-0.5), -0.5233885049819946);
show('asin(-0.5) metal-like', FP.f32.asinInterval(-0.5), -0.5235987901687622);
show('asin(.99) lav', FP.f32.asinInterval(f(0.99)), 1.4294887781143188);
show('asin(.9013) lav', FP.f32.asinInterval(-0.9013176560401917), -1.1231578588485718);
console.log(Object.keys(FP.f32).filter(k=>/mix|fract|asin|acos|length|atan|dot|normalize|distance|fma/i.test(k)).join(' '));
