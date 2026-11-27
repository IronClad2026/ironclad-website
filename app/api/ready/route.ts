import { NextResponse } from "next/server";
import { loadAccountLegalGateState } from "@/lib/account-legal-acceptance";
import { resolveReadyAnswer } from "@/lib/ready/answer";
import { readyLink } from "@/lib/ready/catalogue";
import { readReadyRequest, READY_BODY_LIMIT } from "@/lib/ready/contracts";
import type { ReadyReply } from "@/lib/ready/contracts";
import { isReadyEnabled } from "@/lib/ready/review-access";
import { loadReadyAccess } from "@/lib/ready/session";
import { allowReadyGuestRequest, allowReadyRequest } from "@/lib/ready/usage";

export const runtime = "nodejs";
export const maxDuration = 15;

const publicRules = readyLink("rules-hub", "Open rules hub", "/rules");

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
  const send = (body: ReadyReply, status = 200) => {
    const headers = {
      "Cache-Control": "private, no-store",
      "Server-Timing": `ready;dur=${Math.round(performance.now() - started)}`,
      "X-Ready-AI-Status": "not-attempted",
      "X-Ready-AI-Attempted": "0",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    };
    return NextResponse.json(body, { status, headers });
  };
  if (!isReadyEnabled()) return send({ text: "Ready is unavailable.", actions: [publicRules] }, 404);
  if (request.headers.get("origin") !== new URL(request.url).origin) return send({ text: "Open Ready from IronClad and try again." }, 403);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
  try {
    return await withDeadline(async () => {
      const access = await loadReadyAccess();
      signal.throwIfAborted();
      if (access.kind === "restricted") return send({ text: "This account can’t use Ready at the moment.", actions: [publicRules] }, 403);
      const viewer = access.kind === "signed-in" ? access.identity : null;
      const allowed = viewer ? allowReadyRequest(viewer) : allowReadyGuestRequest(request.headers);
      if (!allowed) return send({ text: "Stand by a minute before making another selection, Commander.", actions: [publicRules] }, 429);
      const input = readReadyRequest(await readSmallBody(request, signal));
      if (!input) return send({ text: "Choose a question or action from Ready’s menu, Commander." }, 400);
      if (viewer) {
        const legal = await loadAccountLegalGateState();
        signal.throwIfAborted();
        if (legal.status !== "satisfied") return send({ text: "Complete your account requirements before using Ready.", actions: [publicRules] }, 403);
      }
      return send(await resolveReadyAnswer(input, viewer, signal));
    }, signal);
  } catch {
    return send({
      text: "I couldn’t verify an answer right now, Commander. Try again in a moment.",
      actions: [publicRules, readyLink("find-tournament", "Open Tournaments", "/tournaments")],
      fallback: true,
    }, 503);
  }
}
