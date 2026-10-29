import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { loadPlayerCompetitionHistoryByPlayerId } from "@/lib/competition-read-models/players";
import { COMPETITION_READ_LIMITS } from "@/lib/competition-read-models/shared";
import type { PublicPlayerCompetitionHistory } from "@/lib/public-player-competition-types";

const PAGE_SIZE = COMPETITION_READ_LIMITS.history;
const MAX_PAGE = Math.floor(10000 / PAGE_SIZE) + 1;

export function parsePublicHistoryPage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,3}$/.test(value)) return 1;
  const page = Number(value);
  return page <= MAX_PAGE ? page : 1;
}

/** Read-only service-role adapter. The shared model rechecks active-account
 * visibility after its bounded official-record reads. Only this DTO reaches UI.
 */
export async function getPublicPlayerCompetitionHistory(
  playerId: string,
  page: number,
): Promise<PublicPlayerCompetitionHistory> {
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
    return { status: "unavailable" };
  }
  try {
    const result = await loadPlayerCompetitionHistoryByPlayerId(
      createSupabaseAdminClient(),
      playerId,
      { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    );
    if (result.outcome !== "FOUND_VISIBLE") return { status: "not_found" };
    const { entries, aggregate, coverage } = result.player;
    return {
      status: "loaded",
      entries: entries.map((entry) => {
        const terminal = entry.tournament.status === "cancelled" ||
          entry.tournament.status === "voided";
        const divisionCompleted = !terminal && entry.divisionCompleted === true;
        return {
          tournamentId: entry.tournament.id,
          tournamentName: entry.tournament.name,
          tournamentHref: `/tournaments?tournament=${encodeURIComponent(entry.tournament.slug)}`,
          tournamentStatus: entry.tournament.status,
          division: entry.division.displayName,
          divisionState: entry.division.effectiveState,
          divisionCompleted,
          withdrawn: entry.registrationStatus === "withdrawn",
          champion: divisionCompleted && entry.champion,
          placement: divisionCompleted ? entry.placement : null,
          record: {
            matchesPlayed: entry.record.matchesPlayed,
            wins: entry.record.wins,
            losses: entry.record.losses,
          },
        };
      }),
      record: {
        matchesPlayed: aggregate.matchesPlayed,
        wins: aggregate.wins,
        losses: aggregate.losses,
      },
      coverage: {
        scope: "returned_entries",
        page,
        previousPage: page > 1 ? page - 1 : null,
        nextPage: coverage.hasMore && page < MAX_PAGE ? page + 1 : null,
        reachedLimit: coverage.hasMore && page === MAX_PAGE,
      },
    };
  } catch {
    console.error("Public player competition history load failed.");
    return { status: "unavailable" };
  }
}
