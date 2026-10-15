export const MAX_HIGHLIGHT_BYTES = 15_000_000;
export const MAX_POSTER_BYTES = 200_000;

export class HighlightMediaError extends Error {
  constructor(readonly code: string) { super(code); }
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
