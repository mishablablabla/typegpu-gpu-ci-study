const BLOCKING = /^(camera|video|webgl|webgl2|image-decode|copyExternalImageToTexture-source|copyExternalImageToTexture-format|Worker|network|OffscreenCanvas\..*|createImageBitmap-source|canvas-2d|experimental-webgl|bitmaprenderer)$/;

export function classify(result, exit) {
  const notes = [];
  const r = result ?? {};
  const out = (cls, detail) => ({ class: cls, detail: detail ? String(detail).slice(0, 300) : '', notes });
  const adapterFeatures = new Set(r.adapter?.exposedFeatures ?? []);
  const unav = (r.unavailable ?? []).filter((u) => BLOCKING.test(u.api));
  const unavNames = [...new Set(unav.map((u) => u.api))];
  if (r.degraded?.length) notes.push(...r.degraded.map((d) => `degraded: ${d}`));
  const lastStage = r.stage ?? 'unknown';
  const maxFrames = Math.max(...(r.frames ?? [0]));
  const partial = !!(r.frameLoopRan && !r.noFrameLoop && (r.framesDriven ?? 0) < maxFrames);
  if (partial) notes.push(`partial: only ${r.framesDriven} of ${maxFrames} frames within the time budget`);

  if (exit?.timedOut || r.importTimeout) {
    if (unavNames.length && r.importTimeout) return out('needs-unavailable-API', `${unavNames.join(',')}: import never finished (${r.importError?.message ?? ''})`);
    return out('hung/timeout', exit?.timedOut ? `killed by the batch after ${exit.wallMs} ms; last stage ${lastStage}, frames ${r.framesDriven ?? '?'}` : r.importError?.message);
  }
  if (!r.final || exit?.signal || (exit?.code ?? 0) !== 0) {
    if (r.final) notes.push('crash after result was complete (teardown/exit)');
    return out('crashed', `${exit?.signal ?? 'exit ' + exit?.code}; last stage ${lastStage}${exit?.stderrTail ? '; ' + exit.stderrTail : ''}`);
  }
  const POST = new Set(['interact', 'post-interact']);
  const errs = [...(r.importError ? [{ where: 'import', message: r.importError.message, stage: 'import' }] : []), ...(r.jsErrors ?? []).filter((e) => e.stage !== 'cleanup' && !POST.has(e.stage))];
  const postJs = (r.jsErrors ?? []).filter((e) => POST.has(e.stage));
  const postGpu = (r.gpuErrors ?? []).filter((e) => POST.has(e.stage));
  const postParts = [postJs.length ? `${postJs.length} js error(s): ${postJs[0].message.slice(0, 100)}` : '', postGpu.length ? `${postGpu.length} gpu error(s): ${postGpu[0].message.split('\n')[0].slice(0, 120)}` : ''].filter(Boolean);
  if (postParts.length) notes.push('after synthetic interaction: ' + postParts.join('; '));
  const cleanupErrs = (r.jsErrors ?? []).filter((e) => e.stage === 'cleanup');
  if (cleanupErrs.length) notes.push(`cleanup error: ${cleanupErrs[0].message.slice(0, 150)}`);
  if (r.interaction?.errors?.length) notes.push(`interaction errors: ${r.interaction.errors.length} (${r.interaction.errors[0].slice(0, 100)})`);
  const failedReq = (r.deviceRequests ?? []).filter((q) => !q.ok);
  if (failedReq.length) {
    const missing = [...new Set(failedReq.flatMap((q) => q.requiredFeatures.filter((f) => !adapterFeatures.has(f))))];
    if (missing.length) return out('skipped(feature missing)', `${missing.join(',')} not exposed by the adapter`);
    return out(errs.length ? 'threw' : 'threw', `requestDevice failed: ${failedReq[0].message}`);
  }
  if (errs.length) {
    const m = errs[0].message;
    if (/shader-f16|subgroups|timestamp-query|float32-filterable|texture-compression|feature/i.test(m) && /not (supported|available)|unsupported|requires|missing|not exposed/i.test(m) && r.adapter && !adapterFeatures.has((m.match(/shader-f16|subgroups|timestamp-query|float32-filterable/i) ?? [''])[0])) {
      return out('skipped(feature missing)', m);
    }
    if (unavNames.length) return out('needs-unavailable-API', `${unavNames.join(',')} -> ${m}`);
    return out('threw', `${errs[0].where ? errs[0].where + ': ' : ''}${m}`);
  }

  const lostBad = (r.deviceLost ?? []).filter((l) => l.reason !== 'destroyed');
  const out2 = (c, d) => { const o = out(c, d); o.interact = postParts.length ? 'errors' : 'clean'; o.partial = partial; return o; };
  if ((r.gpuErrorsPerStage?.cleanup ?? 0) > 0) notes.push(`gpu errors during cleanup only: ${r.gpuErrorsPerStage.cleanup}`);
  const stageCount = (s) => (r.gpuErrorsPerStage?.[s] ?? 0);
  const total = Object.entries(r.gpuErrorsPerStage ?? {}).filter(([s]) => s !== 'cleanup' && !POST.has(s)).reduce((a, [, n]) => a + n, 0);
  if (total > 0 || (r.shaderCompileErrorsPrimary ?? r.shaderCompileErrors) > 0 || lostBad.length) {
    const first = (r.gpuErrors ?? []).find((e) => e.stage !== 'cleanup' && !POST.has(e.stage));
    return out2('ran-with-gpu-validation-errors', `${total} uncaptured error(s)${(r.shaderCompileErrorsPrimary ?? r.shaderCompileErrors) ? `, ${r.shaderCompileErrorsPrimary ?? r.shaderCompileErrors} WGSL compile error(s)` : ''}${lostBad.length ? ', device lost: ' + lostBad[0].message : ''}${first ? ' | ' + first.kind + ': ' + first.message : ''}`);
  }
  if (unavNames.length) notes.push(`touched unavailable API without failing: ${unavNames.join(',')}`);
  return out2('ran-clean', '');
}

export function checkable(result) {
  const r = result ?? {}; const cp = r.checkpoints?.['30'] ?? r.checkpoints?.[Object.keys(r.checkpoints ?? {}).pop()] ?? {};
  const canv = (cp.canvases ?? []).filter((c) => c.sha256), bufs = (cp.buffers ?? []).filter((b) => b.sha256), texs = (cp.textures ?? []).filter((t) => t.sha256);
  return {
    hasCanvas: canv.length > 0, canvasNonBlank: canv.some((c) => c.nonZero), buffers: bufs.length, buffersNonZero: bufs.filter((b) => b.nonZero).length, textures: texs.length,
    domText: (cp.dom?.text ?? '').length > 0,
    checkable: canv.some((c) => c.nonZero) || bufs.some((b) => b.nonZero) || texs.some((t) => t.nonZero),
  };
}
