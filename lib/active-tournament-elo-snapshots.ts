import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveTournamentEloSnapshot } from "@/components/ActiveTournamentEloSnapshotIndicator";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const ACTIVE_REGISTRATION_STATUSES = [
  "pending",
  "manual_review",
  "approved",
  "waitlisted",
] as const;
const ACTIVE_TOURNAMENT_STATUSES = [
  "upcoming",
  "registration_open",
  "in_progress",
] as const;
const RELIC_DIVISIONS = new Set(["Academy", "Challenge", "Main / Pro"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SNAPSHOT_SELECT = [
  "submitted_elo",
  "elo_verified_elo",
  "elo_verified_division",
  "registration_status",
  "waitlist_offer_status",
  "tournament_bracket:tournament_brackets(launched_at)",
  "tournament:tournaments!inner(title, status)",
].join(", ");
const PUBLIC_SNAPSHOT_SELECT = `${SNAPSHOT_SELECT}, profile:players!registrations_profile_id_fkey!inner(public_profile_enabled)`;

type SnapshotQueryClient = Pick<SupabaseClient, "from">;

type ActiveSnapshotRow = {
  submitted_elo: unknown;
  elo_verified_elo: unknown;
  elo_verified_division: unknown;
  registration_status: unknown;
  waitlist_offer_status: unknown;
  tournament_bracket:
    | {
        launched_at: unknown;
      }
    | Array<{
        launched_at: unknown;
      }>
    | null;
  tournament:
    | {
        title: unknown;
        status: unknown;
      }
    | Array<{
        title: unknown;
        status: unknown;
      }>
    | null;
  profile?:
    | {
        public_profile_enabled: unknown;
      }
    | Array<{
        public_profile_enabled: unknown;
      }>
    | null;
};

export async function getOwnActiveTournamentEloSnapshots(
  supabase: SnapshotQueryClient,
  clerkUserId: string
): Promise<ActiveTournamentEloSnapshot[]> {
  if (!clerkUserId) {
    return [];
  }

  return loadActiveTournamentEloSnapshots(
    supabase,
    "clerk_user_id",
    clerkUserId,
    false
  );
}

export async function getPublicActiveTournamentEloSnapshots(
  playerId: string
): Promise<ActiveTournamentEloSnapshot[]> {
  if (!UUID_PATTERN.test(playerId)) {
    return [];
  }

  try {
    return await loadActiveTournamentEloSnapshots(
      createSupabaseAdminClient(),
      "profile_id",
      playerId,
      true
    );
  } catch {
    console.error("Active tournament ELO snapshot load failed.");
    return [];
  }
}

async function loadActiveTournamentEloSnapshots(
  supabase: SnapshotQueryClient,
  identityColumn: "clerk_user_id" | "profile_id",
  identityValue: string,
  requirePublicProfile: boolean
): Promise<ActiveTournamentEloSnapshot[]> {
  try {
    let query = supabase
      .from("registrations")
      .select(requirePublicProfile ? PUBLIC_SNAPSHOT_SELECT : SNAPSHOT_SELECT)
      .eq(identityColumn, identityValue)
      .in("registration_status", [...ACTIVE_REGISTRATION_STATUSES])
      .in("tournament.status", [...ACTIVE_TOURNAMENT_STATUSES]);

    if (requirePublicProfile) {
      query = query.eq("profile.public_profile_enabled", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Active tournament ELO snapshot load failed.");
      return [];
    }

    return ((data ?? []) as unknown as ActiveSnapshotRow[])
      .map((row) =>
        mapActiveTournamentEloSnapshot(row, requirePublicProfile)
      )
      .filter(
        (snapshot): snapshot is ActiveTournamentEloSnapshot =>
          snapshot !== null
      )
      .sort((left, right) =>
        left.tournamentTitle.localeCompare(right.tournamentTitle)
      );
  } catch {
    console.error("Active tournament ELO snapshot load failed.");
    return [];
  }
}

function mapActiveTournamentEloSnapshot(
  row: ActiveSnapshotRow,
  requirePublicProfile: boolean
): ActiveTournamentEloSnapshot | null {
  const tournament = Array.isArray(row.tournament)
    ? row.tournament.length === 1
      ? row.tournament[0]
      : null
    : row.tournament;
  const profile = Array.isArray(row.profile)
    ? row.profile.length === 1
      ? row.profile[0]
      : null
    : row.profile;
  const tournamentBracket = Array.isArray(row.tournament_bracket)
    ? row.tournament_bracket.length === 1
      ? row.tournament_bracket[0]
      : null
    : row.tournament_bracket;

  if (
    (requirePublicProfile && profile?.public_profile_enabled !== true) ||
    typeof row.registration_status !== "string" ||
    !ACTIVE_REGISTRATION_STATUSES.includes(
      row.registration_status as (typeof ACTIVE_REGISTRATION_STATUSES)[number]
    ) ||
    (row.registration_status === "waitlisted" &&
      (tournamentBracket?.launched_at !== null ||
        (row.waitlist_offer_status !== null &&
          row.waitlist_offer_status !== "offered"))) ||
    !tournament ||
    typeof tournament.status !== "string" ||
    !ACTIVE_TOURNAMENT_STATUSES.includes(
      tournament.status as (typeof ACTIVE_TOURNAMENT_STATUSES)[number]
    ) ||
    typeof tournament.title !== "string" ||
    tournament.title.trim().length === 0
  ) {
    return null;
  }

  return {
    tournamentTitle: tournament.title.trim(),
    elo:
      row.elo_verified_elo === null || row.elo_verified_elo === undefined
        ? parseSnapshotElo(row.submitted_elo)
        : parseSnapshotElo(row.elo_verified_elo),
    division:
      typeof row.elo_verified_division === "string" &&
      RELIC_DIVISIONS.has(row.elo_verified_division)
        ? row.elo_verified_division
        : null,
  };
}

function parseSnapshotElo(value: unknown): number | null {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;

  return Number.isSafeInteger(numericValue) && numericValue >= 0
    ? numericValue
    : null;
}
