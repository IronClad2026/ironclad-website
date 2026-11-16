function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0;
}

export class VisibleFrameMetrics {
  constructor(renderer, mode) {
    this.renderer = renderer;
    this.mode = mode;
    this.totalDraws = 0;
    this.samples = new Set();
    this.gl = renderer.getContext();
    const extension = this.gl.getExtension('WEBGL_debug_renderer_info');
    this.graphics = {
      vendor: this.gl.getParameter(extension?.UNMASKED_VENDOR_WEBGL ?? this.gl.VENDOR),
      renderer: this.gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? this.gl.RENDERER),
      version: this.gl.getParameter(this.gl.VERSION),
      antialias: this.gl.getContextAttributes()?.antialias ?? false,
    };
  }

  measure(durationMs) {
    const duration = Math.min(30_000, Math.max(500, durationMs));
    return new Promise((resolve, reject) => {
      this.samples.add({ duration, resolve, reject, start: null, last: null, frames: [] });
    });
  }

  record(timestamp, submitMs) {
    this.totalDraws += 1;
    if (!this.samples.size) return;
    const { calls, triangles } = this.renderer.info.render;
    for (const sample of this.samples) {
      sample.start ??= timestamp;
      if (sample.last !== null) {
        sample.frames.push({ interval: timestamp - sample.last, submitMs, calls, triangles, mode: this.mode() });
      }
      sample.last = timestamp;
      const elapsed = timestamp - sample.start;
      if (elapsed >= sample.duration) {
        sample.resolve(this.report(sample.frames, elapsed));
        this.samples.delete(sample);
      }
    }
  }

  report(frames, elapsedMs) {
    const canvas = this.renderer.domElement;
    const intervals = frames.map(frame => frame.interval);
    const submissions = frames.map(frame => frame.submitMs);
    const calls = frames.map(frame => frame.calls);
    const triangles = frames.map(frame => frame.triangles);
    return {
      graphics: this.graphics,
      userAgent: navigator.userAgent,
      visibility: document.visibilityState,
      mode: [...new Set(frames.map(frame => frame.mode))],
      window: [window.innerWidth, window.innerHeight],
      canvasCSS: [canvas.clientWidth, canvas.clientHeight],
      drawingBuffer: [canvas.width, canvas.height],
      devicePixelRatio: window.devicePixelRatio,
      elapsedMs,
      drawnFrames: frames.length,
      drawnFPS: frames.length * 1000 / elapsedMs,
      p50FrameMs: percentile(intervals, .50),
      p95FrameMs: percentile(intervals, .95),
      slowOver33ms: intervals.filter(interval => interval > 33.4).length,
      p95RenderSubmitMs: percentile(submissions, .95),
      drawCalls: { min: Math.min(...calls), max: Math.max(...calls), median: percentile(calls, .50) },
      triangles: { min: Math.min(...triangles), max: Math.max(...triangles) },
    };
  }

  cancel(reason) {
    for (const sample of this.samples) sample.reject(new Error(reason));
    this.samples.clear();
  }
}
