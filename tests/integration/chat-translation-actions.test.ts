import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translateMatchChatMessage, validateMatchChatTranslations } from "@/app/tournaments/chat-translation-actions";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), client: vi.fn(), rpc: vi.fn(), read: vi.fn(), reserve: vi.fn(),
  admin: vi.fn(), complete: vi.fn(), detect: vi.fn(), translate: vi.fn(), order: [] as string[],
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-server", () => ({ createAuthenticatedSupabaseClient: mocks.client }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/chat-translation-provider", () => ({ detectChatSourceLanguage: mocks.detect, translateChatText: mocks.translate }));

const ROOM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MESSAGE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LEASE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ORIGINAL = "Do not start on 2026-11-08 before 18:30 UTC. @Player_1 won 2–0. https://example.test/match?a=1&b=2";
const TRANSLATED = "Non iniziare il 2026-11-08 prima delle 18:30 UTC. @Player_1 ha vinto 2–0. https://example.test/match?a=1&b=2";
const HASH = "a".repeat(64);
const input = { roomId: ROOM, messageId: MESSAGE, targetLanguage: "it", sourceLanguage: "auto" };
const sources = (source = { messageId: MESSAGE, original: ORIGINAL as string | null, sourceHash: HASH as string | null }, enabled = true) => ({
  data: { enabled, messages: [source] }, error: null,
});
const redacted = () => sources({ messageId: MESSAGE, original: null, sourceHash: null });
const changed = () => sources({ messageId: MESSAGE, original: "The original was corrected. Do not start the match yet.", sourceHash: "b".repeat(64) });

beforeEach(() => {
  vi.stubEnv("PATCH2_CHAT_TRANSLATION_PROVIDER_ENABLED", "true");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "1".repeat(32));
  vi.stubEnv("CLOUDFLARE_AI_API_TOKEN", "test-only-not-a-credential");
  mocks.order.length = 0;
  mocks.auth.mockResolvedValue({ userId: "synthetic-staging-player", sessionClaims: {} });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.admin.mockReturnValue({ rpc: mocks.complete });
  mocks.read.mockResolvedValue(sources());
  mocks.reserve.mockResolvedValue({ data: { status: "reserved", leaseId: LEASE }, error: null });
  mocks.rpc.mockImplementation(async (name: string, args: unknown) => {
    mocks.order.push(name);
    return name === "read_match_chat_translation_sources" ? mocks.read(args) : mocks.reserve(args);
  });
  mocks.detect.mockReturnValue("en");
  mocks.translate.mockImplementation(async () => {
    mocks.order.push("provider");
    return { status: "translated", sourceLanguage: "en", translatedText: TRANSLATED };
  });
  mocks.complete.mockImplementation(async () => {
    mocks.order.push("complete");
    return { data: true, error: null };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("translation actions: mocked Clerk/RPC/provider integration", () => {
  it("requires authentication before database or provider access", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect(await translateMatchChatMessage(input)).toEqual({ ok: false, code: "auth_required" });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.translate).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it.each([null, { ...input, roomId: OTHER, messageId: undefined }, { ...input, sourceLanguage: "auto-detect" },
    { ...input, targetLanguage: "pt" }, { ...input, text: "forged source" }, { ...input, body: "forged source" },
    { ...input, clerkUserId: "admin", role: "admin" }])("rejects missing scope and client source/identity fields", async (value) => {
    expect(await translateMatchChatMessage(value)).toEqual({ ok: false, code: "invalid_request" });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  it("authorizes empty validation batches without accepting duplicate or contextless targets", async () => {
    mocks.read.mockResolvedValue({ data: { enabled: true, messages: [] }, error: null });
    expect(await validateMatchChatTranslations({ roomId: ROOM, messageIds: [] })).toEqual({ ok: true, data: { enabled: true, messages: [] } });
    for (const value of [{ messageIds: [] }, { roomId: ROOM, messageIds: [MESSAGE, MESSAGE.toUpperCase()] }, { roomId: ROOM, messageIds: [], body: ORIGINAL }]) {
      expect(await validateMatchChatTranslations(value)).toEqual({ ok: false, code: "invalid_request" });
    }
    expect(mocks.read).toHaveBeenCalledOnce();
  });

  it("passes only validated IDs through the authenticated RPC and only saved text to detection/provider", async () => {
    const result = await translateMatchChatMessage(input);
    expect(result.ok && result.data.original).toBe(ORIGINAL);
    expect(mocks.read).toHaveBeenCalledWith({ p_room_id: ROOM, p_message_ids: [MESSAGE] });
    expect(mocks.detect).toHaveBeenCalledWith(ORIGINAL, "auto");
    expect(mocks.translate).toHaveBeenCalledExactlyOnceWith({ text: ORIGINAL, targetLanguage: "it", sourceLanguage: "en" });
    expect(mocks.reserve).toHaveBeenCalledExactlyOnceWith({ p_room_id: ROOM, p_message_id: MESSAGE,
      p_target_language: "it", p_source_language: "en", p_expected_hash: HASH });
  });

  it("reserves a bounded attempt before provider use and stores only through the trusted completion client", async () => {
    const result = await translateMatchChatMessage(input);
    expect(result.ok && result.data.translatedText).toBe(TRANSLATED);
    expect(mocks.order).toEqual(["read_match_chat_translation_sources", "reserve_match_chat_translation", "provider", "complete", "read_match_chat_translation_sources"]);
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith("complete_match_chat_translation", { p_lease_id: LEASE, p_translated_text: TRANSLATED });
    expect(mocks.rpc.mock.calls.every(([name]) => name !== "complete_match_chat_translation")).toBe(true);
  });

  it("rechecks Clerk/room access before and after a cache hit, without provider calls or cache writes", async () => {
    mocks.reserve.mockResolvedValue({ data: { status: "cached", translatedText: TRANSLATED }, error: null });
    const result = await translateMatchChatMessage(input);
    expect(result.ok && { cached: result.data.cached, text: result.data.translatedText }).toEqual({ cached: true, text: TRANSLATED });
    expect(mocks.auth).toHaveBeenCalledTimes(2);
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.translate).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("does not expose originals after foreign-room denial or a malformed source snapshot", async () => {
    for (const snapshot of [{ data: null, error: { code: "42501", message: ORIGINAL } },
      sources({ messageId: OTHER, original: ORIGINAL, sourceHash: HASH }), sources({ messageId: MESSAGE, original: ORIGINAL, sourceHash: null })]) {
      mocks.read.mockResolvedValue(snapshot);
      const result = await translateMatchChatMessage(input);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(ORIGINAL);
    }
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  it("keeps disabled, ambiguous, same-language and redacted cases independent of quotas/provider", async () => {
    mocks.read.mockResolvedValue(sources(undefined, false));
    expect((await translateMatchChatMessage(input))).toMatchObject({ ok: true, data: { status: "disabled" } });
    mocks.read.mockResolvedValue(sources());
    vi.stubEnv("PATCH2_CHAT_TRANSLATION_PROVIDER_ENABLED", "false");
    expect((await translateMatchChatMessage(input))).toMatchObject({ ok: true, data: { status: "disabled" } });
    vi.stubEnv("PATCH2_CHAT_TRANSLATION_PROVIDER_ENABLED", "true");
    mocks.detect.mockReturnValue(null);
    expect((await translateMatchChatMessage(input))).toMatchObject({ ok: true, data: { status: "source_required" } });
    mocks.detect.mockReturnValue("it");
    expect((await translateMatchChatMessage(input))).toMatchObject({ ok: true, data: { status: "same_language" } });
    mocks.read.mockResolvedValue(redacted());
    expect((await translateMatchChatMessage(input))).toMatchObject({ ok: true, data: { status: "redacted", original: null, sourceHash: null } });
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  it.each(["busy", "disabled", "rate_limited", "quota_exhausted", "unavailable"])("handles %s reservations without provider use", async (status) => {
    mocks.reserve.mockResolvedValue({ data: { status }, error: null });
    expect(await translateMatchChatMessage(input)).toMatchObject({ ok: true, data: { status, original: ORIGINAL, translatedText: null } });
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  it("rejects reserve-time authorization loss without exposing its original or upstream diagnostic", async () => {
    mocks.reserve.mockResolvedValue({ data: null, error: { code: "42501", message: ORIGINAL } });
    expect(await translateMatchChatMessage(input)).toEqual({ ok: false, code: "forbidden" });
    expect(mocks.translate).not.toHaveBeenCalled();
  });

  it.each(["cached", "reserved"])("discards %s output when the original changes or is redacted while waiting", async (reservation) => {
    mocks.reserve.mockResolvedValue({ data: reservation === "cached" ? { status: reservation, translatedText: TRANSLATED } : { status: reservation, leaseId: LEASE }, error: null });
    mocks.read.mockResolvedValueOnce(sources()).mockResolvedValueOnce(changed());
    expect(await translateMatchChatMessage(input)).toMatchObject({ ok: true, data: { status: "unavailable", original: changed().data.messages[0].original, translatedText: null, cached: false } });
    mocks.read.mockResolvedValueOnce(sources()).mockResolvedValueOnce(redacted());
    const result = await translateMatchChatMessage(input);
    expect(result).toMatchObject({ ok: true, data: { status: "redacted", original: null, sourceHash: null, translatedText: null } });
    expect(JSON.stringify(result)).not.toContain(ORIGINAL);
    expect(JSON.stringify(result)).not.toContain(TRANSLATED);
  });

  it.each(["cached", "reserved"])("denies %s responses after the account loses authentication", async (reservation) => {
    mocks.reserve.mockResolvedValue({ data: reservation === "cached" ? { status: reservation, translatedText: TRANSLATED } : { status: reservation, leaseId: LEASE }, error: null });
    mocks.auth.mockResolvedValueOnce({ userId: "synthetic" }).mockResolvedValueOnce({ userId: null });
    expect(await translateMatchChatMessage(input)).toEqual({ ok: false, code: "auth_required" });
  });

  it("checks the off switch again after provider completion", async () => {
    mocks.read.mockResolvedValueOnce(sources()).mockResolvedValueOnce(sources(undefined, false));
    expect(await translateMatchChatMessage(input)).toMatchObject({ ok: true, data: { status: "disabled", translatedText: null, cached: false } });
  });

  it.each(["unavailable", "quota_exhausted", "rate_limited", "disabled"])("leaves ordinary chat original available after typed provider %s", async (status) => {
    mocks.translate.mockResolvedValue({ status, sourceLanguage: "en", translatedText: null });
    expect(await translateMatchChatMessage(input)).toMatchObject({ ok: true, data: { status, original: ORIGINAL, translatedText: null } });
    expect(mocks.complete).toHaveBeenCalledWith("complete_match_chat_translation", { p_lease_id: LEASE, p_translated_text: null });
  });

  it("does not deliver provider text if completion fails or the lease became stale", async () => {
    for (const completion of [{ data: false, error: null }, { data: null, error: { code: "private-upstream-code" } }]) {
      mocks.complete.mockResolvedValue(completion);
      expect(await translateMatchChatMessage(input)).toMatchObject({ ok: true, data: { status: "unavailable", original: ORIGINAL, translatedText: null } });
    }
  });

  it.each(["provider", "completion", "reservation"])("rechecks privacy after an exception in %s without resurrecting old text", async (where) => {
    mocks.read.mockResolvedValueOnce(sources()).mockResolvedValueOnce(redacted());
    const error = new Error(`PRIVATE_${ORIGINAL}`);
    if (where === "provider") mocks.translate.mockRejectedValue(error);
    if (where === "completion") mocks.complete.mockRejectedValue(error);
    if (where === "reservation") mocks.reserve.mockRejectedValue(error);
    const result = await translateMatchChatMessage(input);
    expect(result).toMatchObject({ ok: true, data: { status: "redacted", original: null, translatedText: null, sourceHash: null } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_");
  });

  it.each([null, { status: "cached", translatedText: "\u0000invalid" }])("rechecks privacy after malformed reserve/cache results", async (reservation) => {
    mocks.reserve.mockResolvedValue({ data: reservation, error: null });
    mocks.read.mockResolvedValueOnce(sources()).mockResolvedValueOnce(redacted());
    expect(await translateMatchChatMessage(input)).toMatchObject({ ok: true, data: { status: "redacted", original: null, translatedText: null, sourceHash: null } });
    expect(mocks.translate).not.toHaveBeenCalled();
  });
});
