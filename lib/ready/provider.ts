import "server-only";

import { getReadyBudgetConfig, reserveReadyInference } from "./usage";
import type { ReadyIdentity } from "./usage";

export const READY_MODEL = "@cf/meta/llama-3.2-1b-instruct";
const maxOutputTokens = 24;
// The literal vocabulary is the entire user-derived content sent to Cloudflare.
const publicTerms = new Set(("age appeal agreement best bracket cancelled championship " +
  "check code contact corrupt crash deadline defeat disconnect dispute eligibility eligible entry extension " +
  "final format group invite late lobby loss map match maps medal opponent participation payout penalty " +
  "phone placement points prize profile proceed proof qualifying quarter ready referee register registration " +
  "rematch replay replays report reporting reschedule resolve result rules schedule semifinal series settings " +
  "signup spectator stage steam submit support teams time tie tournament upload version veto waiver win withdrawal").split(" "));

export function publicTopicSignal(question: string): string | null {
  const words = question.toLowerCase().match(/[a-z]+/g) ?? [];
  if (/\b(?:my|mine|our|password|secret|token|key|ignore|override|private|email)\b/i.test(question)) return null;
  const terms = words.filter((value) => publicTerms.has(value)).slice(0, 16);
  return terms.length >= 2 ? terms.join(" ") : null;
}

export async function classifyReadyPublicTopic(
  question: string,
  topics: readonly string[],
  identity: ReadyIdentity,
  signal: AbortSignal,
): Promise<string | null> {
  const { READY_WORKERS_FREE_PLAN_CONFIRMED, READY_CF_ACCOUNT_ID, READY_CF_AI_TOKEN } = process.env;
  const config = getReadyBudgetConfig();
  if (READY_WORKERS_FREE_PLAN_CONFIRMED !== "true" || !READY_CF_ACCOUNT_ID ||
    !/^[a-f0-9]{32}$/.test(READY_CF_ACCOUNT_ID) || !READY_CF_AI_TOKEN || !config || signal.aborted) return null;
  const summary = publicTopicSignal(question);
  if (!summary) return null;
  const content = "Choose exactly one matching IronClad public help topic or none. Return only the topic code. " +
    `Topic codes: ${topics.join(", ")}. Use none if uncertain.`;
  const input = JSON.stringify({
    messages: [{ role: "system", content }, { role: "user", content: summary }],
    max_tokens: maxOutputTokens, temperature: 0,
  });
  if (Buffer.byteLength(input) > 1_300) return null;
  // Conservative bound: at most one input token per byte, template overhead and rounded neuron headroom.
  const neurons = Math.ceil((Buffer.byteLength(input) + 160) * 0.002457 + maxOutputTokens * 0.018252) + 2;
  const started = performance.now();
  const budget = await reserveReadyInference(config, identity, READY_CF_ACCOUNT_ID, neurons, signal);
  if (budget !== "reserved" || signal.aborted) return null;
  let outcome: "classified" | "invalid" | "unavailable" = "unavailable";
  try {
    const providerResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${READY_CF_ACCOUNT_ID}/ai/run/${READY_MODEL}`, {
      method: "POST",
      headers: { authorization: `Bearer ${READY_CF_AI_TOKEN}`, "content-type": "application/json" },
      body: input,
      signal: AbortSignal.any([signal, AbortSignal.timeout(2_500)]),
      redirect: "error",
      cache: "no-store",
    });
    if (!providerResponse.ok) return null;
    const { result, success } = await providerResponse.json() as { success?: boolean; result?: { response?: unknown } };
    const selected = typeof result?.response === "string" ? result.response.trim() : "";
    if (!success || !topics.includes(selected)) {
      outcome = "invalid";
      return null;
    }
    outcome = "classified";
    return selected;
  } catch {
    return null;
  } finally {
    console.info("[ready inference]", { outcome, durationMs: Math.round(performance.now() - started), neuronsReserved: neurons });
  }
}
