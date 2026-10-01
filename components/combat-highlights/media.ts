export const MAX_HIGHLIGHT_BYTES = 15_000_000;
export const MAX_POSTER_BYTES = 200_000;

export type PreparedHighlight = {
  file: File;
  contentType: "video/mp4" | "video/webm";
  poster: Blob | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
};

export class HighlightMediaError extends Error {
  constructor(readonly code: string) { super(code); }
}

export function highlightFileType(file: File): "video/mp4" | "video/webm" {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const type = extension === "mp4" ? "video/mp4" : extension === "webm" ? "video/webm" : null;
  if (!type || (file.type && file.type !== type)) throw new HighlightMediaError("invalid-media");
  if (file.size === 0) throw new HighlightMediaError("invalid-media");
  if (file.size > MAX_HIGHLIGHT_BYTES) throw new HighlightMediaError("too-large");
  return type;
}

/** Local convenience checks only. The upload service verifies the actual container and codecs. */
export async function prepareHighlight(file: File, signal: AbortSignal): Promise<PreparedHighlight> {
  const contentType = highlightFileType(file);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  let poster: Blob | null = null;
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        video.onloadedmetadata = null;
        video.onerror = null;
        signal.removeEventListener("abort", abort);
      };
      const abort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
      const timer = setTimeout(() => { cleanup(); reject(new HighlightMediaError("invalid-media")); }, 12_000);
      video.onloadedmetadata = () => { cleanup(); resolve(); };
      video.onerror = () => { cleanup(); reject(new HighlightMediaError("invalid-media")); };
      signal.addEventListener("abort", abort, { once: true });
      video.src = url;
    });
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null;
    const width = video.videoWidth || null;
    const height = video.videoHeight || null;
    if (durationMs !== null && (durationMs <= 0 || durationMs > 15_000)) throw new HighlightMediaError("too-long");
    if ((width ?? 0) > 1920 || (height ?? 0) > 1080) throw new HighlightMediaError("too-high-resolution");
    // A thumbnail is optional; failed decoding/canvas capture never prevents a valid upload.
    try {
      await new Promise<void>((resolve) => {
        const finish = () => { clearTimeout(timer); video.onseeked = null; resolve(); };
        const timer = setTimeout(finish, 1000);
        video.onseeked = finish;
        video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
      });
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (video.readyState >= 2 && width && height) {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 640 / width, 360 / height);
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const captured = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
        if (captured && captured.size <= MAX_POSTER_BYTES && captured.type === "image/jpeg") poster = captured;
      }
    } catch { /* Optional thumbnail; the video is uploaded unchanged. */ }
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return { file, contentType, poster, durationMs, width, height };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Authorization values stay in request headers, never URLs, logs, or persisted browser state. */
export function putHighlightObject({
  url, body, authorization, clerkToken, contentType, signal, onProgress,
}: {
  url: string; body: Blob; authorization: string; clerkToken: string; contentType: string;
  signal: AbortSignal; onProgress: (percent: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const request = new XMLHttpRequest();
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => request.abort();
    request.open("PUT", url);
    request.timeout = 120_000;
    request.setRequestHeader("Authorization", `Bearer ${authorization}`);
    request.setRequestHeader("X-Clerk-Token", clerkToken);
    request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100));
    };
    request.onload = () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) resolve();
      else {
        const code = request.status === 413 ? "too-large" : [401, 403].includes(request.status) ? "upload-expired" : request.status === 409 ? "conflict" : [400, 415, 422].includes(request.status) ? "invalid-media" : "unavailable";
        reject(new HighlightMediaError(code));
      }
    };
    request.onerror = request.ontimeout = () => { cleanup(); reject(new HighlightMediaError("unavailable")); };
    request.onabort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    request.send(body);
  });
}
