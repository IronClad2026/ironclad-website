"use server";

import { revalidatePath } from "next/cache";
import { casterRpc } from "@/lib/caster/server";
import { parseCasterTournamentContexts } from "@/lib/caster/tournament-video";
import { isUuid } from "@/lib/tournament-media";
import { currentCastingAdmin } from "../coverage/data";
import type { CasterAdminResult } from "../admin-application-contracts";

const denied: CasterAdminResult = { kind: "error", message: "Your current session cannot moderate caster tournament videos." };

export async function loadModerationVideoContexts(tournamentId: string) {
  const actor = await currentCastingAdmin();
  if (!actor || !isUuid(tournamentId)) return null;
  const result = await casterRpc<{ status: string }>("caster_media_admin_contexts", { p_actor: actor, p_tournament_id: tournamentId });
  return result?.status === "ok" ? parseCasterTournamentContexts(result) : null;
}

export async function moderateCasterTournamentVideo(_previous: CasterAdminResult, form: FormData): Promise<CasterAdminResult> {
  const actor = await currentCastingAdmin();
  if (!actor) return denied;
  const id = form.get("id");
  const version = Number(form.get("version"));
  const action = form.get("action");
  const reason = form.get("reason");
  const target = form.get("tournament");
  const division = form.get("division");
  const match = form.get("match");
  if (!isUuid(id) || !Number.isInteger(version) || version < 1 || version > 2_147_483_647 ||
      (action !== "correct" && action !== "hide" && action !== "remove") || typeof reason !== "string" ||
      !reason.trim() || reason.length > 2000 || form.get("confirm") !== "yes" ||
      (action === "correct" && (!isUuid(target) || (Boolean(division) && !isUuid(division)) || (Boolean(match) && (!isUuid(match) || !isUuid(division)))))) {
    return { kind: "error", message: "Review the action, competition scope and reason, then confirm." };
  }
  const result = await casterRpc<{ status: string }>("caster_media_admin_moderate", {
    p_actor: actor, p_media_id: id, p_expected_version: version, p_action: action, p_reason: reason.trim(),
    p_tournament_id: action === "correct" ? target : null, p_division_id: action === "correct" && division ? division : null,
    p_match_id: action === "correct" && match ? match : null,
  });
  if (result?.status !== "ok") return { kind: "error", message: "The entry changed or the decision is unavailable. Refresh and review the current state." };
  revalidatePath("/admin/casters/tournament-videos");
  revalidatePath("/caster-studio");
  revalidatePath("/casters/[slug]", "page");
  revalidatePath("/tournaments");
  return { kind: "ok", message: "Moderation decision recorded." };
}
