import { isLocale, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";

export const TRANSLATION_LANGUAGES = SUPPORTED_LOCALES;
export type TranslationLanguage = Locale;
export type TranslationSourceLanguage = TranslationLanguage | "auto";
export const CHAT_TRANSLATION_MAX_OUTPUT_LENGTH = 6000;
export const CHAT_TRANSLATION_VALIDATION_LIMIT = 50;

export type ChatTranslationInput = {
  roomId: string;
  messageId: string;
  targetLanguage: TranslationLanguage;
  sourceLanguage: TranslationSourceLanguage;
};

export type ChatTranslationStatus = "translated" | "same_language" | "source_required" |
  "disabled" | "busy" | "rate_limited" | "quota_exhausted" | "unavailable" | "redacted";

export type ChatTranslationData = {
  messageId: string;
  roomId: string;
  original: string | null;
  sourceHash: string | null;
  sourceLanguage: TranslationLanguage | null;
  targetLanguage: TranslationLanguage;
  translatedText: string | null;
  cached: boolean;
  status: ChatTranslationStatus;
};

export type TranslationResult = { ok: true; data: ChatTranslationData } |
  { ok: false; code: "auth_required" | "forbidden" | "invalid_request" | "unavailable" };

export type ChatTranslationSource = { messageId: string; original: string | null; sourceHash: string | null };
export type ChatTranslationSources = { enabled: boolean; messages: ChatTranslationSource[] };
export type ChatTranslationSourceResult = { ok: true; data: ChatTranslationSources } | Extract<TranslationResult, { ok: false }>;

const PROVIDER_LANGUAGES = {
  en: "en", it: "it", "zh-CN": "zh", ru: "ru", es: "es", "pt-BR": "pt", ko: "ko", fr: "fr",
} as const satisfies Record<TranslationLanguage, string>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const STATUSES = new Set<ChatTranslationStatus>([
  "translated", "same_language", "source_required", "disabled", "busy", "rate_limited", "quota_exhausted", "unavailable", "redacted",
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTranslationLanguage(value: unknown): value is TranslationLanguage {
  return isLocale(value);
}

export function getTranslationProviderLanguage(language: TranslationLanguage) {
  return PROVIDER_LANGUAGES[language];
}

export function parseChatTranslationInput(value: unknown): ChatTranslationInput | null {
  if (!record(value) || Object.keys(value).some((key) => !["roomId", "messageId", "targetLanguage", "sourceLanguage"].includes(key)) ||
    typeof value.roomId !== "string" || !UUID.test(value.roomId) ||
    typeof value.messageId !== "string" || !UUID.test(value.messageId) || !isTranslationLanguage(value.targetLanguage) ||
    (value.sourceLanguage !== "auto" && !isTranslationLanguage(value.sourceLanguage))) return null;
  return { roomId: value.roomId, messageId: value.messageId, targetLanguage: value.targetLanguage, sourceLanguage: value.sourceLanguage };
}

export function parseChatTranslationValidationInput(value: unknown): { roomId: string; messageIds: string[] } | null {
  if (!record(value) || Object.keys(value).some((key) => !["roomId", "messageIds"].includes(key)) ||
    typeof value.roomId !== "string" || !UUID.test(value.roomId) || !Array.isArray(value.messageIds) ||
    value.messageIds.length > CHAT_TRANSLATION_VALIDATION_LIMIT ||
    value.messageIds.some((id) => typeof id !== "string" || !UUID.test(id)) ||
    new Set(value.messageIds).size !== value.messageIds.length) return null;
  return { roomId: value.roomId, messageIds: [...value.messageIds] as string[] };
}

export function isChatTranslationText(value: unknown): value is string {
  return typeof value === "string" && value.length <= CHAT_TRANSLATION_MAX_OUTPUT_LENGTH * 2 &&
    Array.from(value).length <= CHAT_TRANSLATION_MAX_OUTPUT_LENGTH &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value) && /[^\s\p{Cf}]/u.test(value);
}

export function parseChatTranslationResult(value: unknown): TranslationResult | null {
  if (!record(value)) return null;
  if (value.ok === false) {
    const code = value.code;
    return code === "auth_required" || code === "forbidden" || code === "invalid_request" || code === "unavailable"
      ? { ok: false, code } : null;
  }
  if (value.ok !== true || !record(value.data)) return null;
  const data = value.data;
  if (typeof data.roomId !== "string" || !UUID.test(data.roomId) || typeof data.messageId !== "string" || !UUID.test(data.messageId) ||
    !isTranslationLanguage(data.targetLanguage) || (data.sourceLanguage !== null && !isTranslationLanguage(data.sourceLanguage)) ||
    typeof data.cached !== "boolean" || !STATUSES.has(data.status as ChatTranslationStatus)) return null;
  const status = data.status as ChatTranslationStatus;
  if (data.original !== null && !isChatTranslationText(data.original)) return null;
  if (data.sourceHash !== null && (typeof data.sourceHash !== "string" || !HASH.test(data.sourceHash))) return null;
  if (data.translatedText !== null && !isChatTranslationText(data.translatedText)) return null;
  if (status === "redacted") {
    if (data.original !== null || data.sourceHash !== null || data.translatedText !== null || data.sourceLanguage !== null || data.cached) return null;
  } else {
    if (data.original === null || data.sourceHash === null) return null;
    if (status === "translated") {
      if (data.translatedText === null || data.sourceLanguage === null || data.sourceLanguage === data.targetLanguage) return null;
    } else if (data.translatedText !== null || data.cached) return null;
    if (status === "same_language" && data.sourceLanguage !== data.targetLanguage) return null;
    if (status === "source_required" && data.sourceLanguage !== null) return null;
  }
  return { ok: true, data: {
    messageId: data.messageId, roomId: data.roomId, original: data.original as string | null,
    sourceHash: data.sourceHash as string | null, sourceLanguage: data.sourceLanguage as TranslationLanguage | null,
    targetLanguage: data.targetLanguage, translatedText: data.translatedText as string | null, cached: data.cached, status,
  } };
}

export function parseChatTranslationSourceResult(value: unknown): ChatTranslationSourceResult | null {
  if (!record(value)) return null;
  if (value.ok === false) {
    const failure = parseChatTranslationResult(value);
    return failure && !failure.ok ? failure : null;
  }
  if (value.ok !== true || !record(value.data) || typeof value.data.enabled !== "boolean" || !Array.isArray(value.data.messages) ||
    value.data.messages.length > CHAT_TRANSLATION_VALIDATION_LIMIT) return null;
  const messages: ChatTranslationSource[] = [];
  const seen = new Set<string>();
  for (const item of value.data.messages) {
    if (!record(item) || typeof item.messageId !== "string" || !UUID.test(item.messageId) || seen.has(item.messageId.toLowerCase()) ||
      (item.original === null ? item.sourceHash !== null :
        !isChatTranslationText(item.original) || typeof item.sourceHash !== "string" || !HASH.test(item.sourceHash))) return null;
    seen.add(item.messageId.toLowerCase());
    messages.push({ messageId: item.messageId.toLowerCase(), original: item.original as string | null, sourceHash: item.sourceHash as string | null });
  }
  return { ok: true, data: { enabled: value.data.enabled, messages } };
}
