// R2 is private. Every playback request rechecks database authority before any bytes.
type StoredObject = { size: number; etag: string; httpEtag: string; httpMetadata?: { contentType?: string }; body?: ReadableStream<Uint8Array> };
type Bucket = {
  head(key: string): Promise<StoredObject | null>;
  get(key: string, options?: { range?: { offset: number; length: number }; onlyIf?: { etagMatches: string } }): Promise<StoredObject | null>;
  put(key: string, body: ReadableStream<Uint8Array>, options: { onlyIf: { etagDoesNotMatch: string }; httpMetadata: { contentType: string; cacheControl: string }; storageClass: "Standard" }): Promise<StoredObject | null>;
  delete(keys: string[]): Promise<void>;
};
declare const FixedLengthStream: new (length: number) => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };
export type Env = {
  MEDIA: Bucket;
  DEPLOYMENT_ENV: string;
  ENABLED: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SIGNING_PUBLIC_JWK?: string;
  ALLOWED_ORIGINS: string;
};
type Ticket = { v: 1; op: "upload" | "verify" | "delete"; id: string; kind: "video" | "poster"; size: number; type: string; exp: number; origin: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stage = "https://zzbnneprhjicmajpjkdg.supabase.co";
const noStore = { "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store", "Cloudflare-CDN-Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const objectKey = (id: string, kind: string) => "assets/" + id + "/" + kind;
function reply(status: number, code = "unavailable") { return Response.json({ code }, { status, headers: noStore }); }
function bearer(request: Request) { const match = /^Bearer ([A-Za-z0-9_.-]{1,12000})$/.exec(request.headers.get("Authorization") ?? ""); return match?.[1] ?? null; }
function origins(env: Env) { return env.ALLOWED_ORIGINS.split(",").map((v) => v.trim()).filter(Boolean); }
function decode(value: string) { return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)); }
async function ticketFor(request: Request, env: Env, id: string, kind: string, op: Ticket["op"]): Promise<Ticket | null> {
  try {
    const token = bearer(request);
    if (!token || !env.SIGNING_PUBLIC_JWK || token.length > 3000) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const key = await crypto.subtle.importKey("jwk", JSON.parse(env.SIGNING_PUBLIC_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, decode(parts[1]), new TextEncoder().encode(parts[0]))) return null;
    const value: Ticket = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    if (value.v !== 1 || value.op !== op || value.id !== id || value.kind !== kind || !Number.isSafeInteger(value.exp) || value.exp <= now || value.exp > now + 300) return null;
    const max = kind === "video" ? 15_000_000 : 200_000;
    if (!Number.isSafeInteger(value.size) || value.size < 0 || value.size > max) return null;
    if (op === "upload" && (value.size < 1 || value.origin !== request.headers.get("Origin") || !origins(env).includes(value.origin))) return null;
    if (op !== "delete" && !(kind === "video" ? ["video/mp4", "video/webm"] : ["image/jpeg"]).includes(value.type)) return null;
    return value;
  } catch { return null; }
}
async function eligible(env: Env, id: string, ownerToken: string | null, purpose: "upload" | "read" = "read"): Promise<boolean> {
  if (!env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_URL !== stage) return false;
  if (ownerToken !== null && !/^[A-Za-z0-9_.-]{1,12000}$/.test(ownerToken)) return false;
  const rpc = ownerToken ? "can_access_my_player_combat_highlight" : "can_read_public_player_combat_highlight";
  const response = await fetch(stage + "/rest/v1/rpc/" + rpc, {
    method: "POST", headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, ...(ownerToken ? { Authorization: "Bearer " + ownerToken } : {}), "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(ownerToken ? { p_upload_id: id, p_purpose: purpose } : { p_upload_id: id }),
    // workerd supports manual/follow; reject redirects below without forwarding credentials.
    cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(5000),
  });
  return response.ok && await response.json() === true;
}
export function parseRange(value: string | null, size: number): { offset: number; length: number } | null | false {
  if (value === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size < 1) return false;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return false;
    return { offset: Math.max(0, size - suffix), length: Math.min(suffix, size) };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return false;
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}
async function readObject(request: Request, env: Env, id: string, kind: string, verification: boolean): Promise<Response> {
  const key = objectKey(id, kind);
  const head = await env.MEDIA.head(key);
  if (!head || head.size < 1 || head.size > (kind === "video" ? 15_000_000 : 200_000)) return reply(404, "not-found");
  const type = head.httpMetadata?.contentType;
  if (!(kind === "video" ? ["video/mp4", "video/webm"] : ["image/jpeg"]).includes(type ?? "")) return reply(404, "not-found");
  const range = verification ? null : parseRange(request.headers.get("Range"), head.size);
  const headers = new Headers({ ...noStore, "Content-Type": type!, "Accept-Ranges": "bytes", ETag: head.httpEtag });
  if (range === false) { headers.set("Content-Range", "bytes */" + head.size); return new Response(null, { status: 416, headers }); }
  headers.set("Content-Length", String(range ? range.length : head.size));
  if (range) headers.set("Content-Range", "bytes " + range.offset + "-" + (range.offset + range.length - 1) + "/" + head.size);
  if (request.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers });
  const object = await env.MEDIA.get(key, { ...(range ? { range } : {}), onlyIf: { etagMatches: head.etag } });
  if (!object?.body || object.etag !== head.etag) return reply(404, "not-found");
  return new Response(object.body, { status: range ? 206 : 200, headers });
}
async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.search || env.DEPLOYMENT_ENV !== "staging" || env.SUPABASE_URL !== stage) return reply(404, "not-found");
  if (url.pathname === "/health" && request.method === "GET") return Response.json({ environment: "staging", active: env.ENABLED === "true" }, { headers: noStore });
  if (env.ENABLED !== "true") return reply(503, "feature-disabled");
  const match = /^\/(public|owner|uploads|internal)\/([0-9a-f-]+)\/(video|poster)$/.exec(url.pathname);
  if (!match || !uuid.test(match[2])) return reply(404, "not-found");
  const [, mode, id, kind] = match;
  if (mode === "uploads" && request.method === "PUT") {
    const ticket = await ticketFor(request, env, id, kind, "upload");
    const owner = request.headers.get("X-Clerk-Token");
    if (!ticket || !owner || !await eligible(env, id, owner, "upload")) return reply(404, "not-found");
    if (request.headers.get("Content-Type") !== ticket.type || request.headers.get("Content-Length") !== String(ticket.size) || !request.body) return reply(400, "invalid-upload");
    const stream = new FixedLengthStream(ticket.size);
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), Math.max(1, ticket.exp * 1000 - Date.now()));
    const transferred = request.body.pipeTo(stream.writable, { signal: controller.signal }).then(() => true, () => false);
    try {
      const object = await env.MEDIA.put(objectKey(id, kind), stream.readable, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: ticket.type, cacheControl: "private, no-store" }, storageClass: "Standard" });
      if (!object) { controller.abort(); return reply(409, "already-uploaded"); }
      return await transferred ? new Response(null, { status: 201, headers: noStore }) : reply(400, "invalid-upload");
    } finally { clearTimeout(deadline); controller.abort(); }
  }
  if (mode === "internal" && request.method === "DELETE") {
    if (!await ticketFor(request, env, id, kind, "delete")) return reply(404, "not-found");
    await env.MEDIA.delete([objectKey(id, "video"), objectKey(id, "poster")]);
    return new Response(null, { status: 204, headers: noStore });
  }
  if (!["GET", "HEAD"].includes(request.method)) return reply(405, "method-not-allowed");
  if (mode === "internal") {
    if (!await ticketFor(request, env, id, kind, "verify")) return reply(404, "not-found");
    return readObject(request, env, id, kind, true);
  }
  if (mode === "public") {
    if (!await eligible(env, id, null)) return reply(404, "not-found");
    return readObject(request, env, id, kind, false);
  }
  if (mode === "owner") {
    const token = bearer(request);
    if (!token || !await eligible(env, id, token)) return reply(404, "not-found");
    return readObject(request, env, id, kind, false);
  }
  return reply(404, "not-found");
}
const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const allowed = origin && origins(env).includes(origin);
    if (origin && !allowed) return reply(403, "forbidden");
    let response: Response;
    if (request.method === "OPTIONS") response = allowed ? new Response(null, { status: 204, headers: { ...noStore, "Access-Control-Allow-Methods": "GET, HEAD, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Authorization, X-Clerk-Token, Content-Type, Range", "Access-Control-Max-Age": "0" } }) : reply(403, "forbidden");
    else { try { response = await handle(request, env); } catch { response = reply(503); } }
    const headers = new Headers(response.headers);
    headers.set("Vary", "Origin");
    if (allowed) { headers.set("Access-Control-Allow-Origin", origin!); headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, ETag"); }
    return new Response(response.body, { status: response.status, headers });
  },
};

export default worker;
