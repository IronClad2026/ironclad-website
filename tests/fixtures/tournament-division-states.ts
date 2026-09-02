import { resolveTournamentDivisionStates } from "@/lib/tournament-division-state";
import type { TournamentStatus } from "@/lib/tournaments";

export function createDisabledTournamentDivisionStates(
  tournamentId: string,
  eventStatus: TournamentStatus
) {
  return resolveTournamentDivisionStates({
    tournamentId,
    eventStatus,
    divisions: [],
  });
}
