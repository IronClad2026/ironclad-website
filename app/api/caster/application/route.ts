import { type CasterApplicationResult } from "@/lib/caster/application";
import { isCompleteCasterDraft, parseCasterDraft } from "@/lib/caster/application-validation";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { CASTER_PRIVATE_HEADERS, casterRpc, isCasterPostOrigin, loadCurrentCasterAccount, readSmallCasterBody } from "@/lib/caster/server";

function reply(result: CasterApplicationResult, status: number) {
  return Response.json(result, { status, headers: CASTER_PRIVATE_HEADERS });
}

export async function POST(request: Request) {
  if (!isCasterProgramEnabled()) return reply({ status: "not_found" }, 404);
  if (!isCasterPostOrigin(request) || !/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return reply({ status: "invalid" }, 403);
  }

  const account = await loadCurrentCasterAccount();
  if (account.status === "signed_out") return reply({ status: "signed_out" }, 401);
  if (account.status === "unavailable") return reply({ status: "unavailable" }, 503);
  if (account.status !== "open" || !account.emailVerified) return reply({ status: "closed" }, 403);

  let payload: { action?: unknown; draft?: unknown; version?: unknown };
  try {
    const raw = await readSmallCasterBody(request, 96 * 1024);
    payload = JSON.parse(raw ?? "null");
  } catch {
    return reply({ status: "invalid" }, 400);
  }
  if (!payload || !Number.isSafeInteger(payload.version) || Number(payload.version) < 0 || Number(payload.version) > 2_147_483_647) {
    return reply({ status: "invalid" }, 400);
  }

  const args = { p_actor: account.id, p_expected_version: payload.version };
  let result: CasterApplicationResult | null;
  if (payload.action === "save") {
    const draft = parseCasterDraft(payload.draft);
    if (!draft) return reply({ status: "invalid" }, 400);
    result = await casterRpc<CasterApplicationResult>("caster_phase2_save", { ...args, p_draft: draft });
  } else if (payload.action === "submit") {
    const current = await casterRpc<CasterApplicationResult>("caster_phase2_get", { p_actor: account.id });
    if (!current) return reply({ status: "unavailable" }, 503);
    if (!current.application) return reply({ status: current.status }, 403);
    if (current.application.draft_version !== payload.version) return reply({ status: "conflict" }, 409);
    const draft = parseCasterDraft(current.application.draft);
    if (!draft || !isCompleteCasterDraft(draft)) return reply({ status: "incomplete" }, 422);
    result = await casterRpc<CasterApplicationResult>("caster_phase2_submit", args);
  } else {
    return reply({ status: "invalid" }, 400);
  }

  if (!result) return reply({ status: "unavailable" }, 503);
  if (result.status === "ok") return reply(result, 200);
  const status = result.status === "conflict" || result.status === "locked" ? 409
    : result.status === "legal_unavailable" ? 503 : result.status === "incomplete" || result.status === "invalid" ? 422 : 403;
  return reply({ status: result.status }, status);
}
