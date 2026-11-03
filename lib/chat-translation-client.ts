import { parseChatTranslationInput, parseChatTranslationResult, parseChatTranslationSourceResult,
  parseChatTranslationValidationInput, type ChatTranslationSourceResult, type TranslationResult } from "@/lib/chat-translation";

const TRANSLATION_ROUTE = "/api/match-chat/translation";
const REQUEST_TIMEOUT_MS = 15_000;
const unavailable = { ok: false, code: "unavailable" } as const;

/** Ordinary fetch keeps slow optional translation outside Next's client Server Action queue. */
async function request(operation: "translate" | "validate", input: unknown): Promise<{ body: unknown; success: boolean } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(TRANSLATION_ROUTE, {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ operation, input }),
    });
    return { body: await response.json() as unknown, success: response.ok };
  } catch {
    // Never expose network diagnostics, server error text or private source content.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateMatchChatTranslations(input: unknown): Promise<ChatTranslationSourceResult> {
  const parsed = parseChatTranslationValidationInput(input);
  if (!parsed) return { ok: false, code: "invalid_request" };
  const normalized = { roomId: parsed.roomId.toLowerCase(), messageIds: parsed.messageIds.map((id) => id.toLowerCase()) };
  if (new Set(normalized.messageIds).size !== normalized.messageIds.length) return { ok: false, code: "invalid_request" };
  const response = await request("validate", normalized);
  if (!response) return unavailable;
  const result = parseChatTranslationSourceResult(response.body);
  if (!result) return unavailable;
  if (!result.ok) return result;
  if (!response.success || result.data.messages.length !== normalized.messageIds.length) return unavailable;
  const remaining = new Set(normalized.messageIds);
  for (const message of result.data.messages) if (!remaining.delete(message.messageId)) return unavailable;
  return remaining.size === 0 ? result : unavailable;
}

export async function translateMatchChatMessage(input: unknown): Promise<TranslationResult> {
  const parsed = parseChatTranslationInput(input);
  if (!parsed) return { ok: false, code: "invalid_request" };
  const normalized = { ...parsed, roomId: parsed.roomId.toLowerCase(), messageId: parsed.messageId.toLowerCase() };
  const response = await request("translate", normalized);
  if (!response) return unavailable;
  const result = parseChatTranslationResult(response.body);
  if (!result) return unavailable;
  if (!result.ok) return result;
  if (!response.success || result.data.roomId.toLowerCase() !== normalized.roomId || result.data.messageId.toLowerCase() !== normalized.messageId ||
    result.data.targetLanguage !== normalized.targetLanguage ||
    (normalized.sourceLanguage !== "auto" && result.data.sourceLanguage !== null && result.data.sourceLanguage !== normalized.sourceLanguage)) return unavailable;
  return result;
}
