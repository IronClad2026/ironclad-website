import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getBadgeDefinitionBySlug } from "@/lib/badges/catalog";
import {
  buildDashboardBadgeData,
  type DashboardBadgeData,
} from "@/lib/badges/dashboard";
import { loadPlayerBadgeAwards } from "@/lib/badges/read";
import type {
  BadgeRevealQueueItem,
  PlayerBadgeAward,
} from "@/lib/badges/types";

type BadgeRevealReadClient = Pick<SupabaseClient, "from">;

type BadgeRevealRow = {
  player_badge_award_id: unknown;
};

const BADGE_REVEAL_SELECT = "player_badge_award_id";

export type PlayerBadgeRevealDashboardState = {
  badgeData: DashboardBadgeData;
  pendingReveals: BadgeRevealQueueItem[];
};

export async function loadPlayerBadgeRevealDashboardState(
  supabase: BadgeRevealReadClient,
  playerId: string | null | undefined
): Promise<PlayerBadgeRevealDashboardState> {
  if (!playerId) {
    return {
      badgeData: buildDashboardBadgeData(),
      pendingReveals: [],
    };
  }

  const [awards, revealState] = await Promise.all([
    loadPlayerBadgeAwards(supabase, playerId),
    loadRevealedBadgeAwardIds(supabase, playerId),
  ]);

  // Fail closed: a reveal-state outage must never replay every historical award.
  const pendingReveals = revealState.ok
    ? buildPendingBadgeReveals(awards, revealState.awardIds)
    : [];
  const pendingAwardIds = new Set(pendingReveals.map((item) => item.id));
  const awardsWithRevealState = awards.map((award) => ({
    ...award,
    isUnrevealed: Boolean(
      award.awardId && pendingAwardIds.has(award.awardId)
    ),
  }));

  return {
    badgeData: buildDashboardBadgeData({
      playerId,
      awards: awardsWithRevealState,
    }),
    pendingReveals,
  };
}

export function buildPendingBadgeReveals(
  awards: readonly PlayerBadgeAward[],
  revealedAwardIds: ReadonlySet<string>
): BadgeRevealQueueItem[] {
  return awards
    .flatMap((award): BadgeRevealQueueItem[] => {
      const awardId = award.awardId;
      const definition = getBadgeDefinitionBySlug(award.badgeSlug);

      if (!awardId || revealedAwardIds.has(awardId) || !definition) {
        return [];
      }

      const unrevealedAward = { ...award, isUnrevealed: true };

      return [
        {
          id: awardId,
          item: {
            definition,
            state: "earned",
            award: unrevealedAward,
          },
          queuedAt: award.awardedAt,
          reason: "new-unlock",
          entitlement: { premiumEffectsEnabled: false },
          seenAt: null,
        },
      ];
    })
    .sort(comparePendingReveals);
}

async function loadRevealedBadgeAwardIds(
  supabase: BadgeRevealReadClient,
  playerId: string
): Promise<
  | { ok: true; awardIds: ReadonlySet<string> }
  | { ok: false; awardIds: ReadonlySet<string> }
> {
  const { data, error } = await supabase
    .from("player_badge_reveals")
    .select(BADGE_REVEAL_SELECT)
    .eq("player_id", playerId);

  if (error) {
    console.error("Player badge reveal state load failed.", {
      operation: "load-player-badge-reveals",
      code: getErrorCode(error),
    });
    return { ok: false, awardIds: new Set() };
  }

  return {
    ok: true,
    awardIds: new Set(
      rowsOf<BadgeRevealRow>(data)
        .map((row) => stringOrNull(row.player_badge_award_id))
        .filter((awardId): awardId is string => awardId !== null)
    ),
  };
}

function comparePendingReveals(
  left: BadgeRevealQueueItem,
  right: BadgeRevealQueueItem
) {
  const leftAwardedAt = Date.parse(left.queuedAt);
  const rightAwardedAt = Date.parse(right.queuedAt);

  return (
    (Number.isFinite(leftAwardedAt) ? leftAwardedAt : 0) -
      (Number.isFinite(rightAwardedAt) ? rightAwardedAt : 0) ||
    left.id.localeCompare(right.id)
  );
}

function rowsOf<T extends Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter(isRecord) as T[]) : [];
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getErrorCode(error: unknown) {
  return isRecord(error) && typeof error.code === "string"
    ? error.code
    : "BADGE_REVEAL_READ_FAILED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
