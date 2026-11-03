import { describe, expect, it } from "vitest";
import { getTranslationProviderLanguage, isChatTranslationText, isTranslationLanguage, parseChatTranslationInput,
  parseChatTranslationResult, parseChatTranslationValidationInput, TRANSLATION_LANGUAGES } from "@/lib/chat-translation";

const roomId = "11111111-1111-4111-8111-111111111111";
const messageId = "22222222-2222-4222-8222-222222222222";
const input = { roomId, messageId, targetLanguage: "it", sourceLanguage: "auto" };
const data = { roomId, messageId, targetLanguage: "it", sourceLanguage: "en", original: "Do not start before 18:30 UTC.",
  sourceHash: "a".repeat(64), translatedText: "Non iniziare prima delle 18:30 UTC.", cached: false, status: "translated" };

describe("match chat translation boundaries", () => {
  it("maps exactly the eight website languages to supported base model codes", () => {
    expect(TRANSLATION_LANGUAGES.map(getTranslationProviderLanguage)).toEqual(["en", "it", "zh", "ru", "es", "pt", "ko", "fr"]);
    for (const value of ["zh", "pt", "de", "EN", "auto", null, 4]) expect(isTranslationLanguage(value)).toBe(false);
  });

  it("requires explicit room, message, target and source context and rejects client text", () => {
    expect(parseChatTranslationInput(input)).toEqual(input);
    expect(parseChatTranslationInput({ ...input, senderLocale: "fr", body: "forged text" })).toBeNull();
    for (const changed of [{ roomId: null }, { roomId: "../other" }, { messageId: "00000000-0000-0000-0000-000000000000" },
      { targetLanguage: "pt" }, { targetLanguage: "zh-Hans" }, { sourceLanguage: undefined }, { sourceLanguage: "unknown" }]) {
      expect(parseChatTranslationInput({ ...input, ...changed })).toBeNull();
    }
    for (const sourceLanguage of TRANSLATION_LANGUAGES) expect(parseChatTranslationInput({ ...input, sourceLanguage })?.sourceLanguage).toBe(sourceLanguage);
  });

  it("bounds distinct message validation targets", () => {
    expect(parseChatTranslationValidationInput({ roomId, messageIds: [messageId] })).toEqual({ roomId, messageIds: [messageId] });
    expect(parseChatTranslationValidationInput({ roomId, messageIds: [] })).toEqual({ roomId, messageIds: [] });
    expect(parseChatTranslationValidationInput({ roomId, messageIds: [], text: "forged" })).toBeNull();
    for (const messageIds of [[messageId, messageId], ["bad"], Array.from({ length: 51 }, () => messageId)]) {
      expect(parseChatTranslationValidationInput({ roomId, messageIds })).toBeNull();
    }
  });

  it("preserves plain text, Unicode, literal references and important scheduling details", () => {
    for (const text of ["😀".repeat(6000), "Do NOT start 2026-11-08 at 18:30 UTC+01:00. @Player_1 lost 2–0. https://example.test/match?a=1&b=2",
      '<script>alert("hello")</script>']) expect(isChatTranslationText(text)).toBe(true);
    // This contract carries text; rendering must use React text nodes, never innerHTML.
    for (const text of ["😀".repeat(6001), "\u0000private", "\t\n\u200b\u2060", "", null]) expect(isChatTranslationText(text)).toBe(false);
  });

  it("projects result DTOs without exposing provider details", () => {
    expect(parseChatTranslationResult({ ok: true, data: { ...data, token: "never-export", providerError: "private" } })).toEqual({ ok: true, data });
    for (const code of ["auth_required", "forbidden", "invalid_request", "unavailable"]) expect(parseChatTranslationResult({ ok: false, code })).toEqual({ ok: false, code });
    expect(parseChatTranslationResult({ ok: false, code: "upstream-token-rejected" })).toBeNull();
  });

  it("rejects inconsistent translation/hash/source state", () => {
    for (const changed of [{ sourceHash: "not-a-hash" }, { sourceHash: null }, { original: null }, { translatedText: null },
      { sourceLanguage: null }, { sourceLanguage: "it" }, { sourceLanguage: "pt" }, { targetLanguage: "de" }, { cached: "true" },
      { status: "unavailable" }, { translatedText: "\u0000" }]) expect(parseChatTranslationResult({ ok: true, data: { ...data, ...changed } })).toBeNull();
    expect(parseChatTranslationResult({ ok: true, data: { ...data, cached: true } })).not.toBeNull();
  });

  it("requires redacted responses to contain no original, translation, hash or stale cache flag", () => {
    const redacted = { ...data, status: "redacted", original: null, sourceHash: null, sourceLanguage: null, translatedText: null };
    expect(parseChatTranslationResult({ ok: true, data: redacted })).toEqual({ ok: true, data: redacted });
    for (const changed of [{ original: "deleted" }, { translatedText: "deleted" }, { sourceHash: data.sourceHash }, { cached: true }, { sourceLanguage: "en" }]) {
      expect(parseChatTranslationResult({ ok: true, data: { ...redacted, ...changed } })).toBeNull();
    }
  });

  it("keeps recoverable statuses text-free while preserving the authorized original", () => {
    for (const status of ["disabled", "busy", "rate_limited", "quota_exhausted", "unavailable", "source_required"]) {
      expect(parseChatTranslationResult({ ok: true, data: { ...data, status, translatedText: null, sourceLanguage: null } })).not.toBeNull();
    }
    expect(parseChatTranslationResult({ ok: true, data: { ...data, status: "same_language", sourceLanguage: "it", translatedText: null } })).not.toBeNull();
    expect(parseChatTranslationResult({ ok: true, data: { ...data, status: "same_language", translatedText: null } })).toBeNull();
  });
});
