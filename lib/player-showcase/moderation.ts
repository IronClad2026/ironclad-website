import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { mapShowcaseSaveReply, revalidateShowcase, showcaseFailure } from "./mutations";
import type { ActionResult } from "./types";
import { isShowcaseRevision, isShowcaseUuid } from "./validation";

async function moderatorId(): Promise<string | null> {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as { metadata?: { role?: string } } | null)?.metadata?.role;
  return userId && role === "admin" ? userId : null;
}

export type ShowcaseModerationRow = {
  playerId: string; currentThought: string | null; hidden: boolean; revision: number;
};

export async function getShowcaseForModeration(playerId: unknown): Promise<
  { status: "success"; row: ShowcaseModerationRow } | ActionResult
> {
  try {
    if (!await moderatorId()) return showcaseFailure("forbidden");
    if (!isShowcaseUuid(playerId)) return showcaseFailure("invalidPlayer");
    const client = createSupabaseAdminClient();
    const { data: player, error: playerError } = await client.from("players")
      .select("id").eq("id", playerId).is("account_closed_at", null).maybeSingle();
    if (playerError) return showcaseFailure("unavailable");
    if (!player) return showcaseFailure("profileRequired");
    const { data, error } = await client.from("player_showcases")
      .select("player_id, current_thought, thought_hidden_at, revision")
      .eq("player_id", playerId).maybeSingle();
    if (error) return showcaseFailure("unavailable");
    if (!data || !isShowcaseRevision(data.revision)) return showcaseFailure("profileRequired");
    return { status: "success", row: {
      playerId, currentThought: typeof data.current_thought === "string" ? data.current_thought : null,
      hidden: data.thought_hidden_at !== null, revision: data.revision,
    } };
  } catch {
    return showcaseFailure("unavailable");
  }
}

export async function moderatePlayerShowcase(input: unknown): Promise<ActionResult> {
  try {
    const actor = await moderatorId();
    if (!actor) return showcaseFailure("forbidden");
    if (!input || typeof input !== "object") return showcaseFailure("invalidPlayer");
    const record = input as Record<string, unknown>;
    if (!isShowcaseUuid(record.playerId)) return showcaseFailure("invalidPlayer");
    if (!isShowcaseRevision(record.revision) || typeof record.hidden !== "boolean") return showcaseFailure("conflict");
    const { data, error } = await createSupabaseAdminClient().rpc("moderate_player_showcase_thought", {
      p_player_id: record.playerId, p_hidden: record.hidden,
      p_actor_clerk_user_id: actor, p_expected_revision: record.revision,
    });
    if (error) return showcaseFailure("saveFailed");
    const result = mapShowcaseSaveReply(data, "moderationSaved");
    if (result.status === "success") revalidateShowcase(record.playerId);
    return result;
  } catch {
    return showcaseFailure("saveFailed");
  }
}
