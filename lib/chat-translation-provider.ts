import "server-only";
import { francAll } from "franc";
import * as OpenCC from "opencc-js";
import { MATCH_ROOM_MESSAGE_MAX_LENGTH } from "@/lib/match-room";
import { getTranslationProviderLanguage, isChatTranslationText, isTranslationLanguage, type TranslationLanguage, type TranslationSourceLanguage } from "@/lib/chat-translation";

export const CHAT_TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b";
const PROVIDER_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 65536;
const MIN_DETECTION_LETTERS = 20;
const MIN_DETECTION_RANK_MARGIN = 0.10;
const LANGUAGE_FROM_ISO3: Readonly<Record<string, TranslationLanguage>> = {
  eng: "en", ita: "it", cmn: "zh-CN", zho: "zh-CN", rus: "ru", spa: "es", por: "pt-BR", kor: "ko", fra: "fr",
};
const simplifyChinese = OpenCC.Converter({ from: "t", to: "cn" });

export type ChatTranslationProviderConfig = { accountId: string; apiToken: string; enabled: boolean };
export type ChatTranslationProviderResult = {
  status: "translated" | "same_language" | "source_required" | "disabled" | "rate_limited" | "quota_exhausted" | "unavailable";
  sourceLanguage: TranslationLanguage | null;
  translatedText: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detectionText(text: string) {
  // Remove literal references only from the detector's sample. Provider input remains the saved original.
  return text.replace(/https?:\/\/[^\s]+|www\.[^\s]+/giu, " ").replace(/@[\p{L}\p{N}_-]+/gu, " ").replace(/\d+/gu, " ").trim();
}

function identifySample(text: string): TranslationLanguage | null {
  const letters = Array.from(text).filter((char) => /\p{L}/u.test(char));
  if (letters.length < MIN_DETECTION_LETTERS || /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return null;
  const scriptCounts = [/[\p{Script=Latin}]/u, /[\p{Script=Cyrillic}]/u, /[\p{Script=Han}]/u, /[\p{Script=Hangul}]/u]
    .map((script) => letters.filter((letter) => script.test(letter)).length);
  if (scriptCounts.filter((count) => count >= 8 && count / letters.length >= 0.2).length > 1) return null;
  const ranks = francAll(text, { minLength: MIN_DETECTION_LETTERS });
  const best = ranks[0];
  if (!best || !Number.isFinite(best[1])) return null;
  const language = LANGUAGE_FROM_ISO3[best[0]];
  if (!language) return null;
  const next = ranks[1];
  // Franc values are relative rank scores, never calibrated probabilities.
  if (next && (!Number.isFinite(next[1]) || best[1] - next[1] < MIN_DETECTION_RANK_MARGIN)) return null;
  return language;
}

export function detectChatSourceLanguage(text: string, override: TranslationSourceLanguage = "auto"): TranslationLanguage | null {
  if (isTranslationLanguage(override)) return override;
  if (override !== "auto" || typeof text !== "string") return null;
  const sample = detectionText(text);
  const language = identifySample(sample);
  if (!language) return null;
  const segments = sample.split(/[.!?。！？\n]+/u).map((segment) => segment.trim()).filter((segment) => (segment.match(/\p{L}/gu)?.length ?? 0) >= MIN_DETECTION_LETTERS);
  if (segments.length > 1 && segments.some((segment) => identifySample(segment) !== language)) return null;
  return language;
}

function providerConfigFromEnvironment(): ChatTranslationProviderConfig | null {
  if (process.env.PATCH2_CHAT_TRANSLATION_PROVIDER_ENABLED !== "true") return null;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_AI_API_TOKEN;
  return accountId && apiToken ? { accountId, apiToken, enabled: true } : null;
}

function usableConfig(config: ChatTranslationProviderConfig | null): config is ChatTranslationProviderConfig {
  return config !== null && config.enabled === true && /^[a-f0-9]{32}$/i.test(config.accountId) &&
    typeof config.apiToken === "string" && config.apiToken.length > 0 && !/[\r\n]/u.test(config.apiToken);
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.body) return null;
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_RESPONSE_BYTES) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let json = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); return null; }
      json += decoder.decode(chunk.value, { stream: true });
    }
    json += decoder.decode();
    return JSON.parse(json) as unknown;
  } finally {
    reader.releaseLock();
  }
}

function provesFreeWorkersPlan(value: unknown): boolean {
  if (!isRecord(value) || value.success !== true || !Array.isArray(value.result) || value.result.length === 0) return false;
  if (isRecord(value.result_info)) {
    const total = value.result_info.total_count;
    if (typeof total !== "number" || !Number.isSafeInteger(total) || total !== value.result.length) return false;
    if (typeof value.result_info.page === "number" && value.result_info.page !== 1) return false;
  }
  let freePlans = 0;
  for (const subscription of value.result) {
    if (!isRecord(subscription) || !isRecord(subscription.rate_plan)) return false;
    const plan = subscription.rate_plan;
    if (typeof plan.id !== "string" || typeof plan.public_name !== "string" || typeof subscription.state !== "string") return false;
    const isWorkers = /workers/i.test(plan.id) || /workers/i.test(plan.public_name);
    if (!isWorkers) continue;
    if (subscription.state === "Expired" || subscription.state === "Failed") continue;
    // There is no documented Workers Free plan ID. Require an explicit fresh name, never infer Free from missing subscriptions.
    if (plan.public_name.trim() !== "Workers Free" || plan.scope !== "account" || subscription.price !== 0 ||
      (subscription.state !== "Provisioned" && subscription.state !== "Paid")) return false;
    freePlans += 1;
  }
  return freePlans === 1;
}

async function verifyFreePlan(config: ChatTranslationProviderConfig, fetchImpl: typeof fetch, signal: AbortSignal): Promise<boolean> {
  const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/subscriptions`, {
    method: "GET", headers: { Authorization: `Bearer ${config.apiToken}` }, cache: "no-store", redirect: "error", signal,
  });
  if (!response.ok) return false;
  return provesFreeWorkersPlan(await readJson(response));
}

export async function verifyCloudflareFreePlan(config: ChatTranslationProviderConfig, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!usableConfig(config)) return false;
  try {
    return await verifyFreePlan(config, fetchImpl, AbortSignal.timeout(PROVIDER_TIMEOUT_MS));
  } catch {
    return false;
  }
}

export async function translateChatText(
  input: { text: string; targetLanguage: TranslationLanguage; sourceLanguage: TranslationSourceLanguage },
  options: { config?: ChatTranslationProviderConfig | null; fetch?: typeof fetch } = {},
): Promise<ChatTranslationProviderResult> {
  const result = (status: ChatTranslationProviderResult["status"], sourceLanguage: TranslationLanguage | null = null, translatedText: string | null = null): ChatTranslationProviderResult => ({ status, sourceLanguage, translatedText });
  const config = options.config === undefined ? providerConfigFromEnvironment() : options.config;
  if (!usableConfig(config)) return result("disabled");
  if (typeof input.text !== "string" || Array.from(input.text).length > MATCH_ROOM_MESSAGE_MAX_LENGTH || !isChatTranslationText(input.text) ||
    !isTranslationLanguage(input.targetLanguage) || (input.sourceLanguage !== "auto" && !isTranslationLanguage(input.sourceLanguage))) return result("unavailable");
  const sourceLanguage = detectChatSourceLanguage(input.text, input.sourceLanguage);
  if (!sourceLanguage) return result("source_required");
  if (sourceLanguage === input.targetLanguage) return result("same_language", sourceLanguage);
  const fetchImpl = options.fetch ?? fetch;
  const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  try {
    if (!await verifyFreePlan(config, fetchImpl, signal)) return result("disabled", sourceLanguage);
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${CHAT_TRANSLATION_MODEL}`, {
      method: "POST", headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
      cache: "no-store", redirect: "error", signal,
      body: JSON.stringify({ text: input.text, source_lang: getTranslationProviderLanguage(sourceLanguage), target_lang: getTranslationProviderLanguage(input.targetLanguage) }),
    });
    const body = await readJson(response);
    const errors = isRecord(body) && Array.isArray(body.errors) ? body.errors : [];
    if (response.status === 429) return result(errors.some((error) => isRecord(error) && error.code === 3036) ? "quota_exhausted" : "rate_limited", sourceLanguage);
    if (!response.ok || !isRecord(body) || body.success !== true || !isRecord(body.result) || !isChatTranslationText(body.result.translated_text)) return result("unavailable", sourceLanguage);
    const translated = input.targetLanguage === "zh-CN" ? simplifyChinese(body.result.translated_text) : body.result.translated_text;
    if (!isChatTranslationText(translated)) return result("unavailable", sourceLanguage);
    return result("translated", sourceLanguage, translated);
  } catch {
    // Do not return or log upstream text, credentials, headers or provider error messages.
    return result("unavailable", sourceLanguage);
  }
}
