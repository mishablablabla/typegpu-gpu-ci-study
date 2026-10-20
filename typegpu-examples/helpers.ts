import { vi } from 'vitest';
export const EXAMPLES = './vendor/apps/typegpu-docs/src/examples';
export const els = () => (globalThis as any).__els as Map<string, any>;
export const rec = (n: string, d: unknown) => (globalThis as any).__record(n, d);
export const wait = async (f: () => boolean, ms = 600000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout waiting for example'); await new Promise((r) => setTimeout(r, 20)); } };
export function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const pinRandom = (seed: number) => vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
export const nums = (h: string) => [...h.matchAll(/<div>(-?[\d.]+)<\/div>/g)].map((m) => Number(m[1]));
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
export const bitsOf = (a: ArrayLike<number>) => Array.from(a, (x) => { f32[0] = x; return u32[0].toString(16).padStart(8, '0'); });
