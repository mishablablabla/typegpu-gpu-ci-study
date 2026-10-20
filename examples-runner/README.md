# TypeGPU docs-examples headless runner

Runs every example in `apps/typegpu-docs/src/examples/<category>/<name>/` of a TypeGPU checkout on a **real WebGPU device**
(dawn.node: Metal on a Mac, Vulkan -> Lavapipe or SwiftShader on Linux) with a fake browser around it, one isolated process
per (example, repeat). No docker assumptions; no browser; no `npm test`.

## Use

```bash
# once: runner deps (dawn.node, vite, jsdom, pngjs, jpeg-js) + the TypeGPU workspace deps (lockfile, no postinstall scripts)
TYPEGPU_ROOT=/path/to/TypeGPU ./setup.sh            # needs node >= 24, npm, pnpm 11

# run: <backend> only ASSERTS the adapter identity (metal|lavapipe|swiftshader|any); outdir must not exist
TYPEGPU_ROOT=/path/to/TypeGPU ./run-all.sh lavapipe /tmp/run-lvp
```

Env vars (all optional): `EX_FILTER` (comma list `category/name`, `name`, or `/regex/`), `EX_REPEATS` (default 2),
`EX_FRAMES` (default `3,30` = checkpoints), `EX_TIMEOUT_MS` (per process, default 180000; hard kill of the process group),
`EX_JOBS` (parallel processes, default 1), `EX_PNG` (PNG of canvas readbacks for repeat 1, default on),
`EX_TIMEOUT_OVERRIDES` (`{"tests/prefix-scan":600000}`), `EX_TYPEGPU_REV` (recorded in batch.json),
`HIDE_FEATURES=shader-f16,subgroups` (hide adapter features -> like-for-like comparisons; requesting a hidden feature fails like on a real adapter).

Outputs in `<outdir>`: `batch.json`, `runs.jsonl` (one classified row per run), `summary.{json,md}`, and per run
`<cat>--<name>/r<k>/{result.json,classification.json,stdout.txt,stderr.txt,wgsl.json.gz,cp<N>/*.bin.gz,cp<N>/canvas0.png}`.
Cross-backend: `node tools/compare.mjs out.json metal=<dir> lavapipe=<dir> swiftshader=<dir>` (first = reference; bit-identical or metrics).

## What one run does (`src/run-example.mjs`)

1. dawn.node `create()` kept referenced (GC rule); `navigator.gpu` proxy: records adapter info, feature/limit requests and
   whether `requestDevice` succeeded; `getPreferredCanvasFormat()` pinned to `bgra8unorm`.
2. Every device: `uncapturederror` listener (-> classification), `device.lost`, tracking of buffers/textures/shader modules
   (WGSL hash, `getCompilationInfo` errors), `importExternalTexture` -> "needs unavailable API".
3. jsdom DOM with the example's `index.html` in `<body>`; `canvas.getContext('webgpu')` = real texture (256x256, `clientWidth/Height` 256);
   `2d` = no-op context (marked *degraded*), `webgl*` = null (-> needs-unavailable-API); `OffscreenCanvas`, `ImageBitmap`,
   `createImageBitmap` (PNG/JPEG decoded from `apps/typegpu-docs/public`), `fetch('/TypeGPU/...')` served from `public/`,
   `copyExternalImageToTexture` -> `writeTexture`, `ResizeObserver` (fires once), `AudioContext` no-op, camera/video unavailable,
   external network blocked.
4. Pinned: `Math.random` (mulberry32, seed 1234), `performance.now` (= 5000 ms at import, +16.667 ms per rAF frame; NOT 0 because some
   examples seed RNGs with time x coordinate), manual `requestAnimationFrame` queue.
5. Vite SSR module runner + `unplugin-typegpu` (workspace source of the checkout, same include rule as the docs vitest config) imports
   the example; top-level await (init/assets/self-check) is awaited up to the budget.
6. Like the docs runtime (`executeExample`), calls the change handler of every non-button control once with its `initial` value after the import (default state of the page), then drives rAF frames up to each checkpoint (3, 30); examples without a frame loop are settled by GPU/fetch quiescence.
   Between the first and the second checkpoint: synthetic pointer/mouse/wheel/keyboard/resize events and every export `controls`
   entry is exercised once (button, select -> next option, toggle, slider -> middle). Their outcome is classified separately
   (`interact` column; errors there never change the primary class).
7. Checkpoint readback: canvas texture (raw + sha256 + PNG), every buffer/texture with `COPY_SRC` (<= 8 MB each; hash always, raw dump
   <= 256 KB), DOM text. `onCleanup()` is called last; the process then `exit(0)`s (native teardown must not hang a batch).

## Classes (`src/classify.mjs`)

`ran-clean` | `ran-with-gpu-validation-errors` (uncaptured errors / WGSL compile errors / unexpected device loss, in the default state) |
`threw` (import/frame/unhandled error) | `hung/timeout` | `crashed` (signal / non-zero exit, also at teardown) |
`needs-unavailable-API` (an API the runner cannot provide was touched and the example then failed) | `skipped(feature missing)`.
`checkable` = at least one non-zero canvas/buffer/texture readback. Notes carry `degraded:` (2D canvas/audio faked) and post-interaction errors.

## Shim deviations a reader must know

* dawn.node 0.6.2 treats `Float16Array` as 0 bytes in `queue.writeTexture` (validation error) and writes **zeros** in `queue.writeBuffer`;
  the shim re-views it as bytes (what browsers do). Counted in `result.json:shimFixes`.
* jsdom rejects Node's `AbortSignal` in `addEventListener({signal})`: emulated.
* A no-op 2D canvas means examples that draw text/patterns on a 2D canvas (suika-sdf, jelly-slider numbers, texture-mipmaps/-write-3d patterns, mnist drawing pad) run with blank inputs.

Runtime (194 processes = 97 examples x 2 repeats, HEAD e893ad11): Metal M3 Pro 15.6 min sequential (median 4.4 s per process; ~8 min with `EX_JOBS=2`); Lavapipe (Mesa 25.2.8) in an arm64 2-CPU container 26 min (heaviest: ripple-cube 183 s, 3d-fish 67 s); SwiftShader in an arm64 2-CPU container 46 min (heaviest: threejs/attractors 345-400 s, compute-particles-snow 170-200 s, ripple-cube 124 s, compute-particles 90-120 s) -> give SwiftShader `EX_TIMEOUT_MS>=450000`. Native x86_64 timings are not measured yet.

Known non-determinism sources the runner cannot remove: asynchronous work that races the frame driver (three.js compute, debounce timers > 2 s, polling loops), real GPU races. Compare cp3 (default state) first; cp30 follows a synthetic interaction that fires async handlers.
