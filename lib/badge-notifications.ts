import "server-only";

import {
  getBadgeDefinitionBySlug,
} from "@/lib/badges/catalog";
import type { BadgeSlug } from "@/lib/badges/types";
import { createInAppNotification } from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type BadgeAwardNotificationInput = {
  awardId: string;
  playerId: string;
  badgeSlug: BadgeSlug;
};

type BadgeAwardRow = {
  id: string;
  badge_slug: string;
  source_metadata: Record<string, unknown> | null;
};

type BadgeNotificationRecipient = {
  clerkUserId: string;
};

export async function createBadgeUnlockedNotification({
  awardId,
  playerId,
  badgeSlug,
}: BadgeAwardNotificationInput): Promise<boolean> {
  if (!isUuid(awardId) || !isUuid(playerId)) {
    return false;
  }

  const supabase = createSupabaseAdminClient();
  const { data: award, error: awardError } = await supabase
    .from("player_badge_awards")
    .select("id, badge_slug, source_metadata")
    .eq("id", awardId)
    .eq("player_id", playerId)
    .eq("badge_slug", badgeSlug)
    .maybeSingle();

  if (awardError || !isBadgeAwardRow(award)) {
    if (awardError) {
      logBadgeNotificationFailure("load-award", awardError);
    }
    return false;
  }

  if (isBackfillAward(award.source_metadata)) {
    return true;
  }

  const recipient = await loadOpenPlayerRecipient(supabase, playerId);
  if (!recipient) {
    return false;
  }

  return createBadgeNotificationForRecipient({
    award,
    recipient,
  });
}

export async function reconcileBadgeUnlockedNotificationsForPlayer(
  playerId: string
): Promise<void> {
  if (!isUuid(playerId)) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const [recipient, awardsResult] = await Promise.all([
    loadOpenPlayerRecipient(supabase, playerId),
    supabase
      .from("player_badge_awards")
      .select("id, badge_slug, source_metadata")
      .eq("player_id", playerId)
      .order("unlocked_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (awardsResult.error) {
    logBadgeNotificationFailure("reconcile-load-awards", awardsResult.error);
    return;
  }

  if (!recipient || !Array.isArray(awardsResult.data)) {
    return;
  }

  // The canonical slug constraint and one-award-per-player/slug uniqueness
  // bound this set to 30. Slice defensively if a malformed test double or
  // pre-constraint historical row ever exceeds that contract.
  const awards = awardsResult.data
    .filter(isBadgeAwardRow)
    .slice(0, 30)
    .filter((award) => !isBackfillAward(award.source_metadata));

  for (const award of awards) {
    await createBadgeNotificationForRecipient({
      award,
      recipient,
    });
  }
}

async function loadOpenPlayerRecipient(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  playerId: string
): Promise<BadgeNotificationRecipient | null> {
  const { data, error } = await supabase
    .from("players")
    .select("clerk_user_id")
    .eq("id", playerId)
    .is("account_closed_at", null)
    .maybeSingle();

  if (error) {
    logBadgeNotificationFailure("load-recipient", error);
    return null;
  }

  if (!isRecord(data)) {
    return null;
  }

  const clerkUserId = stringOrNull(data.clerk_user_id);
  return clerkUserId ? { clerkUserId } : null;
}

async function createBadgeNotificationForRecipient({
  award,
  recipient,
}: {
  award: BadgeAwardRow;
  recipient: BadgeNotificationRecipient;
}) {
  const definition = getBadgeDefinitionBySlug(award.badge_slug as BadgeSlug);
  if (!definition) {
    return false;
  }

  return createInAppNotification({
    recipientClerkUserId: recipient.clerkUserId,
    recipientRole: "player",
    type: "badge.unlocked",
    title: "Badge unlocked",
    message: `You unlocked the ${definition.name} Badge.`,
    eventKey: `badge-award:${award.id}:unlocked`,
    metadata: {
      awardId: award.id,
      badgeSlug: definition.slug,
      badgeNumber: definition.number,
    },
  });
}

function isBackfillAward(metadata: Record<string, unknown> | null) {
  return metadata?.evaluationMode === "backfill";
}

function isBadgeAwardRow(value: unknown): value is BadgeAwardRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isUuid(value.id) &&
    typeof value.badge_slug === "string" &&
    (value.source_metadata === null || isRecord(value.source_metadata))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function logBadgeNotificationFailure(operation: string, error: unknown) {
  const candidateCode =
    isRecord(error) && typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  const code = /^[A-Z0-9]{3,10}$/.test(candidateCode)
    ? candidateCode
    : "NOTIFY_FAILED";

  console.error("Badge notification operation failed.", { operation, code });
}
