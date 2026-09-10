import "server-only";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";
import { canonicalShowcaseSlug } from "./read";
import type { ActionResult, ShowcaseMessageCode } from "./types";
import { isShowcaseRevision, isShowcaseUuid, validateCurrentThought } from "./validation";

export function showcaseFailure(code: ShowcaseMessageCode): ActionResult {
  return { status: "error", code };
}

export function mapShowcaseSaveReply(data: unknown, success: ShowcaseMessageCode): ActionResult {
  if (!data || typeof data !== "object" || !("code" in data)) return showcaseFailure("saveFailed");
  const codes: Record<string, ShowcaseMessageCode> = {
    conflict: "conflict", "feature-disabled": "unavailable", "profile-required": "profileRequired",
    "legal-required": "legalRequired", "invalid-thought": "thoughtInvalid",
    "invalid-badge": "awardNotOwned", "invalid-input": "saveFailed",
  };
  if (data.code !== "saved" && data.code !== "conflict") return showcaseFailure(Object.hasOwn(codes, String(data.code)) ? codes[String(data.code)] : "saveFailed");
  const row = "showcase" in data && data.showcase && typeof data.showcase === "object" ? data.showcase : null;
  if (!row || !("revision" in row) || !isShowcaseRevision(row.revision) ||
      !("current_thought" in row) || !("featured_badge_award_id" in row)) return showcaseFailure(data.code === "conflict" ? "conflict" : "saveFailed");
  const thought = validateCurrentThought(row.current_thought);
  const awardId = row.featured_badge_award_id;
  if (!thought.ok || (awardId !== null && !isShowcaseUuid(awardId))) return showcaseFailure(data.code === "conflict" ? "conflict" : "saveFailed");
  return {
    status: data.code === "saved" ? "success" : "error", code: data.code === "saved" ? success : "conflict", revision: row.revision,
    currentThought: thought.value, featuredBadgeAwardId: awardId,
    ...("thought_hidden_at" in row ? { thoughtHidden: row.thought_hidden_at !== null } : {}),
  };
}

function inputRecord(input: unknown): Record<string, unknown> | null {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : null;
}

async function mutationContext() {
  const { userId } = await auth();
  if (!userId) return null;
  const client = await createAuthenticatedSupabaseClient();
  const { data: player, error } = await client.from("players")
    .select("id").eq("clerk_user_id", userId).is("account_closed_at", null).maybeSingle();
  return { client, playerId: !error && isShowcaseUuid(player?.id) ? player.id : null, error };
}

async function legalFailure(): Promise<ActionResult | null> {
  try {
    await requireCurrentAccountLegalAcceptance();
    return null;
  } catch (error) {
    return showcaseFailure(error && typeof error === "object" && "reason" in error &&
      error.reason === "required" ? "legalRequired" : "unavailable");
  }
}

export function revalidateShowcase(playerId: string) {
  revalidatePath("/dashboard/showcase");
  revalidatePath(`/players/${playerId}`);
}

export async function savePlayerShowcaseThought(input: unknown): Promise<ActionResult> {
  try {
    const context = await mutationContext();
    if (!context) return showcaseFailure("signInRequired");
    if (context.error) return showcaseFailure("unavailable");
    if (!context.playerId) return showcaseFailure("profileRequired");
    const record = inputRecord(input);
    if (!record || !isShowcaseRevision(record.revision)) return showcaseFailure("conflict");
    const thought = validateCurrentThought(record.currentThought);
    if (!thought.ok) return showcaseFailure(thought.code);
    if (thought.value !== null) {
      const blocked = await legalFailure();
      if (blocked) return blocked;
    }
    const { data, error } = await context.client.rpc("save_my_player_showcase_thought", {
      p_current_thought: thought.value, p_expected_revision: record.revision,
    });
    if (error) return showcaseFailure("saveFailed");
    const result = mapShowcaseSaveReply(data, "thoughtSaved");
    if (result.status === "success") revalidateShowcase(context.playerId);
    return result;
  } catch {
    return showcaseFailure("saveFailed");
  }
}

export async function savePlayerShowcaseBadge(input: unknown): Promise<ActionResult> {
  try {
    const context = await mutationContext();
    if (!context) return showcaseFailure("signInRequired");
    if (context.error) return showcaseFailure("unavailable");
    if (!context.playerId) return showcaseFailure("profileRequired");
    const record = inputRecord(input);
    if (!record || !isShowcaseRevision(record.revision)) return showcaseFailure("conflict");
    const awardId = record.awardId;
    if (awardId !== null && !isShowcaseUuid(awardId)) return showcaseFailure("invalidAward");
    if (awardId !== null) {
      const blocked = await legalFailure();
      if (blocked) return blocked;
      const { data: award, error } = await context.client.from("player_badge_awards")
        .select("id, badge_slug").eq("id", awardId).eq("player_id", context.playerId).maybeSingle();
      if (error) return showcaseFailure("unavailable");
      if (!award || !canonicalShowcaseSlug(award.badge_slug)) return showcaseFailure("awardNotOwned");
    }
    const { data, error } = await context.client.rpc("save_my_player_showcase_badge", {
      p_award_id: awardId, p_expected_revision: record.revision,
    });
    if (error) return showcaseFailure("saveFailed");
    const result = mapShowcaseSaveReply(data, "badgeSaved");
    if (result.status === "success") revalidateShowcase(context.playerId);
    return result;
  } catch {
    return showcaseFailure("saveFailed");
  }
}
