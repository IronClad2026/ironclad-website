"use server";

import { auth } from "@clerk/nextjs/server";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { detectChatSourceLanguage, translateChatText } from "@/lib/chat-translation-provider";
import {
  isChatTranslationText, parseChatTranslationInput, parseChatTranslationValidationInput,
  type ChatTranslationData, type TranslationResult,
} from "@/lib/chat-translation";

type Failure = Extract<TranslationResult, { ok: false }>;
type Source = { messageId: string; original: string | null; sourceHash: string | null };
type Sources = { enabled: boolean; messages: Source[] };
type SourceResult = { ok: true; data: Sources } | Failure;
const HASH = /^[a-f0-9]{64}$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function errorCode(error: { code?: string }): Failure {
  return { ok: false, code: error.code === "42501" ? "forbidden" : error.code === "22023" ? "invalid_request" : "unavailable" };
}
function providerConfigured() {
  return process.env.PATCH2_CHAT_TRANSLATION_PROVIDER_ENABLED === "true" &&
    /^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID ?? "") &&
    Boolean(process.env.CLOUDFLARE_AI_API_TOKEN);
}

/** No Next cache: every read, including a cache hit, repeats Clerk and room access. */
export async function validateMatchChatTranslations(input: unknown): Promise<SourceResult> {
  try {
    const { userId } = await auth();
    if (!userId) return { ok: false, code: "auth_required" };
    const parsed = parseChatTranslationValidationInput(input);
    if (!parsed) return { ok: false, code: "invalid_request" };
    const ids = parsed.messageIds.map((id) => id.toLowerCase());
    if (new Set(ids).size !== ids.length) return { ok: false, code: "invalid_request" };
    const client = await createAuthenticatedSupabaseClient();
    const { data, error } = await client.rpc("read_match_chat_translation_sources", {
      p_room_id: parsed.roomId.toLowerCase(), p_message_ids: ids,
    });
    if (error) return errorCode(error);
    if (!record(data) || typeof data.enabled !== "boolean" || !Array.isArray(data.messages) || data.messages.length !== ids.length) {
      return { ok: false, code: "unavailable" };
    }
    const remaining = new Set(ids);
    const messages: Source[] = [];
    for (const item of data.messages) {
      if (!record(item) || typeof item.messageId !== "string" || !remaining.delete(item.messageId) ||
        (item.original === null ? item.sourceHash !== null :
          !isChatTranslationText(item.original) || typeof item.sourceHash !== "string" || !HASH.test(item.sourceHash))) {
        return { ok: false, code: "unavailable" };
      }
      messages.push({ messageId: item.messageId, original: item.original as string | null, sourceHash: item.sourceHash as string | null });
    }
    return { ok: true, data: { enabled: data.enabled && providerConfigured(), messages } };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export async function translateMatchChatMessage(input: unknown): Promise<TranslationResult> {
  const parsed = parseChatTranslationInput(input);
  if (!parsed) return { ok: false, code: "invalid_request" };
  const roomId = parsed.roomId.toLowerCase(), messageId = parsed.messageId.toLowerCase();
  const read = () => validateMatchChatTranslations({ roomId, messageIds: [messageId] });
  const initial = await read();
  if (!initial.ok) return initial;
  let source = initial.data.messages[0];
  const data = (status: ChatTranslationData["status"], extra: Partial<ChatTranslationData> = {}): TranslationResult => ({
    ok: true, data: { roomId, messageId, targetLanguage: parsed.targetLanguage, sourceLanguage: null,
      original: source.original, sourceHash: source.sourceHash, translatedText: null, cached: false, status, ...extra },
  });
  if (source.original === null) return data("redacted");
  if (!initial.data.enabled) return data("disabled");
  const language = detectChatSourceLanguage(source.original, parsed.sourceLanguage);
  if (!language) return data("source_required");
  if (language === parsed.targetLanguage) return data("same_language", { sourceLanguage: language });
  try {
    const client = await createAuthenticatedSupabaseClient();
    const reserved = await client.rpc("reserve_match_chat_translation", {
      p_room_id: roomId, p_message_id: messageId, p_target_language: parsed.targetLanguage,
      p_source_language: language, p_expected_hash: source.sourceHash,
    });
    if (reserved.error) return errorCode(reserved.error);
    if (!record(reserved.data) || typeof reserved.data.status !== "string") throw new Error("Invalid translation reservation");
    let translated: string | null = null;
    let cached = false;
    let status: ChatTranslationData["status"] = "unavailable";
    if (reserved.data.status === "cached") {
      if (!isChatTranslationText(reserved.data.translatedText)) throw new Error("Invalid translation cache result");
      translated = reserved.data.translatedText; cached = true; status = "translated";
    } else if (reserved.data.status === "reserved" && typeof reserved.data.leaseId === "string" &&
      /^[a-f0-9-]{36}$/i.test(reserved.data.leaseId)) {
      const output = await translateChatText({ text: source.original, targetLanguage: parsed.targetLanguage, sourceLanguage: language });
      // Only a trusted server may store provider output. The DB independently
      // rechecks the lease, original hash, account closure, redaction and purge.
      const completed = await createSupabaseAdminClient().rpc("complete_match_chat_translation", {
        p_lease_id: reserved.data.leaseId,
        p_translated_text: output.status === "translated" ? output.translatedText : null,
      });
      if (completed.error || completed.data !== true) status = "unavailable";
      else { status = output.status; translated = output.translatedText; }
    } else if (["busy", "disabled", "rate_limited", "quota_exhausted", "unavailable", "redacted"].includes(reserved.data.status)) {
      status = reserved.data.status as ChatTranslationData["status"];
    }
    // Never deliver even a cached derivative after access or the original has
    // changed while the provider was running. Failure leaves chat independent.
    const latest = await read();
    if (!latest.ok) return latest;
    const current = latest.data.messages[0];
    const changed = current.sourceHash !== source.sourceHash;
    source = current;
    if (source.original === null) return data("redacted");
    if (!latest.data.enabled) return data("disabled");
    if (changed) return data("unavailable");
    return data(status, { sourceLanguage: language, translatedText: status === "translated" ? translated : null,
      cached: status === "translated" && cached });
  } catch {
    const latest = await read();
    if (!latest.ok) return latest;
    source = latest.data.messages[0];
    return data(source.original === null ? "redacted" : "unavailable");
  }
}
