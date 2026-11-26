import { hasAnnouncementDocumentText } from "@/lib/announcement-document";
import { parseCasterDraft } from "@/lib/caster/application-validation";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import type { CasterWorkingResult } from "@/lib/caster/publication";
import { CASTER_PRIVATE_HEADERS, casterRpc, isCasterPostOrigin, loadCurrentCasterAccount, readSmallCasterBody } from "@/lib/caster/server";

function reply(result: CasterWorkingResult, status: number) {
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

  let payload: { action?: unknown; draft?: unknown; version?: unknown; showCountry?: unknown };
  try {
    payload = JSON.parse(await readSmallCasterBody(request, 96 * 1024) ?? "null");
  } catch {
    return reply({ status: "invalid" }, 400);
  }
  if (!payload || typeof payload.version !== "number" || !Number.isSafeInteger(payload.version) ||
    payload.version < 0 || payload.version > 2_147_483_647) return reply({ status: "invalid" }, 400);

  const args = { p_actor: account.id, p_version: payload.version };
  let result: CasterWorkingResult | null;
  if (payload.action === "save") {
    const draft = parseCasterDraft(payload.draft);
    if (!draft || typeof payload.showCountry !== "boolean") return reply({ status: "invalid" }, 400);
    result = await casterRpc<CasterWorkingResult>("caster_phase3_save", { ...args, p_draft: draft, p_show_country: payload.showCountry });
  } else if (payload.action === "publish") {
    const current = await casterRpc<CasterWorkingResult>("caster_phase3_owner", { p_actor: account.id });
    if (!current) return reply({ status: "unavailable" }, 503);
    if (!current.profile) return reply({ status: current.status }, 403);
    if (current.profile.membership_status !== "active") return reply({ status: "locked" }, 403);
    if (current.profile.hidden) return reply({ status: "hidden" }, 409);
    if (current.profile.version !== payload.version) return reply({ status: "conflict" }, 409);
    const draft = parseCasterDraft(current.profile.draft);
    if (!draft?.displayName || !draft.languages.length || !draft.avatar || !draft.bio || !hasAnnouncementDocumentText(draft.bio) ||
      (current.profile.show_country && !draft.country)) return reply({ status: "incomplete" }, 422);
    result = await casterRpc<CasterWorkingResult>("caster_phase3_publish", args);
  } else {
    return reply({ status: "invalid" }, 400);
  }

  if (!result) return reply({ status: "unavailable" }, 503);
  if (result.status === "ok") return reply(result, 200);
  const status = result.status === "conflict" || result.status === "hidden" ? 409
    : result.status === "legal_unavailable" ? 503 : result.status === "incomplete" || result.status === "invalid" ? 422 : 403;
  return reply({ status: result.status }, status);
}
