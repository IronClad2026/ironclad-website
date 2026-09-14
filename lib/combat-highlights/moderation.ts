import "server-only";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isShowcaseUuid } from "@/lib/player-showcase/validation";
import { mediaConfiguration } from "./config";
import { record, revision, slotNumber } from "./read";
import { drainHighlightCleanup } from "./cleanup";
import { failure, parseHighlightReply } from "./mutations";

export async function highlightModerator() {
  const { userId, sessionClaims } = await auth();
  return userId && (sessionClaims as { metadata?: { role?: string } } | null)?.metadata?.role === "admin" ? userId : null;
}
export type HighlightModerationRow = { playerId: string; slotNumber: number; revision: number; hidden: boolean; title: string; uploadId: string | null; reportCount: number };
export async function getHighlightsForModeration(playerId: unknown): Promise<HighlightModerationRow[]> {
  if (!await highlightModerator() || !mediaConfiguration() || (playerId !== undefined && !isShowcaseUuid(playerId))) return [];
  const { data, error } = await createSupabaseAdminClient().rpc("get_player_combat_highlights_for_moderation", { p_player_id: playerId ?? null });
  if (error || !Array.isArray(data)) return [];
  return data.slice(0, 50).flatMap((value) => {
    const row = record(value);
    if (!row || !isShowcaseUuid(row.playerId) || !slotNumber(row.slotNumber) || !revision(row.revision) || typeof row.hidden !== "boolean" || typeof row.title !== "string" || row.title.length > 64 || !revision(row.reportCount) || (row.uploadId !== null && !isShowcaseUuid(row.uploadId))) return [];
    return [{ playerId: row.playerId, slotNumber: row.slotNumber, revision: row.revision, hidden: row.hidden, title: row.title, uploadId: row.uploadId as string | null, reportCount: row.reportCount }];
  });
}
export async function moderateCombatHighlight(input: unknown) {
  try {
    const actor = await highlightModerator();
    if (!actor || !mediaConfiguration()) return failure("forbidden");
    const row = record(input);
    if (!row || !isShowcaseUuid(row.playerId) || !slotNumber(row.slotNumber) || !revision(row.revision) || typeof row.hidden !== "boolean") return failure("invalid-input");
    const { data, error } = await createSupabaseAdminClient().rpc("moderate_player_combat_highlight", { p_player_id: row.playerId, p_slot_number: row.slotNumber, p_expected_revision: row.revision, p_hidden: row.hidden, p_actor_clerk_user_id: actor });
    if (error) return failure();
    const result = parseHighlightReply(data);
    if (result.ok) { revalidatePath("/admin/combat-highlights"); revalidatePath("/players/" + row.playerId); revalidatePath("/dashboard/showcase"); }
    return result;
  } catch { return failure(); }
}
export async function retryHighlightCleanup() {
  try { if (!await highlightModerator() || !mediaConfiguration()) return failure("forbidden"); await drainHighlightCleanup(10); revalidatePath("/admin/combat-highlights"); return { ok: true, code: "saved" }; }
  catch { return failure(); }
}
