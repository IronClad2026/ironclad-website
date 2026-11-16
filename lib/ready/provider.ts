import "server-only";

import { getReadyBudgetConfig, reserveReadyInference } from "./usage";
import type { ReadyIdentity } from "./usage";

// Neurons per million tokens, from the Cloudflare pricing table.
const models = {
  "@cf/ibm-granite/granite-4.0-h-micro": { input: 1_542, output: 10_158 },
  "@cf/google/gemma-4-26b-a4b-it": { input: 9_091, output: 27_273 },
} as const;
export type ReadyModel = keyof typeof models;
export type ReadyModelCard = { id: string; summary: string; detail?: string };
export type ReadyGrounding = { signals: string; cards: ReadyModelCard[]; previousTopic?: string };
type ModelStatus = "disabled" | "quota" | "budget-unavailable" | "provider-error" | "invalid" | "abstained";
type ModelTelemetry = {
  attempted: boolean;
  model?: ReadyModel;
  durationMs?: number;
  reservedNeurons?: number;
  inputTokens?: number;
  outputTokens?: number;
};
export type ReadyModelResult = ModelTelemetry & (
  | { status: "used"; card: string; detail: boolean }
  | { status: ModelStatus }
);
export type ReadyAiEvidence = ModelTelemetry & { status: ReadyModelResult["status"] };

export function isReadyModel(value: string | undefined | null): value is ReadyModel {
  return typeof value === "string" && Object.hasOwn(models, value);
}

export function configuredReadyModel(evaluation?: string | null): ReadyModel | null {
  const model = evaluation && process.env.READY_CF_ALLOW_EVALUATION === "true"
    ? evaluation : process.env.READY_CF_AI_MODEL;
  return isReadyModel(model) ? model : null;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : undefined;
}

function parseChoice(value: unknown, cards: ReadyModelCard[]) {
  if (typeof value !== "string" || value.length > 256) return null;
  try {
    const parsed: unknown = JSON.parse(value.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi, ""));
    if (!parsed || typeof parsed !== "object" || !("card" in parsed) || !("detail" in parsed) ||
      Object.keys(parsed).length !== 2 || typeof parsed.detail !== "boolean") return null;
    if (parsed.card === null && !parsed.detail) return { card: null, detail: false };
    const card = cards.find((item) => item.id === parsed.card);
    return card && (!parsed.detail || card.detail) ? { card: card.id, detail: parsed.detail } : null;
  } catch {
    return null;
  }
}

export async function answerWithReadyModel(
  grounding: ReadyGrounding,
  identity: ReadyIdentity,
  model: ReadyModel | null,
  signal: AbortSignal,
): Promise<ReadyModelResult> {
  const { READY_WORKERS_FREE_PLAN_CONFIRMED, READY_CF_ACCOUNT_ID, READY_CF_AI_TOKEN } = process.env;
  const budgetConfig = getReadyBudgetConfig();
  if (READY_WORKERS_FREE_PLAN_CONFIRMED !== "true" || !READY_CF_ACCOUNT_ID ||
    !/^[a-f0-9]{32}$/.test(READY_CF_ACCOUNT_ID) || !READY_CF_AI_TOKEN || !budgetConfig ||
    !model || signal.aborted || !grounding.cards.length) return { status: "disabled", attempted: false };

  const instruction = "You select the IronClad rule passage that answers the question. " +
    'Return only JSON {"card":"<id>","detail":false}. Set detail true when the question needs the optional detail. ' +
    'If the approved passages do not answer it, return {"card":null,"detail":false}. ' +
    "Never assert an exception or decide the outcome of an individual match.";
  const maxOutputTokens = 48;
  const input = JSON.stringify({
    messages: [{ role: "system", content: instruction }, { role: "user", content: JSON.stringify(grounding) }],
    ...(model === "@cf/google/gemma-4-26b-a4b-it"
      ? { max_completion_tokens: maxOutputTokens }
      : { max_tokens: maxOutputTokens }),
    temperature: 0,
  });
  if (Buffer.byteLength(input) > 3_200) return { status: "invalid", attempted: false };
  const pricing = models[model];
  // A byte-count upper bound, chat-template overhead and headroom. Never refund a dispatched attempt.
  const neurons = Math.ceil(((Buffer.byteLength(input) + 256) * pricing.input + maxOutputTokens * pricing.output) / 1_000_000) + 3;
  const budget = await reserveReadyInference(budgetConfig, identity, READY_CF_ACCOUNT_ID, neurons, signal);
  if (budget !== "reserved") return { status: budget === "quota" ? "quota" : "budget-unavailable", attempted: false };
  if (signal.aborted) return { status: "disabled", attempted: false };

  const started = performance.now();
  let result: ReadyModelResult = { status: "provider-error", attempted: true, model, reservedNeurons: neurons };
  try {
    const providerResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${READY_CF_ACCOUNT_ID}/ai/run/${model}`, {
      method: "POST",
      headers: { authorization: `Bearer ${READY_CF_AI_TOKEN}`, "content-type": "application/json" },
      body: input,
      signal: AbortSignal.any([signal, AbortSignal.timeout(3_500)]),
      redirect: "error",
      cache: "no-store",
    });
    if (providerResponse.ok) {
      const { result: payload, success } = await providerResponse.json() as {
        success?: boolean;
        result?: {
          response?: unknown;
          choices?: { message?: { content?: unknown } }[];
          usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
        };
      };
      const content = payload?.response ?? payload?.choices?.[0]?.message?.content;
      const choice = success ? parseChoice(content, grounding.cards) : null;
      const telemetry = { ...result, inputTokens: count(payload?.usage?.prompt_tokens), outputTokens: count(payload?.usage?.completion_tokens) };
      result = !choice ? { ...telemetry, status: "invalid" }
        : choice.card === null ? { ...telemetry, status: "abstained" }
        : { ...telemetry, status: "used", card: choice.card, detail: choice.detail };
    }
  } catch {
    // A reserved attempt may have reached the provider even if the response timed out.
  }
  result.durationMs = Math.round(performance.now() - started);
  console.info("[ready inference]", readyAiEvidence(result));
  return result;
}

export function readyAiEvidence(result: ReadyModelResult): ReadyAiEvidence {
  const { status, attempted, model, durationMs, reservedNeurons, inputTokens, outputTokens } = result;
  return { status, attempted, model, durationMs, reservedNeurons, inputTokens, outputTokens };
}
