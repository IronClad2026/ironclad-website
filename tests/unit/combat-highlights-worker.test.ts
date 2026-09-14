import { beforeEach, describe, expect, it, vi } from "vitest";
import worker, { parseRange, type Env } from "@/workers/combat-highlights/src/index";
const id = "f104712c-3ce5-478d-aebc-d116ec81f55a";
const origin = "https://staging.example.test";
const body = () => new Blob([new Uint8Array([1, 2, 3, 4])]).stream();
function setup(active = true) {
  const media = {
    head: vi.fn().mockResolvedValue({ size: 4, etag: "abc", httpEtag: '"abc"', httpMetadata: { contentType: "video/mp4" } }),
    get: vi.fn().mockImplementation(async () => ({ size: 4, etag: "abc", httpEtag: '"abc"', body: body() })),
    put: vi.fn().mockImplementation(async (_key, stream) => { await new Response(stream).arrayBuffer(); return { etag: "new" }; }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const env: Env = { MEDIA: media, DEPLOYMENT_ENV: "staging", ENABLED: String(active), SUPABASE_URL: "https://zzbnneprhjicmajpjkdg.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-test-key", ALLOWED_ORIGINS: origin };
  const rpc = vi.fn().mockImplementation(async () => Response.json(true));
  vi.stubGlobal("fetch", rpc);
  return { env, media, rpc };
}
async function sign(env: Env, overrides: Record<string, unknown> = {}) {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  env.SIGNING_PUBLIC_JWK = JSON.stringify(await crypto.subtle.exportKey("jwk", keys.publicKey));
  const payload = Buffer.from(JSON.stringify({ v: 1, op: "upload", id, kind: "video", size: 4, type: "video/mp4", exp: Math.floor(Date.now() / 1000) + 60, origin, ...overrides })).toString("base64url");
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(payload));
  return payload + "." + Buffer.from(signature).toString("base64url");
}
function upload(token: string, headers: Record<string, string> = {}) {
  return new Request("https://worker.test/uploads/" + id + "/video", { method: "PUT", headers: { Origin: origin, Authorization: "Bearer " + token, "X-Clerk-Token": "clerk.test.jwt", "Content-Type": "video/mp4", "Content-Length": "4", ...headers }, body: new Uint8Array([1, 2, 3, 4]) });
}
beforeEach(() => {
  vi.stubGlobal("FixedLengthStream", class extends TransformStream<Uint8Array, Uint8Array> {
    constructor(length: number) { let total = 0; super({ transform(chunk, controller) { total += chunk.byteLength; if (total > length) throw new Error("too long"); controller.enqueue(chunk); }, flush() { if (total !== length) throw new Error("too short"); } }); }
  });
});
describe("Combat Highlights Worker authority", () => {
  it("starts disabled and never reaches R2", async () => { const { env, media } = setup(false); expect((await worker.fetch(new Request("https://worker.test/public/" + id + "/video"), env)).status).toBe(503); expect(media.head).not.toHaveBeenCalled(); });
  it("rejects production configuration", async () => { const { env, rpc } = setup(); env.DEPLOYMENT_ENV = "production"; expect((await worker.fetch(new Request("https://worker.test/health"), env)).status).toBe(404); expect(rpc).not.toHaveBeenCalled(); });
  it("rechecks eligibility after visibility changes", async () => {
    const { env, rpc, media } = setup(); rpc.mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json(false));
    const request = () => new Request("https://worker.test/public/" + id + "/video");
    const first = await worker.fetch(request(), env); expect(first.status).toBe(200); expect(first.headers.get("Cache-Control")).toContain("no-store");
    expect((await worker.fetch(request(), env)).status).toBe(404); expect(rpc).toHaveBeenCalledTimes(2); expect(media.get).toHaveBeenCalledTimes(1);
  });
  it("fails closed on database outage without reading media", async () => { const { env, rpc, media } = setup(); rpc.mockRejectedValue(new Error("offline")); expect((await worker.fetch(new Request("https://worker.test/public/" + id + "/video"), env)).status).toBe(503); expect(media.head).not.toHaveBeenCalled(); });
  it("returns streamed single ranges after authorization", async () => { const { env, media } = setup(); const response = await worker.fetch(new Request("https://worker.test/public/" + id + "/video", { headers: { Range: "bytes=1-2" } }), env); expect(response.status).toBe(206); expect(response.headers.get("Content-Range")).toBe("bytes 1-2/4"); expect(media.get).toHaveBeenCalledWith("assets/" + id + "/video", { range: { offset: 1, length: 2 }, onlyIf: { etagMatches: "abc" } }); });
  it("does not read the body for HEAD", async () => { const { env, media } = setup(); const response = await worker.fetch(new Request("https://worker.test/public/" + id + "/video", { method: "HEAD" }), env); expect(response.status).toBe(200); expect(media.get).not.toHaveBeenCalled(); });
  it("rejects malformed and multiple ranges", async () => { const { env, media } = setup(); const response = await worker.fetch(new Request("https://worker.test/public/" + id + "/video", { headers: { Range: "bytes=0-1,2-3" } }), env); expect(response.status).toBe(416); expect(media.get).not.toHaveBeenCalled(); });
  it("owner access forwards only the actual bearer JWT to the owner RPC", async () => { const { env, rpc } = setup(); const request = new Request("https://worker.test/owner/" + id + "/video", { headers: { Authorization: "Bearer real.clerk.jwt", Origin: origin } }); expect((await worker.fetch(request, env)).status).toBe(200); const [url, options] = rpc.mock.calls[0]; expect(url).toContain("can_access_my_player_combat_highlight"); expect(options.headers.Authorization).toBe("Bearer real.clerk.jwt"); expect(JSON.parse(options.body)).toEqual({ p_upload_id: id, p_purpose: "read" }); });
  it("rejects owner requests without JWT and query-string credentials", async () => { const { env, media } = setup(); expect((await worker.fetch(new Request("https://worker.test/owner/" + id + "/video"), env)).status).toBe(404); expect((await worker.fetch(new Request("https://worker.test/public/" + id + "/video?token=x"), env)).status).toBe(404); expect(media.head).not.toHaveBeenCalled(); });
  it("rejects unknown origins before any authority or storage access", async () => { const { env, rpc } = setup(); expect((await worker.fetch(new Request("https://worker.test/public/" + id + "/video", { headers: { Origin: "https://evil.example" } }), env)).status).toBe(403); expect(rpc).not.toHaveBeenCalled(); });
  it("accepts a scoped upload only as an immutable Standard object", async () => { const { env, media, rpc } = setup(); const response = await worker.fetch(upload(await sign(env)), env); expect(response.status).toBe(201); expect(media.put.mock.calls[0][2]).toEqual({ onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "video/mp4", cacheControl: "private, no-store" }, storageClass: "Standard" }); expect(JSON.parse(rpc.mock.calls[0][1].body).p_purpose).toBe("upload"); });
  it("cannot overwrite a previously uploaded object", async () => { const { env, media } = setup(); media.put.mockImplementation(async (_key, stream) => { await new Response(stream).arrayBuffer(); return null; }); expect((await worker.fetch(upload(await sign(env)), env)).status).toBe(409); });
  it("returns promptly when R2 rejects a conditional upload without consuming its stream", async () => { const { env, media } = setup(); media.put.mockResolvedValue(null); expect((await worker.fetch(upload(await sign(env)), env)).status).toBe(409); }, 1000);
  it("rejects expired and wrong-purpose grants", async () => { const { env, media } = setup(); for (const override of [{ exp: 1 }, { op: "verify" }, { size: 15_000_001 }, { id: crypto.randomUUID() }]) expect((await worker.fetch(upload(await sign(env, override)), env)).status).toBe(404); expect(media.put).not.toHaveBeenCalled(); });
  it("binds upload to exact byte length, content type and current owner", async () => { const { env, media, rpc } = setup(); const token = await sign(env); expect((await worker.fetch(upload(token, { "Content-Length": "5" }), env)).status).toBe(400); expect((await worker.fetch(upload(token, { "Content-Type": "video/webm" }), env)).status).toBe(400); rpc.mockResolvedValue(Response.json(false)); expect((await worker.fetch(upload(token), env)).status).toBe(404); expect(media.put).not.toHaveBeenCalled(); });
  it("internal deletion requires an independent delete grant", async () => { const { env, media } = setup(); const request = (token: string) => new Request("https://worker.test/internal/" + id + "/video", { method: "DELETE", headers: { Authorization: "Bearer " + token } }); expect((await worker.fetch(request(await sign(env)), env)).status).toBe(404); expect((await worker.fetch(request(await sign(env, { op: "delete", size: 0 })), env)).status).toBe(204); expect(media.delete).toHaveBeenCalledWith(["assets/" + id + "/video", "assets/" + id + "/poster"]); });
  it("verification is private and does not accept an upload grant", async () => { const { env, media } = setup(); const request = (token: string) => new Request("https://worker.test/internal/" + id + "/video", { headers: { Authorization: "Bearer " + token } }); expect((await worker.fetch(request(await sign(env)), env)).status).toBe(404); expect(media.get).not.toHaveBeenCalled(); expect((await worker.fetch(request(await sign(env, { op: "verify" })), env)).status).toBe(200); });
});
describe("Range boundaries", () => { it.each([["bytes=0-", { offset: 0, length: 4 }], ["bytes=-2", { offset: 2, length: 2 }], ["bytes=3-99", { offset: 3, length: 1 }], ["bytes=4-", false], ["bytes=-0", false], ["bytes=2-1", false], ["bytes=1e2-", false]])("%s", (input, expected) => { expect(parseRange(input as string, 4)).toEqual(expected); }); });
