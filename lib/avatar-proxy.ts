import "server-only";
import { ALLOWED_AVATAR_MIME_TYPES, hasValidImageSignature, MAX_AVATAR_UPLOAD_SIZE_BYTES } from "@/lib/avatar";

export const AVATAR_FETCH_TIMEOUT_MS = 5_000;
export const AVATAR_SIGNED_URL_TTL_SECONDS = 30;
export const MAX_AVATAR_STREAM_CHUNKS = 4096;

/** The URL remains server-only and must point at this exact private object. */
export function isExpectedAvatarSignedUrl(value: string, base: string, ownerId: string) {
  if (value.length > 8192 || !/^[a-zA-Z0-9_-]{1,128}$/.test(ownerId)) return false;
  try {
    const configured = new URL(base);
    const url = new URL(value);
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(configured.hostname);
    if (configured.protocol !== "https:" && !(local && configured.protocol === "http:")) return false;
    const expectedPath = `${configured.pathname.replace(/\/+$/, "")}/storage/v1/object/sign/player-avatars/${encodeURIComponent(ownerId)}/avatar`;
    const token = url.searchParams.get("token");
    return !configured.username && !configured.password && !configured.search && !configured.hash &&
      url.origin === configured.origin && !url.username && !url.password && !url.hash &&
      url.pathname === expectedPath && url.searchParams.size === 1 &&
      typeof token === "string" && /^[a-zA-Z0-9_.-]{1,4096}$/.test(token);
  } catch { return false; }
}

/** Buffer at most the app limit; reject headers early and abort excess chunks. */
export async function readBoundedAvatar(url: string, requestSignal?: AbortSignal) {
  if (requestSignal?.aborted) return null;
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined;
  let rejectDeadline: (reason: Error) => void = () => {};
  const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
  const abort = () => { controller.abort(); rejectDeadline(new Error("Avatar read stopped")); };
  requestSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, AVATAR_FETCH_TIMEOUT_MS);
  try {
    response = await Promise.race([fetch(url, {
      cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { Accept: ALLOWED_AVATAR_MIME_TYPES.join(", "), "Accept-Encoding": "identity" },
    }), deadline]);
    const type = response.headers.get("Content-Type")?.trim().toLowerCase() ?? "";
    const encoding = response.headers.get("Content-Encoding");
    const length = response.headers.get("Content-Length");
    if (!response.ok || !response.body || !ALLOWED_AVATAR_MIME_TYPES.some(allowed => allowed === type) ||
      (encoding !== null && encoding.toLowerCase() !== "identity") ||
      (length !== null && (!/^[0-9]+$/.test(length) || Number(length) < 1 || Number(length) > MAX_AVATAR_UPLOAD_SIZE_BYTES))) return null;
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    const prefix = new Uint8Array(12);
    const signatureLength = type === "image/jpeg" ? 3 : type === "image/png" ? 8 : 12;
    let prefixLength = 0;
    let size = 0;
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0 || chunks.length >= MAX_AVATAR_STREAM_CHUNKS ||
        value.byteLength > MAX_AVATAR_UPLOAD_SIZE_BYTES - size) return null;
      const copied = Math.min(prefix.length - prefixLength, value.byteLength);
      if (copied > 0) { prefix.set(value.subarray(0, copied), prefixLength); prefixLength += copied; }
      if (prefixLength >= signatureLength && !hasValidImageSignature(type, prefix)) return null;
      size += value.byteLength;
      // Retain only this chunk's bytes, never a larger pooled backing buffer.
      chunks.push(value.slice());
    }
    if (size < 1 || prefixLength < signatureLength || !hasValidImageSignature(type, prefix) ||
      (length !== null && Number(length) !== size)) return null;
    // No SDK Blob download or whole upstream arrayBuffer call occurs. This
    // final bounded copy is made only after every chunk and signature pass.
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { type, bytes };
  } catch { return null; }
  finally {
    clearTimeout(timer);
    requestSignal?.removeEventListener("abort", abort);
    controller.abort();
    // Cancellation must not prolong a timeout when an upstream read is stuck.
    if (reader) void reader.cancel().catch(() => {});
    else if (response?.body) void response.body.cancel().catch(() => {});
  }
}
