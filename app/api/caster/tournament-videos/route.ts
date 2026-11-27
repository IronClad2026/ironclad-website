import { revalidatePath } from "next/cache";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { CASTER_PRIVATE_HEADERS, casterRpc, isCasterPostOrigin, loadCurrentCasterAccount, readSmallCasterBody } from "@/lib/caster/server";
import { parseCasterTournamentContexts, parseCasterTournamentVideo, parseCasterTournamentVideoAction } from "@/lib/caster/tournament-video";

function reply(status: string, code: number, body: Record<string, unknown> = {}) {
  return Response.json({ status, ...body }, { status: code, headers: CASTER_PRIVATE_HEADERS });
}

export async function POST(request: Request) {
  if (!isCasterProgramEnabled()) return reply("not_found", 404);
  if (!isCasterPostOrigin(request) || !/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return reply("invalid", 403);
  }
  const account = await loadCurrentCasterAccount();
  if (account.status === "signed_out") return reply("signed_out", 401);
  if (account.status === "unavailable") return reply("unavailable", 503);
  if (account.status !== "open" || !account.emailVerified) return reply("closed", 403);
  try {
    await requireCurrentAccountLegalAcceptance();
  } catch {
    return reply("legal_required", 403);
  }

  let body: unknown;
  try {
    body = JSON.parse(await readSmallCasterBody(request, 8192) ?? "null");
  } catch {
    return reply("invalid", 400);
  }
  const action = parseCasterTournamentVideoAction(body);
  if (!action) return reply("invalid", 400);
  if (action.action === "contexts") {
    const result = await casterRpc<{ status: string }>("caster_media_contexts", { p_actor: account.id, p_tournament_id: action.tournamentId });
    const context = result?.status === "ok" ? parseCasterTournamentContexts(result) : null;
    if (context) return reply("ok", 200, context);
    return result?.status === "target_unavailable" ? reply("target_unavailable", 404) : reply("unavailable", result ? 403 : 503);
  }

  const details = action.action === "save" ? action : null;
  const result = await casterRpc<{ status: string; media?: unknown }>("caster_media_save", {
    p_actor: account.id, p_media_id: action.mediaId, p_expected_version: action.version, p_action: action.action,
    p_tournament_id: details?.tournamentId ?? null, p_division_id: details?.divisionId ?? null, p_match_id: details?.matchId ?? null,
    p_title: details?.title ?? null, p_url: details?.url ?? null, p_description: details?.description ?? null,
  });
  if (!result) return reply("unavailable", 503);
  const media = result.status === "ok" ? parseCasterTournamentVideo(result.media) : null;
  if (media) {
    revalidatePath("/caster-studio");
    revalidatePath("/casters/[slug]", "page");
    revalidatePath("/tournaments");
    return reply("ok", 200, { media });
  }
  const status = ["duplicate", "conflict", "moderated"].includes(result.status) ? 409
    : ["invalid", "target_unavailable", "profile_required"].includes(result.status) ? 422
    : ["ok", "unavailable", "legal_unavailable"].includes(result.status) ? 503 : 403;
  return reply(result.status === "ok" ? "unavailable" : result.status, status);
}
