import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminIdentity, anonymousIdentity, playerIdentity } from "@/tests/fixtures/auth";
const { authMock, createSupabaseAdminClientMock, fetchMock } = vi.hoisted(() => ({ authMock: vi.fn(), createSupabaseAdminClientMock: vi.fn(), fetchMock: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: createSupabaseAdminClientMock }));
vi.mock("@/lib/supabase-config", () => ({ supabaseUrl: "http://127.0.0.1:54321" }));
import { GET } from "@/app/players/[playerId]/avatar/route";
import { MAX_AVATAR_UPLOAD_SIZE_BYTES } from "@/lib/avatar";
import { AVATAR_FETCH_TIMEOUT_MS, AVATAR_SIGNED_URL_TTL_SECONDS, MAX_AVATAR_STREAM_CHUNKS, isExpectedAvatarSignedUrl } from "@/lib/avatar-proxy";
const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "user_avatar_owner";
const SIGNED_URL = `http://127.0.0.1:54321/storage/v1/object/sign/player-avatars/${OWNER_ID}/avatar?token=synthetic.header.signature`;
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
type AvatarPlayer = { avatar_url: string | null; clerk_user_id: string | null; public_profile_enabled: boolean };
const publicPlayer: AvatarPlayer = { avatar_url: `/players/${PLAYER_ID}/avatar`, clerk_user_id: OWNER_ID, public_profile_enabled: true };
function createAvatarClient({ player, signingError = null, signedUrl = SIGNED_URL, avatar = new Blob([PNG_BYTES], { type: "image/png" }) }: {
  player: AvatarPlayer | null; signingError?: { message: string } | null; signedUrl?: string | null; avatar?: Blob;
}) {
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn(async () => ({ data: player, error: null })) };
  const createSignedUrl = vi.fn(async () => ({ data: signedUrl ? { signedUrl } : null, error: signingError }));
  const download = vi.fn(() => { throw new Error("Whole-Blob SDK download must never be called"); });
  const storageFrom = vi.fn(() => ({ createSignedUrl, download }));
  fetchMock.mockImplementation(async () => new Response(avatar, { headers: { "Content-Type": avatar.type } }));
  return { client: { from: vi.fn(() => query), storage: { from: storageFrom } }, createSignedUrl, download, storageFrom };
}
async function requestAvatar(playerId = PLAYER_ID, signal?: AbortSignal) {
  return GET(new Request(`http://localhost/players/${playerId}/avatar`, { signal }), { params: Promise.resolve({ playerId }) });
}
function expectPrivateNoStore(response: Response) {
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
}
async function expectFallback(response: Response) {
  createSupabaseAdminClientMock.mockReturnValueOnce(createAvatarClient({ player: null }).client);
  const missing = await requestAvatar();
  expect(await response.text()).toBe(await missing.text()); expect(response.headers.get("Content-Type")).toContain("image/svg+xml"); expectPrivateNoStore(response);
}
describe("bounded private avatar proxy using synthetic local responses", () => {
  beforeEach(() => { authMock.mockReset(); createSupabaseAdminClientMock.mockReset(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("rejects invalid player IDs before service-role access", async () => {
    const response = await requestAvatar("not-a-uuid"); expect(response.headers.get("Content-Type")).toContain("image/svg+xml"); expectPrivateNoStore(response);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("serves an opted-in player anonymously without exposing its signed URL or path", async () => {
    const supabase = createAvatarClient({ player: publicPlayer }); createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    const response = await requestAvatar(); expect(response.headers.get("Content-Type")).toBe("image/png"); expectPrivateNoStore(response);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES); expect(authMock).not.toHaveBeenCalled(); expect(supabase.download).not.toHaveBeenCalled();
    expect(supabase.createSignedUrl).toHaveBeenCalledExactlyOnceWith(`${OWNER_ID}/avatar`, AVATAR_SIGNED_URL_TTL_SECONDS); expect(supabase.storageFrom).toHaveBeenCalledWith("player-avatars");
    expect(fetchMock).toHaveBeenCalledWith(SIGNED_URL, expect.objectContaining({ cache: "no-store", redirect: "error", signal: expect.any(AbortSignal), headers: expect.objectContaining({ "Accept-Encoding": "identity" }) }));
    expect(JSON.stringify(Object.fromEntries(response.headers))).not.toMatch(/token|user_avatar_owner|storage\/v1/);
  });
  it("makes private and missing profiles indistinguishable without signing or fetching", async () => {
    const supabase = createAvatarClient({ player: { ...publicPlayer, public_profile_enabled: false } }); createSupabaseAdminClientMock.mockReturnValueOnce(supabase.client); authMock.mockResolvedValueOnce(anonymousIdentity);
    await expectFallback(await requestAvatar()); expect(supabase.createSignedUrl).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("denies another signed-in player before any Storage operation", async () => {
    const supabase = createAvatarClient({ player: { ...publicPlayer, public_profile_enabled: false } }); createSupabaseAdminClientMock.mockReturnValue(supabase.client); authMock.mockResolvedValue(playerIdentity);
    await expectFallback(await requestAvatar()); expect(supabase.storageFrom).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([["owner", { ...playerIdentity, userId: OWNER_ID }], ["admin", adminIdentity]])("allows a private avatar for its %s", async (_label, identity) => {
    const supabase = createAvatarClient({ player: { ...publicPlayer, public_profile_enabled: false } }); createSupabaseAdminClientMock.mockReturnValue(supabase.client); authMock.mockResolvedValue(identity);
    const response = await requestAvatar(); expect(response.headers.get("Content-Type")).toBe("image/png"); expectPrivateNoStore(response); expect(supabase.createSignedUrl).toHaveBeenCalledOnce(); expect(supabase.download).not.toHaveBeenCalled();
  });
  it.each([
    ["unsupported MIME", new Blob(["<script>synthetic</script>"], { type: "text/html" })], ["SVG upload", new Blob(["<svg/>"], { type: "image/svg+xml" })],
    ["empty payload", new Blob([], { type: "image/png" })], ["forged MIME", new Blob(["not-an-image"], { type: "image/png" })],
    ["truncated signature", new Blob([PNG_BYTES.slice(0, 7)], { type: "image/png" })], ["oversized stream", new Blob([PNG_BYTES, new Uint8Array(MAX_AVATAR_UPLOAD_SIZE_BYTES)], { type: "image/png" })],
  ])("returns the privacy-safe fallback for %s", async (_label, avatar) => {
    const supabase = createAvatarClient({ player: publicPlayer, avatar }); createSupabaseAdminClientMock.mockReturnValueOnce(supabase.client);
    await expectFallback(await requestAvatar()); expect(supabase.download).not.toHaveBeenCalled();
  });
  it("accepts exactly 4 MiB without upstream whole-body helpers", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createAvatarClient({ player: publicPlayer }).client);
    const upstream = new Response(new Blob([PNG_BYTES, new Uint8Array(MAX_AVATAR_UPLOAD_SIZE_BYTES - PNG_BYTES.length)]), { headers: { "Content-Type": "image/png", "Content-Length": String(MAX_AVATAR_UPLOAD_SIZE_BYTES) } });
    const blob = vi.spyOn(upstream, "blob"), arrayBuffer = vi.spyOn(upstream, "arrayBuffer"), text = vi.spyOn(upstream, "text"); fetchMock.mockResolvedValue(upstream);
    const response = await requestAvatar(); expect(response.headers.get("Content-Type")).toBe("image/png"); expectPrivateNoStore(response); expect((await response.arrayBuffer()).byteLength).toBe(MAX_AVATAR_UPLOAD_SIZE_BYTES);
    expect(blob).not.toHaveBeenCalled(); expect(arrayBuffer).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled();
  });
  it.each([["image/jpeg", new Uint8Array([0xff, 0xd8, 0xff])], ["image/webp", new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])]])("preserves allowed %s upload signatures", async (type, bytes) => {
    createSupabaseAdminClientMock.mockReturnValue(createAvatarClient({ player: publicPlayer, avatar: new Blob([bytes], { type }) }).client);
    const response = await requestAvatar(); expect(response.headers.get("Content-Type")).toBe(type); expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes); expectPrivateNoStore(response);
  });
  it.each([
    SIGNED_URL.replace("127.0.0.1:54321", "external.invalid"), SIGNED_URL.replace("54321", "54322"), SIGNED_URL.replace(OWNER_ID, "user_another"),
    SIGNED_URL.replace("/object/sign/", "/object/public/"), SIGNED_URL.replace("player-avatars", "another-bucket"), SIGNED_URL.replace("/avatar?", "/another-object?"),
    `${SIGNED_URL}&token=second`, `${SIGNED_URL}&download=1`, `${SIGNED_URL}#fragment`, SIGNED_URL.replace("http://", "http://credential:password@"),
  ])("rejects a signed target outside its exact object contract", async signedUrl => {
    const supabase = createAvatarClient({ player: publicPlayer, signedUrl }); createSupabaseAdminClientMock.mockReturnValueOnce(supabase.client);
    await expectFallback(await requestAvatar()); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fails closed on signing failure and invalid Clerk path segments", async () => {
    const supabase = createAvatarClient({ player: publicPlayer, signingError: { message: "Synthetic unavailable" } }); createSupabaseAdminClientMock.mockReturnValueOnce(supabase.client);
    await expectFallback(await requestAvatar()); expect(fetchMock).not.toHaveBeenCalled();
    const invalid = createAvatarClient({ player: { ...publicPlayer, clerk_user_id: "../another-user" } }); createSupabaseAdminClientMock.mockReturnValueOnce(invalid.client);
    await expectFallback(await requestAvatar()); expect(invalid.storageFrom).not.toHaveBeenCalled();
  });
  it.each(["52428800", "-1", "not-a-length", "0"])("rejects invalid/oversized Content-Length %s before reading", async length => {
    createSupabaseAdminClientMock.mockReturnValueOnce(createAvatarClient({ player: publicPlayer }).client);
    const upstream = new Response(PNG_BYTES, { headers: { "Content-Type": "image/png", "Content-Length": length } }); const getReader = vi.spyOn(upstream.body!, "getReader"); fetchMock.mockResolvedValue(upstream);
    await expectFallback(await requestAvatar()); expect(getReader).not.toHaveBeenCalled();
  });
  it.each([["Content-Encoding", "gzip"], ["Content-Length", "9"]])("rejects encoded bytes and dishonest short bodies", async (key, value) => {
    createSupabaseAdminClientMock.mockReturnValue(createAvatarClient({ player: publicPlayer }).client);
    fetchMock.mockResolvedValue(new Response(PNG_BYTES, { headers: { "Content-Type": "image/png", [key]: value } })); await expectFallback(await requestAvatar());
  });
  it("aborts an unknown-length 50 MiB stream just above 4 MiB", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createAvatarClient({ player: publicPlayer }).client);
    const chunk = new Uint8Array(64 * 1024); chunk.set(PNG_BYTES); const cancel = vi.fn(); let pulls = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { if (pulls++ < 800) controller.enqueue(chunk); else controller.close(); }, cancel });
    fetchMock.mockResolvedValue(new Response(body, { headers: { "Content-Type": "image/png" } })); await expectFallback(await requestAvatar());
    expect(pulls).toBeLessThanOrEqual(67); expect(cancel).toHaveBeenCalledOnce(); expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
  });
  it("bounds pathological tiny chunk counts", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createAvatarClient({ player: publicPlayer }).client); const cancel = vi.fn(); let pulls = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(pulls++ === 0 ? PNG_BYTES : new Uint8Array([0])); }, cancel });
    fetchMock.mockResolvedValue(new Response(body, { headers: { "Content-Type": "image/png" } })); await expectFallback(await requestAvatar());
    expect(pulls).toBeLessThanOrEqual(MAX_AVATAR_STREAM_CHUNKS + 2); expect(cancel).toHaveBeenCalledOnce();
  });
  it.each(["headers", "body"])("caps stalled %s at the deadline", async stage => {
    vi.useFakeTimers(); createSupabaseAdminClientMock.mockReturnValue(createAvatarClient({ player: publicPlayer }).client); const cancel = vi.fn();
    if (stage === "headers") fetchMock.mockImplementation(() => new Promise(() => {}));
    else fetchMock.mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(PNG_BYTES.slice(0, 4)); }, pull() { return new Promise(() => {}); }, cancel }), { headers: { "Content-Type": "image/png" } }));
    const pending = requestAvatar(); await vi.advanceTimersByTimeAsync(AVATAR_FETCH_TIMEOUT_MS + 1); await expectFallback(await pending);
    expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true); if (stage === "body") expect(cancel).toHaveBeenCalledOnce();
  });
  it("honors an aborted request without fetching signed bytes", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createAvatarClient({ player: publicPlayer }).client); const controller = new AbortController(); controller.abort();
    await expectFallback(await requestAvatar(PLAYER_ID, controller.signal)); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses the same fallback for fetch or redirect errors", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createAvatarClient({ player: publicPlayer }).client); fetchMock.mockRejectedValue(new TypeError("Synthetic fetch/redirect rejected")); await expectFallback(await requestAvatar());
  });
  it("allows configured HTTPS paths and local HTTP only, without making requests", () => {
    const base = "https://synthetic-project.supabase.co";
    const suffix = `/storage/v1/object/sign/player-avatars/${OWNER_ID}/avatar?token=synthetic.header.signature`;
    expect(isExpectedAvatarSignedUrl(base + suffix, base, OWNER_ID)).toBe(true);
    expect(isExpectedAvatarSignedUrl(base + "/proxy" + suffix, base + "/proxy", OWNER_ID)).toBe(true);
    expect(isExpectedAvatarSignedUrl(base.replace("https:", "http:") + suffix, base.replace("https:", "http:"), OWNER_ID)).toBe(false);
    expect(isExpectedAvatarSignedUrl(SIGNED_URL, "http://127.0.0.1:54321", OWNER_ID)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
