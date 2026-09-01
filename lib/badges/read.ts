import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBadgeDefinitionBySlug } from "@/lib/badges/catalog";
import {
  buildDashboardBadgeData,
  type DashboardBadgeData,
} from "@/lib/badges/dashboard";
import type {
  BadgeSlug,
  PlayerBadgeAward,
} from "@/lib/badges/types";

type BadgeAwardReadClient = Pick<SupabaseClient, "from">;

type BadgeAwardRow = {
  id: unknown;
  badge_slug: unknown;
  unlocked_at: unknown;
  original_unlocked_at: unknown;
  source_metadata: unknown;
};

const BADGE_AWARD_SELECT = [
  "id",
  "badge_slug",
  "unlocked_at",
  "original_unlocked_at",
  "source_metadata",
].join(", ");

export type PlayerBadgeAwardsLoadResult =
  | {
      status: "success";
      awards: PlayerBadgeAward[];
    }
  | {
      status: "error";
      code: "award-load-failed";
    };

export type DashboardBadgeDataLoadResult =
  | {
      status: "success";
      data: DashboardBadgeData;
    }
  | {
      status: "error";
      code: "award-load-failed";
    };

export async function loadPlayerBadgeAwards(
  supabase: BadgeAwardReadClient,
  playerId: string | null | undefined
): Promise<PlayerBadgeAwardsLoadResult> {
  if (!playerId) {
    return { status: "success", awards: [] };
  }

  const { data, error } = await supabase
    .from("player_badge_awards")
    .select(BADGE_AWARD_SELECT)
    .eq("player_id", playerId)
    .order("unlocked_at", { ascending: false });

  if (error) {
    console.error("Player badge awards load failed.", {
      operation: "load-player-badge-awards",
      code: getErrorCode(error),
    });
    return { status: "error", code: "award-load-failed" };
  }

  return {
    status: "success",
    awards: mapPlayerBadgeAwardRows(data),
  };
}

export async function buildDashboardBadgeDataFromAwards(
  supabase: BadgeAwardReadClient,
  playerId: string | null | undefined
): Promise<DashboardBadgeDataLoadResult> {
  const result = await loadPlayerBadgeAwards(supabase, playerId);

  if (result.status === "error") {
    return result;
  }

  return {
    status: "success",
    data: buildDashboardBadgeData({
      playerId: playerId ?? null,
      awards: result.awards,
    }),
  };
}

export function mapPlayerBadgeAwardRows(rows: unknown): PlayerBadgeAward[] {
  return rowsOf<BadgeAwardRow>(rows)
    .map(mapPlayerBadgeAwardRow)
    .filter((award): award is PlayerBadgeAward => award !== null);
}

function mapPlayerBadgeAwardRow(row: BadgeAwardRow): PlayerBadgeAward | null {
  const badgeSlug = canonicalBadgeSlugOrNull(row.badge_slug);
  const awardedAt = isoOrNull(row.unlocked_at);

  if (!badgeSlug || !awardedAt) {
    return null;
  }

  return {
    awardId: stringOrNull(row.id),
    badgeSlug,
    awardedAt,
    originalAwardedAt: isoOrNull(row.original_unlocked_at),
    evidenceLabel: getEvidenceLabel(row.source_metadata),
  };
}

function canonicalBadgeSlugOrNull(value: unknown): BadgeSlug | null {
  if (typeof value !== "string") return null;
  const slug = value.trim() as BadgeSlug;

  return getBadgeDefinitionBySlug(slug) ? slug : null;
}

function getEvidenceLabel(value: unknown) {
  if (!isRecord(value)) return null;
  return stringOrNull(value.evidenceLabel);
}

function rowsOf<T extends Record<string, unknown>>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord) as T[];
  }

  if (isRecord(value)) {
    return [value as T];
  }

  return [];
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isoOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? value : null;
}

function getErrorCode(error: unknown) {
  return isRecord(error) && typeof error.code === "string"
    ? error.code
    : "BADGE_AWARD_READ_FAILED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
