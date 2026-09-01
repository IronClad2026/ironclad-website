"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import type { BadgeRevealAcknowledgeResult } from "@/lib/badges/types";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function acknowledgeBadgeReveal(
  awardId: unknown
): Promise<BadgeRevealAcknowledgeResult> {
  const [{ userId }, locale] = await Promise.all([auth(), getRequestLocale()]);
  const dictionary = await loadDictionary(locale, "badges");
  const errorMessage = dictionary.reveal.ackError;

  if (!userId) {
    return actionError("sign-in-required", errorMessage);
  }

  if (typeof awardId !== "string" || !UUID_PATTERN.test(awardId)) {
    return actionError("invalid-award", errorMessage);
  }

  const supabase = await createAuthenticatedSupabaseClient();
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (playerError) {
    logAcknowledgeFailure("load-player", playerError);
    return actionError("lookup-failed", errorMessage);
  }

  if (!player || typeof player.id !== "string") {
    return actionError("profile-required", errorMessage);
  }

  const { data: award, error: awardError } = await supabase
    .from("player_badge_awards")
    .select("id, player_id")
    .eq("id", awardId)
    .eq("player_id", player.id)
    .maybeSingle();

  if (awardError) {
    logAcknowledgeFailure("load-owned-award", awardError);
    return actionError("lookup-failed", errorMessage);
  }

  if (!award || award.id !== awardId || award.player_id !== player.id) {
    return actionError("award-not-owned", errorMessage);
  }

  const { data: existingReveal, error: existingRevealError } = await supabase
    .from("player_badge_reveals")
    .select("player_badge_award_id")
    .eq("player_badge_award_id", awardId)
    .eq("player_id", player.id)
    .maybeSingle();

  if (existingRevealError) {
    logAcknowledgeFailure("load-existing-reveal", existingRevealError);
    return actionError("lookup-failed", errorMessage);
  }

  if (existingReveal) {
    return acknowledgeSuccess("already-acknowledged");
  }

  const { error: insertError } = await supabase
    .from("player_badge_reveals")
    .insert({
      player_badge_award_id: awardId,
      player_id: player.id,
    });

  if (insertError && getErrorCode(insertError) !== "23505") {
    logAcknowledgeFailure("insert-reveal", insertError);
    return actionError("acknowledge-failed", errorMessage);
  }

  return acknowledgeSuccess(
    insertError ? "already-acknowledged" : "acknowledged"
  );
}

function acknowledgeSuccess(
  code: "acknowledged" | "already-acknowledged"
): BadgeRevealAcknowledgeResult {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/badges");

  return { status: "success", code };
}

function actionError(
  code: Extract<BadgeRevealAcknowledgeResult, { status: "error" }>["code"],
  message: string
): BadgeRevealAcknowledgeResult {
  return { status: "error", code, message };
}

function logAcknowledgeFailure(operation: string, error: unknown) {
  console.error("Badge reveal acknowledgement failed.", {
    operation,
    code: getErrorCode(error),
  });
}

function getErrorCode(error: unknown) {
  return isRecord(error) && typeof error.code === "string"
    ? error.code
    : "BADGE_REVEAL_ACKNOWLEDGE_FAILED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
