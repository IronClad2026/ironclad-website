import { NextResponse } from "next/server";
import { loadAccountLegalGateState } from "@/lib/account-legal-acceptance";
import { resolveReadyAnswer } from "@/lib/ready/answer";
import { readReadyRequest, READY_BODY_LIMIT } from "@/lib/ready/contracts";
import type { ReadyResolvedReply } from "@/lib/ready/answer";
import { readyReviewAliases } from "@/lib/ready/review-access";
import { loadReadySession } from "@/lib/ready/session";
import { allowReadyRequest } from "@/lib/ready/usage";

export const runtime = "nodejs";
export const maxDuration = 15;

const publicRules = { label: "Open rules hub", href: "/rules" };

async function readSmallBody(request: Request, signal: AbortSignal): Promise<unknown> {
  if (!request.body || Number(request.headers.get("content-length")) > READY_BODY_LIMIT) return null;
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return null;
  const reader = request.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  const buffer = new Uint8Array(READY_BODY_LIMIT);
  let length = 0;
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length)));
      if (length + value.length > READY_BODY_LIMIT) {
        cancel();
        return null;
      }
      buffer.set(value, length);
      length += value.length;
    }
  } catch {
    return null;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

async function withDeadline<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let cancel: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([task(), interrupted]);
  } finally {
    if (cancel) signal.removeEventListener("abort", cancel);
  }
}

export async function POST(request: Request) {
  const started = performance.now();
  const send = ({ ai, ...body }: ReadyResolvedReply, status = 200) => {
    const timing = [`ready;dur=${Math.round(performance.now() - started)}`];
    if (ai?.durationMs !== undefined) timing.push(`ready-ai;dur=${ai.durationMs}`);
    const headers = {
      "Cache-Control": "private, no-store",
      "Server-Timing": timing.join(", "),
      "X-Ready-AI-Status": ai?.status ?? "not-attempted",
      "X-Ready-AI-Attempted": ai?.attempted ? "1" : "0",
      ...(ai?.model ? { "X-Ready-AI-Model": ai.model } : {}),
      ...(ai?.inputTokens !== undefined ? { "X-Ready-AI-Input-Tokens": String(ai.inputTokens) } : {}),
      ...(ai?.outputTokens !== undefined ? { "X-Ready-AI-Output-Tokens": String(ai.outputTokens) } : {}),
      ...(ai?.reservedNeurons !== undefined ? { "X-Ready-AI-Reserved-Neurons": String(ai.reservedNeurons) } : {}),
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    };
    return NextResponse.json(body, { status, headers });
  };
  if (readyReviewAliases(process.env).length === 0) return send({ text: "Ready is unavailable.", actions: [publicRules] }, 404);
  if (request.headers.get("origin") !== new URL(request.url).origin) return send({ text: "Open Ready from IronClad and try again." }, 403);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
  try {
    return await withDeadline(async () => {
      const viewer = await loadReadySession();
      signal.throwIfAborted();
      if (!viewer) return send({ text: "Sign in with an authorised Staging review account to use Ready.", actions: [publicRules] }, 403);
      if (!allowReadyRequest(viewer)) return send({ text: "Stand by a minute before asking again, Commander.", actions: [publicRules] }, 429);
      const input = readReadyRequest(await readSmallBody(request, signal));
      if (!input) return send({ text: "Enter a question of up to 300 characters, Commander." }, 400);
      const legal = await loadAccountLegalGateState();
      signal.throwIfAborted();
      if (legal.status !== "satisfied") return send({ text: "Complete your account requirements before using Ready.", actions: [publicRules] }, 403);
      return send(await resolveReadyAnswer(input, viewer, signal, request.headers.get("x-ready-evaluation-model")));
    }, signal);
  } catch {
    return send({
      text: "I couldn’t verify an answer right now, Commander. Try again in a moment.",
      actions: [publicRules, { label: "Open Tournaments", href: "/tournaments" }],
    }, 503);
  }
}
