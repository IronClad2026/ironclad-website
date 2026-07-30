import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  GeneratedTournamentBracket,
  TournamentRow,
} from "@/lib/tournaments";

const PUBLIC_GENERATED_BRACKET_SELECT =
  "id, tournament_bracket_id, format, slot_count, generated_at, " +
  "bracket_rounds(" +
  "round_number, name, " +
  "tournament_matches(" +
  "id, match_number, series_best_of, status, " +
  "player_one_slot, player_two_slot, " +
  "player_one_registration_id, player_two_registration_id, " +
  "player_one_score, player_two_score, winner_registration_id" +
  ")" +
  "), " +
  "tournament_standings(registration_id, wins, losses, points, rank)";

const ADMIN_TOURNAMENT_MATCH_AUDIT_SELECT =
  "id, official_result_submission_id, official_result_decided_by, official_result_decided_at";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type PublicTournamentMatchRow = {
  id: string;
  match_number: number;
  series_best_of: number;
  status: "scheduled" | "in_progress" | "pending_review" | "completed";
  player_one_registration_id: string | null;
  player_two_registration_id: string | null;
  player_one_slot: number | null;
  player_two_slot: number | null;
  player_one_score: number | null;
  player_two_score: number | null;
  winner_registration_id: string | null;
};

type TournamentMatchAuditRow = {
  id: string;
  official_result_submission_id: string | null;
  official_result_decided_by: string | null;
  official_result_decided_at: string | null;
};

export type TournamentMatchAudit = Omit<TournamentMatchAuditRow, "id">;

export type GeneratedBracketPageMatchRow = PublicTournamentMatchRow & {
  official_result_reference?: string | null;
  official_result_decision_label?: "Administrator" | "Legacy result";
  official_result_decided_at?: string | null;
};

export type GeneratedBracketPageRow = {
  id: string;
  tournament_bracket_id: string;
  format: "single_elimination" | "round_robin";
  slot_count: number;
  generated_at: string;
  bracket_rounds?: {
    round_number: number;
    name: string;
    tournament_matches?: GeneratedBracketPageMatchRow[];
  }[];
  tournament_standings?: {
    registration_id: string;
    wins: number;
    losses: number;
    points: number;
    rank: number | null;
  }[];
};

export type GeneratedBracketPageResult = {
  data: GeneratedBracketPageRow[];
  error: { message: string } | null;
};

export async function loadGeneratedBracketPageRows({
  includeAdminAudit,
}: {
  includeAdminAudit: boolean;
}): Promise<GeneratedBracketPageResult> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("generated_brackets")
    .select(PUBLIC_GENERATED_BRACKET_SELECT);

  if (error) {
    return {
      data: [],
      error: { message: error.message },
    };
  }

  const publicRows = sanitizeGeneratedBracketRows(data ?? []);

  if (!includeAdminAudit) {
    return {
      data: publicRows,
      error: null,
    };
  }

  const auditByMatchId = await loadAdminTournamentMatchAudit(
    getGeneratedBracketMatchIds(publicRows)
  );

  return {
    data: mergeAdminTournamentMatchAudit(publicRows, auditByMatchId),
    error: null,
  };
}

export async function loadAdminTournamentMatchAudit(
  matchIds: readonly string[]
) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const uniqueMatchIds = [...new Set(matchIds.filter(Boolean))];
  const auditByMatchId = new Map<string, TournamentMatchAudit>();

  if (uniqueMatchIds.length === 0) {
    return auditByMatchId;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tournament_matches")
    .select(ADMIN_TOURNAMENT_MATCH_AUDIT_SELECT)
    .in("id", uniqueMatchIds);

  if (error) {
    console.error("Tournament match audit load failed.", {
      operation: "load-tournament-match-audit",
    });
    return auditByMatchId;
  }

  for (const row of (data ?? []) as TournamentMatchAuditRow[]) {
    auditByMatchId.set(row.id, {
      official_result_submission_id: row.official_result_submission_id,
      official_result_decided_by: row.official_result_decided_by,
      official_result_decided_at: row.official_result_decided_at,
    });
  }

  return auditByMatchId;
}

export function getGeneratedBracketRegistrationIds(
  rows: GeneratedBracketPageRow[]
) {
  const registrationIds = new Set<string>();

  for (const row of rows) {
    for (const round of row.bracket_rounds ?? []) {
      for (const match of round.tournament_matches ?? []) {
        for (const registrationId of [
          match.player_one_registration_id,
          match.player_two_registration_id,
          match.winner_registration_id,
        ]) {
          if (registrationId) registrationIds.add(registrationId);
        }
      }
    }

    for (const standing of row.tournament_standings ?? []) {
      registrationIds.add(standing.registration_id);
    }
  }

  return registrationIds;
}

export function mapGeneratedBrackets(
  rows: GeneratedBracketPageRow[],
  tournaments: TournamentRow[]
) {
  const tournamentIdByBracket = new Map(
    tournaments.flatMap((tournament) =>
      (tournament.tournament_brackets ?? []).map((bracket) => [
        bracket.id,
        tournament.id,
      ])
    )
  );
  const generatedByTournament = new Map<string, GeneratedTournamentBracket[]>();

  for (const row of rows) {
    const tournamentId = tournamentIdByBracket.get(row.tournament_bracket_id);

    if (!tournamentId) {
      continue;
    }

    const generatedBracket: GeneratedTournamentBracket = {
      id: row.id,
      tournamentBracketId: row.tournament_bracket_id,
      format: row.format,
      slotCount: row.slot_count,
      generatedAt: row.generated_at,
      matches: (row.bracket_rounds ?? [])
        .flatMap((round) =>
          (round.tournament_matches ?? []).map((match) => {
            const hasAdminAudit = Object.hasOwn(
              match,
              "official_result_reference"
            );

            return {
              id: match.id,
              seriesBestOf: match.series_best_of,
              roundName: round.name,
              roundNumber: round.round_number,
              matchNumber: match.match_number,
              status: match.status,
              playerOneRegistrationId: match.player_one_registration_id,
              playerTwoRegistrationId: match.player_two_registration_id,
              playerOneSlot: match.player_one_slot,
              playerTwoSlot: match.player_two_slot,
              playerOneScore: match.player_one_score,
              playerTwoScore: match.player_two_score,
              winnerRegistrationId: match.winner_registration_id,
              ...(hasAdminAudit
                ? {
                    officialResultReference:
                      match.official_result_reference ?? null,
                    officialResultDecisionLabel:
                      match.official_result_decision_label ?? "Legacy result",
                    officialResultDecidedAt:
                      match.official_result_decided_at ?? null,
                  }
                : {}),
            };
          })
        )
        .sort(
          (left, right) =>
            left.roundNumber - right.roundNumber ||
            left.matchNumber - right.matchNumber
        ),
      standings: (row.tournament_standings ?? []).map((standing) => ({
        registrationId: standing.registration_id,
        wins: standing.wins,
        losses: standing.losses,
        points: standing.points,
        rank: standing.rank,
      })),
    };
    const generated = generatedByTournament.get(tournamentId) ?? [];
    generated.push(generatedBracket);
    generatedByTournament.set(tournamentId, generated);
  }

  return generatedByTournament;
}

function sanitizeGeneratedBracketRows(
  rows: unknown[]
): GeneratedBracketPageRow[] {
  return (rows as GeneratedBracketPageRow[]).map((row) => ({
    id: row.id,
    tournament_bracket_id: row.tournament_bracket_id,
    format: row.format,
    slot_count: row.slot_count,
    generated_at: row.generated_at,
    bracket_rounds: row.bracket_rounds?.map((round) => ({
      round_number: round.round_number,
      name: round.name,
      tournament_matches: round.tournament_matches?.map((match) => ({
        id: match.id,
        match_number: match.match_number,
        series_best_of: match.series_best_of,
        status: match.status,
        player_one_registration_id: match.player_one_registration_id,
        player_two_registration_id: match.player_two_registration_id,
        player_one_slot: match.player_one_slot,
        player_two_slot: match.player_two_slot,
        player_one_score: match.player_one_score,
        player_two_score: match.player_two_score,
        winner_registration_id: match.winner_registration_id,
      })),
    })),
    tournament_standings: row.tournament_standings?.map((standing) => ({
      registration_id: standing.registration_id,
      wins: standing.wins,
      losses: standing.losses,
      points: standing.points,
      rank: standing.rank,
    })),
  }));
}

function getGeneratedBracketMatchIds(rows: GeneratedBracketPageRow[]) {
  return rows.flatMap((row) =>
    (row.bracket_rounds ?? []).flatMap((round) =>
      (round.tournament_matches ?? []).map((match) => match.id)
    )
  );
}

function mergeAdminTournamentMatchAudit(
  rows: GeneratedBracketPageRow[],
  auditByMatchId: ReadonlyMap<string, TournamentMatchAudit>
) {
  return rows.map((row) => ({
    ...row,
    bracket_rounds: row.bracket_rounds?.map((round) => ({
      ...round,
      tournament_matches: round.tournament_matches?.map((match) => {
        const audit = auditByMatchId.get(match.id);

        return audit
          ? {
              ...match,
              official_result_reference:
                audit.official_result_submission_id,
              official_result_decision_label:
                audit.official_result_decided_by
                  ? ("Administrator" as const)
                  : ("Legacy result" as const),
              official_result_decided_at:
                audit.official_result_decided_at,
            }
          : match;
      }),
    })),
  }));
}
