import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translateMatchChatMessage, validateMatchChatTranslations } from "@/lib/chat-translation-client";

const ROOM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MESSAGE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const input = { roomId: ROOM, messageId: MESSAGE, targetLanguage: "it", sourceLanguage: "auto" };
const source = { messageId: MESSAGE, original: "Do not start before 18:30 UTC.", sourceHash: "a".repeat(64) };
const translated = { ok: true, data: { ...source, roomId: ROOM, sourceLanguage: "en", targetLanguage: "it",
  translatedText: "Non iniziare prima delle 18:30 UTC.", cached: false, status: "translated" } };
const validation = { ok: true, data: { enabled: true, messages: [source] } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("ordinary fetch chat translation transport", () => {
  it("posts only the scoped operation and input to the same-origin route", async () => {
    fetchMock.mockResolvedValue(json(translated));
    expect(await translateMatchChatMessage(input)).toEqual(translated);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/match-chat/translation");
    expect(options).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json" } });
    expect(JSON.parse(options?.body as string)).toEqual({ operation: "translate", input });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(Object.keys(options?.headers ?? {})).not.toContain("Authorization");
  });

  it("validates original message access separately, including an empty room capability query", async () => {
    fetchMock.mockResolvedValueOnce(json(validation)).mockResolvedValueOnce(json({ ok: true, data: { enabled: false, messages: [] } }));
    expect(await validateMatchChatTranslations({ roomId: ROOM, messageIds: [MESSAGE] })).toEqual(validation);
    expect(await validateMatchChatTranslations({ roomId: ROOM, messageIds: [] })).toEqual({ ok: true, data: { enabled: false, messages: [] } });
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ operation: "validate", input: { roomId: ROOM, messageIds: [MESSAGE] } });
  });

  it("rejects forged client text, missing context and duplicate targets before transport", async () => {
    for (const value of [{ ...input, body: "forged original" }, { ...input, text: "forged original" }, { ...input, roomId: "" },
      { ...input, sourceLanguage: "unknown" }, { ...input, targetLanguage: "pt" }]) {
      expect(await translateMatchChatMessage(value)).toEqual({ ok: false, code: "invalid_request" });
    }
    expect(await validateMatchChatTranslations({ roomId: ROOM, messageIds: [MESSAGE, MESSAGE.toUpperCase()] })).toEqual({ ok: false, code: "invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("projects safe response fields and rejects foreign message, room, language and source replies", async () => {
    fetchMock.mockResolvedValueOnce(json({ ...translated, privateError: "PRIVATE", data: { ...translated.data, providerToken: "PRIVATE" } }));
    expect(await translateMatchChatMessage(input)).toEqual(translated);
    for (const patch of [{ messageId: OTHER }, { roomId: OTHER }, { targetLanguage: "fr" }, { original: null }, { sourceHash: null }, { translatedText: "\u0000" }]) {
      fetchMock.mockResolvedValueOnce(json({ ok: true, data: { ...translated.data, ...patch } }));
      expect(await translateMatchChatMessage(input)).toEqual({ ok: false, code: "unavailable" });
    }
    fetchMock.mockResolvedValueOnce(json(translated));
    expect(await translateMatchChatMessage({ ...input, sourceLanguage: "fr" })).toEqual({ ok: false, code: "unavailable" });
  });

  it("rejects mismatched validation membership, repeated IDs and malformed original/hash pairs", async () => {
    for (const messages of [[{ ...source, messageId: OTHER }], [], [source, source], [{ ...source, sourceHash: null }], [{ ...source, original: null }]]) {
      fetchMock.mockResolvedValueOnce(json({ ok: true, data: { enabled: true, messages } }));
      expect(await validateMatchChatTranslations({ roomId: ROOM, messageIds: [MESSAGE] })).toEqual({ ok: false, code: "unavailable" });
    }
  });

  it("retains redacted tombstones without returning old originals or translations", async () => {
    const redacted = { ...source, original: null, sourceHash: null };
    fetchMock.mockResolvedValueOnce(json({ ok: true, data: { enabled: true, messages: [redacted] } }));
    expect(await validateMatchChatTranslations({ roomId: ROOM, messageIds: [MESSAGE] })).toEqual({ ok: true, data: { enabled: true, messages: [redacted] } });
    const result = { ok: true, data: { ...translated.data, ...redacted, sourceLanguage: null, translatedText: null, status: "redacted" } };
    fetchMock.mockResolvedValueOnce(json(result));
    expect(await translateMatchChatMessage(input)).toEqual(result);
  });

  it.each([[401, "auth_required"], [403, "forbidden"], [400, "invalid_request"], [503, "unavailable"]])("preserves safe HTTP %s failures without diagnostic content", async (status, code) => {
    fetchMock.mockImplementation(async () => json({ ok: false, code, privateDiagnostic: "PRIVATE_BODY" }, status as number));
    expect(await translateMatchChatMessage(input)).toEqual({ ok: false, code });
    expect(await validateMatchChatTranslations({ roomId: ROOM, messageIds: [MESSAGE] })).toEqual({ ok: false, code });
  });

  it("does not accept success payloads from failed HTTP responses or follow login redirects", async () => {
    fetchMock.mockResolvedValueOnce(json(translated, 403)).mockResolvedValueOnce(json(validation, 500)).mockRejectedValueOnce(new TypeError("PRIVATE redirected response"));
    expect(await translateMatchChatMessage(input)).toEqual({ ok: false, code: "unavailable" });
    expect(await validateMatchChatTranslations({ roomId: ROOM, messageIds: [MESSAGE] })).toEqual({ ok: false, code: "unavailable" });
    expect(await translateMatchChatMessage(input)).toEqual({ ok: false, code: "unavailable" });
  });

  it("converts non-JSON, malformed responses and network failures into safe unavailability", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>PRIVATE</html>")).mockResolvedValueOnce(json({ ok: false, code: "PRIVATE" })).mockRejectedValueOnce(new Error("PRIVATE network"));
    for (let i = 0; i < 3; i++) expect(await translateMatchChatMessage(input)).toEqual({ ok: false, code: "unavailable" });
  });

  it("aborts a stalled request after fifteen seconds without retries or leaked errors", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("PRIVATE timeout", "AbortError")), { once: true });
    }));
    const pending = translateMatchChatMessage(input);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, code: "unavailable" });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("dispatches optional requests independently without a shared client action queue", async () => {
    let releaseFirst!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = resolve; })).mockResolvedValueOnce(json(validation));
    const first = translateMatchChatMessage(input);
    const second = validateMatchChatTranslations({ roomId: ROOM, messageIds: [MESSAGE] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await second).toEqual(validation);
    releaseFirst(json(translated));
    expect(await first).toEqual(translated);
    expect(fetchMock.mock.calls[0][1]?.signal).not.toBe(fetchMock.mock.calls[1][1]?.signal);
  });
});
