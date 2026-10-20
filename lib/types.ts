import { d } from 'typegpu';

type Any = any;
export type Elem = 'f32' | 'f16' | 'i32' | 'u32';

export interface TypeDesc {
  name: string;
  elem: Elem;
  lanes: number;
  vec: boolean;
  schema: Any;
  make(lanes: number[]): Any;
  lanesOf(v: Any): number[];
}

function scalar(name: string, elem: Elem, schema: Any): TypeDesc {
  return { name, elem, lanes: 1, vec: false, schema, make: (l) => l[0]!, lanesOf: (v) => [Number(v)] };
}
function vector(name: string, elem: Elem, lanes: number, schema: Any): TypeDesc {
  return { name, elem, lanes, vec: true, schema, make: (l) => (d as Any)[name](...l), lanesOf: (v) => Array.from(v as ArrayLike<number>) };
}

export const TY: Record<string, TypeDesc> = {
  f32: scalar('f32', 'f32', d.f32),
  vec2f: vector('vec2f', 'f32', 2, d.vec2f),
  vec3f: vector('vec3f', 'f32', 3, d.vec3f),
  vec4f: vector('vec4f', 'f32', 4, d.vec4f),
  f16: scalar('f16', 'f16', d.f16),
  vec2h: vector('vec2h', 'f16', 2, d.vec2h),
  vec4h: vector('vec4h', 'f16', 4, d.vec4h),
  i32: scalar('i32', 'i32', d.i32),
  vec2i: vector('vec2i', 'i32', 2, d.vec2i),
  vec3i: vector('vec3i', 'i32', 3, d.vec3i),
  vec4i: vector('vec4i', 'i32', 4, d.vec4i),
  u32: scalar('u32', 'u32', d.u32),
  vec2u: vector('vec2u', 'u32', 2, d.vec2u),
  vec3u: vector('vec3u', 'u32', 3, d.vec3u),
  vec4u: vector('vec4u', 'u32', 4, d.vec4u),
};

export const FLOAT_TYPES = ['f32', 'vec2f', 'vec3f', 'vec4f'];
export const I32_TYPES = ['i32', 'vec2i', 'vec3i', 'vec4i'];
export const U32_TYPES = ['u32', 'vec2u', 'vec3u', 'vec4u'];
export const F16_TYPES = ['f16', 'vec2h', 'vec4h'];

export const shiftAmountType = (t: TypeDesc): TypeDesc => TY[t.vec ? `vec${t.lanes}u` : 'u32']!;
