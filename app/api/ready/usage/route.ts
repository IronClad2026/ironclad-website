import { NextResponse } from "next/server";
import { loadAccountLegalGateState } from "@/lib/account-legal-acceptance";
import { READY_CATALOGUE_VERSION, READY_MENU_VERSION, readyActionCatalogue } from "@/lib/ready/catalogue";
import { loadReadyActiveProfile } from "@/lib/ready/platform-data";
import { loadReadySession } from "@/lib/ready/session";
import { isReadyUsageUuid, readReadyUsageRequest } from "@/lib/ready/usage-events";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
const bodyLimit = 640;

function send(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function usagePlayer() {
  const viewer = await loadReadySession();
  if (!viewer) return null;
  const [legal, player] = await Promise.all([
    loadAccountLegalGateState(), loadReadyActiveProfile(viewer.userId),
  ]);
  return legal.status === "satisfied" ? player?.id ?? null : null;
}

async function readInput(request: Request) {
  if (!request.body || Number(request.headers.get("content-length")) > bodyLimit ||
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return null;
  const reader = request.body.getReader();
  try {
    const buffer = new Uint8Array(bodyLimit);
    let used = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return readReadyUsageRequest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, used))));
      if (used + value.length > bodyLimit) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      buffer.set(value, used);
      used += value.length;
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function choiceResponse(data: unknown) {
  if (!data || typeof data !== "object" || !("enabled" in data) || typeof data.enabled !== "boolean") {
    return send({ error: "unavailable" }, 503);
  }
  if (!data.enabled) return send({ enabled: false, epoch: null });
  return "epoch" in data && isReadyUsageUuid(data.epoch)
    ? send({ enabled: true, epoch: data.epoch }) : send({ error: "unavailable" }, 503);
}

export async function GET() {
  try {
    const player = await usagePlayer();
    if (!player) return send({ error: "forbidden" }, 403);
    const { data, error } = await createSupabaseAdminClient().rpc("get_ready_usage_choice", { p_player: player })
      .abortSignal(AbortSignal.timeout(3_000));
    return error ? send({ error: "unavailable" }, 503) : choiceResponse(data);
  } catch {
    return send({ error: "unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return send({ error: "forbidden" }, 403);
  const input = await readInput(request);
  if (!input) return send({ error: "invalid" }, 400);
  try {
    const player = await usagePlayer();
    if (!player) return send({ error: "forbidden" }, 403);
    const database = createSupabaseAdminClient();
    if (input.kind === "choice") {
      const { data, error } = await database.rpc("set_ready_usage_choice", { p_player: player, p_enabled: input.enabled })
        .abortSignal(AbortSignal.timeout(3_000));
      return error ? send({ error: "unavailable" }, 503) : choiceResponse(data);
    }
    const event = input.event;
    const action = "actionId" in event ? event.actionId : null;
    const { data, error } = await database.rpc("record_ready_usage_event", {
      p_player: player,
      p_epoch: input.epoch,
      p_browser: input.browserId,
      p_event: input.eventId,
      p_type: event.type,
      p_category: "categoryId" in event ? event.categoryId ?? null : null,
      p_question: "questionId" in event ? event.questionId ?? null : null,
      p_action: action,
      p_destination: action ? readyActionCatalogue[action].destinationType : null,
      p_outcome: "outcome" in event ? event.outcome : null,
      p_helpful: "helpful" in event ? event.helpful : null,
      p_answer: "answerInstanceId" in event ? event.answerInstanceId : null,
      p_menu: READY_MENU_VERSION,
      p_catalogue: READY_CATALOGUE_VERSION,
    }).abortSignal(AbortSignal.timeout(3_000));
    if (error) return send({ error: "unavailable" }, 503);
    if (data === "off") return send({ error: "off" }, 403);
    if (data === "rate_limited") return send({ error: "rate_limited" }, 429);
    if (data !== "stored" && data !== "duplicate") return send({ error: "invalid" }, 400);
    return send({ accepted: true });
  } catch {
    return send({ error: "unavailable" }, 503);
  }
}
