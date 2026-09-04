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

export type BadgeNotificationReconciliationErrorCode =
  | "BADGE_NOTIFICATION_PLAYER_LOAD_FAILED"
  | "BADGE_NOTIFICATION_PLAYER_RESULT_INVALID"
  | "BADGE_NOTIFICATION_AWARD_LOAD_FAILED"
  | "BADGE_NOTIFICATION_AWARD_RESULT_INVALID"
  | "BADGE_NOTIFICATION_CREATE_FAILED";

export type BadgeNotificationReconciliationResult =
  | {
      succeeded: true;
    }
  | {
      succeeded: false;
      errorCode: BadgeNotificationReconciliationErrorCode;
    };

type BadgeNotificationRecipientLoadResult =
  | {
      status: "open";
      recipient: BadgeNotificationRecipient;
    }
  | {
      status: "unavailable";
    }
  | {
      status: "failed";
      errorCode:
        | "BADGE_NOTIFICATION_PLAYER_LOAD_FAILED"
        | "BADGE_NOTIFICATION_PLAYER_RESULT_INVALID";
    };

type BadgeAwardLoadResult =
  | {
      status: "loaded";
      data: unknown;
    }
  | {
      status: "failed";
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

  const recipientResult = await loadOpenPlayerRecipient(supabase, playerId);
  if (recipientResult.status !== "open") {
    return false;
  }

  return createBadgeNotificationForRecipient({
    award,
    recipient: recipientResult.recipient,
  });
}

export async function reconcileBadgeUnlockedNotificationsForPlayer(
  playerId: string
): Promise<BadgeNotificationReconciliationResult> {
  if (!isUuid(playerId)) {
    return reconciliationFailure("BADGE_NOTIFICATION_PLAYER_RESULT_INVALID");
  }

  const supabase = createSupabaseAdminClient();
  const [recipientResult, awardsResult] = await Promise.all([
    loadOpenPlayerRecipient(supabase, playerId),
    loadBadgeAwardsForPlayer(supabase, playerId),
  ]);

  if (recipientResult.status === "unavailable") {
    return reconciliationSuccess();
  }

  if (awardsResult.status === "failed") {
    return reconciliationFailure("BADGE_NOTIFICATION_AWARD_LOAD_FAILED");
  }

  if (!Array.isArray(awardsResult.data)) {
    return reconciliationFailure("BADGE_NOTIFICATION_AWARD_RESULT_INVALID");
  }

  const awards: BadgeAwardRow[] = [];
  const awardIds = new Set<string>();
  const badgeSlugs = new Set<string>();

  for (const value of awardsResult.data) {
    if (
      !isBadgeAwardRow(value) ||
      !getBadgeDefinitionBySlug(value.badge_slug as BadgeSlug) ||
      awardIds.has(value.id) ||
      badgeSlugs.has(value.badge_slug)
    ) {
      return reconciliationFailure("BADGE_NOTIFICATION_AWARD_RESULT_INVALID");
    }

    awardIds.add(value.id);
    badgeSlugs.add(value.badge_slug);

    if (isBackfillAward(value.source_metadata)) {
      continue;
    }

    awards.push(value);
  }

  if (awards.length === 0) {
    return reconciliationSuccess();
  }

  if (recipientResult.status === "failed") {
    return reconciliationFailure(recipientResult.errorCode);
  }

  let notificationFailed = false;

  for (const award of awards) {
    try {
      const notificationCreated = await createBadgeNotificationForRecipient({
        award,
        recipient: recipientResult.recipient,
      });

      if (notificationCreated !== true) {
        notificationFailed = true;
      }
    } catch (error) {
      logBadgeNotificationFailure("reconcile-create", error);
      notificationFailed = true;
    }
  }

  return notificationFailed
    ? reconciliationFailure("BADGE_NOTIFICATION_CREATE_FAILED")
    : reconciliationSuccess();
}

async function loadOpenPlayerRecipient(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  playerId: string
): Promise<BadgeNotificationRecipientLoadResult> {
  let result: {
    data: unknown;
    error: unknown;
  };

  try {
    result = await supabase
      .from("players")
      .select("clerk_user_id")
      .eq("id", playerId)
      .is("account_closed_at", null)
      .maybeSingle();
  } catch (error) {
    logBadgeNotificationFailure("load-recipient", error);
    return {
      status: "failed",
      errorCode: "BADGE_NOTIFICATION_PLAYER_LOAD_FAILED",
    };
  }

  const { data, error } = result;

  if (error) {
    logBadgeNotificationFailure("load-recipient", error);
    return {
      status: "failed",
      errorCode: "BADGE_NOTIFICATION_PLAYER_LOAD_FAILED",
    };
  }

  if (data === null) {
    return { status: "unavailable" };
  }

  if (!isRecord(data)) {
    return {
      status: "failed",
      errorCode: "BADGE_NOTIFICATION_PLAYER_RESULT_INVALID",
    };
  }

  const clerkUserId = stringOrNull(data.clerk_user_id);
  return clerkUserId
    ? { status: "open", recipient: { clerkUserId } }
    : {
        status: "failed",
        errorCode: "BADGE_NOTIFICATION_PLAYER_RESULT_INVALID",
      };
}

async function loadBadgeAwardsForPlayer(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  playerId: string
): Promise<BadgeAwardLoadResult> {
  try {
    const { data, error } = await supabase
      .from("player_badge_awards")
      .select("id, badge_slug, source_metadata")
      .eq("player_id", playerId)
      .order("unlocked_at", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      logBadgeNotificationFailure("reconcile-load-awards", error);
      return { status: "failed" };
    }

    return { status: "loaded", data };
  } catch (error) {
    logBadgeNotificationFailure("reconcile-load-awards", error);
    return { status: "failed" };
  }
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

function reconciliationSuccess(): BadgeNotificationReconciliationResult {
  return { succeeded: true };
}

function reconciliationFailure(
  errorCode: BadgeNotificationReconciliationErrorCode
): BadgeNotificationReconciliationResult {
  return {
    succeeded: false,
    errorCode,
  };
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
