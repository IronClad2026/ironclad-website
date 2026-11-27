import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { loadAccountLegalGateState } from "@/lib/account-legal-acceptance";
import { READY_CATALOGUE_VERSION, READY_MENU_VERSION } from "@/lib/ready/catalogue";
import { IRONCLAD_PRODUCTION_ORIGIN } from "@/lib/ironclad-release-environment";
import { isReadyEngagementEnabled, isReadyProductionEnabled } from "@/lib/ready/review-access";
import { loadReadyAccess } from "@/lib/ready/session";
import { readReadySuggestion } from "@/lib/ready/suggestion-contract";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 15;

// A 500-character description can take 3,000 bytes in JSON escape form.
const bodyLimit = 4_096;

function send(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...(status === 429 ? { "Retry-After": "3600" } : {}),
    },
  });
}

async function readInput(request: Request) {
  if (!request.body || Number(request.headers.get("content-length")) > bodyLimit ||
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return null;

  const reader = request.body.getReader();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(3_000)]);
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  const buffer = new Uint8Array(bodyLimit);
  let used = 0;

  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) return readReadySuggestion(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, used))));
      if (used + value.length > bodyLimit) {
        cancel();
        return null;
      }
      buffer.set(value, used);
      used += value.length;
    }
  } catch {
    return null;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function rateMaterial(request: Request, userId?: string) {
  // Only the verified Vercel ingress supplies this header.
  // Never use a client-supplied forwarding chain or persist an address.
  const address = request.headers.get("x-vercel-forwarded-for")?.trim() ?? "";
  const actor = userId ? `account:${userId}` : `guest:${isIP(address) ? address : "unknown"}`;
  return "ready-topic-suggestion:v1:" + actor;
}

export async function POST(request: Request) {
  if (!isReadyEngagementEnabled()) return send({ error: "unavailable" }, 404);
  const production = isReadyProductionEnabled();
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin || (production && origin !== IRONCLAD_PRODUCTION_ORIGIN)) {
    return send({ error: "forbidden" }, 403);
  }
  const input = await readInput(request);
  if (!input) return send({ error: "invalid" }, 400);

  try {
    const access = await loadReadyAccess();
    if (access.kind === "restricted") return send({ error: "forbidden" }, 403);

    const database = createSupabaseAdminClient();
    const userId = access.kind === "signed-in" ? access.identity.userId : undefined;
    if (userId) {
      const [legal, account] = await Promise.all([
        loadAccountLegalGateState(),
        database.from("players").select("account_closed_at").eq("clerk_user_id", userId)
          .abortSignal(AbortSignal.timeout(4_000)).maybeSingle(),
      ]);
      if (legal.status === "unavailable" || account.error) return send({ error: "unavailable" }, 503);
      if (legal.status !== "satisfied" || account.data?.account_closed_at) return send({ error: "forbidden" }, 403);
      if (production) {
        const open = await database.rpc("caster_phase1_account_open", { p_actor: userId }).abortSignal(AbortSignal.timeout(4_000));
        if (open.error) return send({ error: "unavailable" }, 503);
        if (open.data !== true) return send({ error: "forbidden" }, 403);
      }
    }

    const fields = {
      p_id: input.submissionId,
      p_description: input.description,
      p_category: input.categoryId,
      p_menu: READY_MENU_VERSION,
      p_catalogue: READY_CATALOGUE_VERSION,
    };
    const material = rateMaterial(request, userId);
    const secret = process.env.READY_USAGE_HMAC_KEY;
    if (!production && (!secret || secret.length < 32)) return send({ error: "unavailable" }, 503);
    const operation = production
      ? database.rpc("submit_ready_topic_suggestion_with_private_quota", {
        ...fields, p_rate_source: createHash("sha256").update(material).digest("hex"),
      })
      : database.rpc("submit_ready_topic_suggestion", {
        ...fields, p_rate_key: createHmac("sha256", secret!).update(material).digest("hex"),
      });
    const { data, error } = await operation.abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(4_000)]));

    if (error) return send({ error: "unavailable" }, 503);
    if (data === "stored" || data === "duplicate") return send({ saved: true });
    if (data === "conflict") return send({ error: "conflict" }, 409);
    if (data === "rate_limited") return send({ error: "rate_limited" }, 429);
    if (data === "invalid") return send({ error: "invalid" }, 400);
    return send({ error: "unavailable" }, 503);
  } catch {
    return send({ error: "unavailable" }, 503);
  }
}
