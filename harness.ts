import { create, globals } from 'webgpu';
import { tgpu, d, std } from 'typegpu';

Object.assign(globalThis, globals);

// dawn.node tears Dawn down when this object is garbage collected, which crashes the process
// ("mutex lock failed"). Keep it referenced for the whole process lifetime.
export const gpu = create([]);

const adapter = await gpu.requestAdapter();
if (!adapter) throw new Error('requestAdapter returned null');

export const hasF16 = adapter.features.has('shader-f16');
export const adapterInfo = adapter.info;
export const adapterFeatures = Array.from(adapter.features as Iterable<string>).sort();
const device = await adapter.requestDevice({
  requiredFeatures: hasF16 ? (['shader-f16'] as GPUFeatureName[]) : [],
});
export const root = tgpu.initFromDevice({ device });


type Any = any;

const elemOf = (kind: string): Any =>
  kind.endsWith('u') ? d.u32 : kind.endsWith('i') ? d.i32 : kind.endsWith('h') ? d.f16 : d.f32;

export const T = (schema: Any, value: number) => ({ __schema: schema, value });
const isT = (v: Any) => v && typeof v === 'object' && '__schema' in v;
const valOf = (v: Any) => (isT(v) ? v.value : v);

function schemaOf(v: Any, all: Any[] = []): Any {
  if (isT(v)) return v.__schema;
  if (typeof v === 'number') {
    const other = all.find((x) => typeof x !== 'number' && !isT(x));
    return other ? elemOf(other.kind) : d.f32;
  }
  return (d as Any)[v.kind];
}

function defaultOut(args: Any[]): Any {
  const typed = args.find(isT);
  if (typed && args.every((x) => typeof x === 'number' || isT(x))) return typed.__schema;
  const vec = args.find((x) => typeof x !== 'number' && !isT(x) && String(x.kind).startsWith('vec'));
  const mat = args.find((x) => typeof x !== 'number' && !isT(x) && String(x.kind).startsWith('mat'));
  if (vec && mat) return schemaOf(vec);
  const first = args.find((x) => typeof x !== 'number' && !isT(x));
  return first ? schemaOf(first) : d.f32;
}

export async function run(f: Any, args: Any[], outSchema?: Any): Promise<Any> {
  const ins = args.map((a) => root.createMutable(schemaOf(a, args), valOf(a)));
  const o = root.createMutable(outSchema ?? defaultOut(args));
  const [i0, i1, i2, i3] = ins as Any[];

  const pipeline =
    args.length === 0
      ? root.createGuardedComputePipeline(() => { 'use gpu'; o.$ = f(); })
      : args.length === 1
        ? root.createGuardedComputePipeline(() => { 'use gpu'; o.$ = f(i0.$); })
        : args.length === 2
          ? root.createGuardedComputePipeline(() => { 'use gpu'; o.$ = f(i0.$, i1.$); })
          : args.length === 3
            ? root.createGuardedComputePipeline(() => { 'use gpu'; o.$ = f(i0.$, i1.$, i2.$); })
            : root.createGuardedComputePipeline(() => { 'use gpu'; o.$ = f(i0.$, i1.$, i2.$, i3.$); });
  pipeline.dispatchThreads();

  const result = await o.read();
  for (const b of [...ins, o]) (b as Any).buffer.destroy();
  return result;
}

const un = (f: Any, out?: Any) => (a: Any) => run(f, [a], out);
const bin = (f: Any, out?: Any) => (a: Any, b: Any) => run(f, [a, b], out);
const tri = (f: Any, out?: Any) => (a: Any, b: Any, c: Any) => run(f, [a, b, c], out);

export const g = {
  log: un((a: Any) => { 'use gpu'; return std.log(a); }),
  sqrt: un((a: Any) => { 'use gpu'; return std.sqrt(a); }),
  exp2: un((a: Any) => { 'use gpu'; return std.exp2(a); }),
  cosh: un((a: Any) => { 'use gpu'; return std.cosh(a); }),
  fract: un((a: Any) => { 'use gpu'; return std.fract(a); }),
  sign: un((a: Any) => { 'use gpu'; return std.sign(a); }),
  normalize: un((a: Any) => { 'use gpu'; return std.normalize(a); }),
  saturate: un((a: Any) => { 'use gpu'; return std.saturate(a); }),
  length: un((a: Any) => { 'use gpu'; return std.length(a); }, d.f32),
  pow: bin((a: Any, b: Any) => { 'use gpu'; return std.pow(a, b); }),
  dot: bin((a: Any, b: Any) => { 'use gpu'; return std.dot(a, b); }, d.f32),
  distance: bin((a: Any, b: Any) => { 'use gpu'; return std.distance(a, b); }, d.f32),
  clamp: tri((a: Any, b: Any, c: Any) => { 'use gpu'; return std.clamp(a, b, c); }),
  fma: tri((a: Any, b: Any, c: Any) => { 'use gpu'; return std.fma(a, b, c); }),
  mix: tri((a: Any, b: Any, c: Any) => { 'use gpu'; return std.mix(a, b, c); }),
  add: bin((a: Any, b: Any) => { 'use gpu'; return std.add(a, b); }),
  sub: bin((a: Any, b: Any) => { 'use gpu'; return std.sub(a, b); }),
  mul: bin((a: Any, b: Any) => { 'use gpu'; return std.mul(a, b); }),
  div: bin((a: Any, b: Any) => { 'use gpu'; return std.div(a, b); }),
  mod: bin((a: Any, b: Any) => { 'use gpu'; return std.mod(a, b); }),
  log2: un((a: Any) => { 'use gpu'; return std.log2(a); }),
  acos: un((a: Any) => { 'use gpu'; return std.acos(a); }),
  asin: un((a: Any) => { 'use gpu'; return std.asin(a); }),
  acosh: un((a: Any) => { 'use gpu'; return std.acosh(a); }),
  round: un((a: Any) => { 'use gpu'; return std.round(a); }),
  neg: un((a: Any) => { 'use gpu'; return std.neg(a); }),
  inverseSqrt: un((a: Any) => { 'use gpu'; return std.inverseSqrt(a); }),
  step: bin((a: Any, b: Any) => { 'use gpu'; return std.step(a, b); }),
  atan2: bin((a: Any, b: Any) => { 'use gpu'; return std.atan2(a, b); }),
  reflect: bin((a: Any, b: Any) => { 'use gpu'; return std.reflect(a, b); }),
  cross: bin((a: Any, b: Any) => { 'use gpu'; return std.cross(a, b); }),
  smoothstep: tri((a: Any, b: Any, c: Any) => { 'use gpu'; return std.smoothstep(a, b, c); }, undefined),
};

export const smoothstepGpu = (e0: Any, e1: Any, x: Any) =>
  run((a: Any, b: Any, c: Any) => { 'use gpu'; return std.smoothstep(a, b, c); }, [e0, e1, x], typeof x === 'number' ? d.f32 : (d as Any)[x.kind]);

export async function shutdown() {
  root.destroy();
  device.destroy();
}

export async function mapUnary(f: Any, xs: number[]): Promise<number[]> {
  const n = xs.length;
  const inp = root.createMutable(d.arrayOf(d.f32, n), xs);
  const out = root.createMutable(d.arrayOf(d.f32, n));
  root
    .createGuardedComputePipeline((i) => {
      'use gpu';
      out.$[i] = f(inp.$[i]);
    })
    .dispatchThreads(n);
  const res = Array.from(await out.read());
  inp.buffer.destroy();
  out.buffer.destroy();
  return res;
}

export async function mapBinary(f: Any, xs: number[], ys: number[]): Promise<number[]> {
  const n = xs.length;
  const a = root.createMutable(d.arrayOf(d.f32, n), xs);
  const b = root.createMutable(d.arrayOf(d.f32, n), ys);
  const out = root.createMutable(d.arrayOf(d.f32, n));
  root
    .createGuardedComputePipeline((i) => {
      'use gpu';
      out.$[i] = f(a.$[i], b.$[i]);
    })
    .dispatchThreads(n);
  const res = Array.from(await out.read());
  for (const x of [a, b, out]) x.buffer.destroy();
  return res;
}
