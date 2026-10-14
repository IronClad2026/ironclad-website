import "server-only";
import { mediaConfiguration } from "./config";

type Grant = { op: "upload" | "verify" | "delete"; id: string; kind: "video" | "poster"; size: number; type: string; origin: string; exp: number };
export async function signMediaGrant(grant: Grant) {
  if (!mediaConfiguration()) throw new Error("Media unavailable");
  const encodedKey = process.env.COMBAT_HIGHLIGHTS_SIGNING_PRIVATE_JWK;
  if (!encodedKey) throw new Error("Media unavailable");
  const key = await crypto.subtle.importKey("jwk", JSON.parse(encodedKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const payload = Buffer.from(JSON.stringify({ v: 1, ...grant })).toString("base64url");
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(payload));
  return payload + "." + Buffer.from(signature).toString("base64url");
}
export async function fetchPrivateMedia(id: string, kind: "video" | "poster", size: number, contentType: string) {
  const config = mediaConfiguration();
  if (!config || !Number.isSafeInteger(size) || size < 1 || size > (kind === "video" ? 15_000_000 : 200_000)) throw new Error("Media unavailable");
  const grant = await signMediaGrant({ op: "verify", id, kind, size, type: contentType, origin: "", exp: Math.floor(Date.now() / 1000) + 60 });
  const response = await fetch(config.origin + "/internal/" + id + "/" + kind, { headers: { Authorization: "Bearer " + grant }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000) });
  if (!response.ok || response.headers.get("Content-Length") !== String(size) || response.headers.get("Content-Type") !== contentType || !response.body) { await response.body?.cancel(); throw new Error("Media unavailable"); }
  const etag = response.headers.get("ETag");
  if (!etag || !/^"[a-zA-Z0-9-]{1,128}"$/.test(etag)) { await response.body.cancel(); throw new Error("Media unavailable"); }
  const reader = response.body.getReader();
  const bytes = new Uint8Array(size);
  let offset = 0;
  try {
    while (true) { const item = await reader.read(); if (item.done) break; if (offset + item.value.byteLength > size) throw new Error("Invalid media size"); bytes.set(item.value, offset); offset += item.value.byteLength; }
    if (offset !== size) throw new Error("Invalid media size");
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  return { bytes, etag: etag.slice(1, -1) };
}
