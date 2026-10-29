import type { EffectiveTournamentDivisionState } from "@/lib/tournament-division-state";
import type { TournamentStatus } from "@/lib/tournaments";

export type PublicCompetitionRecord = {
  matchesPlayed: number;
  wins: number;
  losses: number;
};

/** Explicit presentation allow-list; no account bindings or internal match rows. */
export type PublicPlayerTournamentEntry = {
  tournamentId: string;
  tournamentName: string;
  tournamentHref: string;
  tournamentStatus: TournamentStatus;
  division: string;
  divisionState: EffectiveTournamentDivisionState;
  divisionCompleted: boolean;
  withdrawn: boolean;
  champion: boolean;
  placement: number | null;
  record: PublicCompetitionRecord;
};

export type PublicPlayerCompetitionHistory =
  | {
      status: "loaded";
      entries: PublicPlayerTournamentEntry[];
      record: PublicCompetitionRecord;
      coverage: {
        scope: "returned_entries";
        page: number;
        previousPage: number | null;
        nextPage: number | null;
        reachedLimit: boolean;
      };
    }
  | { status: "unavailable" }
  | { status: "not_found" };
