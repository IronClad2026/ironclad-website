import "server-only";

import { auth } from "@clerk/nextjs/server";
import { loadMatchResultData } from "@/lib/match-result-data";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getGeneratedBracketRegistrationIds,
  loadGeneratedBracketPageRows,
  mapGeneratedBrackets,
  type GeneratedBracketPageRow,
} from "@/lib/tournament-bracket-data";
import { isActiveReviewCohortStatus } from "@/lib/tournament-registration-cohort";
import {
  getTournamentBracketDisplayName,
  mapPublicTournamentParticipant,
  mapTournamentRow,
  type MatchResultReportGroup,
  type MatchResultSubmission,
  type TournamentCard,
  type TournamentParticipant,
  type TournamentRow,
} from "@/lib/tournaments";

const TOURNAMENT_SELECT =
  "id, slug, title, description, banner_image_url, registration_open_at, registration_close_at, start_date, end_date, status, format, prize_pool, rules_url, battlefy_url, registration_enabled, grand_final_at, rule_format, result_confirmation_window_minutes, created_at, updated_at, tournament_brackets(id, tournament_id, name, elo_rules, max_players, launched_at, map_pool_published_at, created_at, updated_at)";

const REGISTRATION_SELECT =
  "id, clerk_user_id, tournament_id, tournament_bracket_id, player_name, country, submitted_elo, elo_verified_elo, registration_status, waitlist_offer_status";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type RegistrationRow = {
  id: string;
  clerk_user_id: string;
  tournament_id: string;
  tournament_bracket_id: string;
  player_name: string;
  country: string | null;
  submitted_elo: number | null;
  elo_verified_elo: number | null;
  registration_status: TournamentParticipant["status"];
  waitlist_offer_status:
    | "offered"
    | "accepted"
    | "declined"
    | "expired"
    | "cancelled"
    | null;
};

type PlayerPrivacyRow = {
  clerk_user_id: string;
  public_profile_enabled: boolean;
  account_closed_at: string | null;
};

type CapacityRow = {
  bracket_id: string;
  registered_players: number;
};

export type AdminTournamentMatchViewer = {
  isAdmin: true;
  relicVerifiedDivision: null;
  registrationIds: string[];
  registrations: [];
};

export type AdminTournamentMatchWorkspace = {
  tournament: TournamentCard;
  viewer: AdminTournamentMatchViewer;
  submissions: MatchResultSubmission[];
  reportGroups: MatchResultReportGroup[];
};

export type AdminTournamentMatchWorkspaceLoadResult =
  | ({ ok: true } & AdminTournamentMatchWorkspace)
  | {
      ok: false;
      reason: "unauthorized" | "not-found" | "load-failed";
    };

/**
 * Loads the existing Tournament match-management presentation for one Admin
 * workspace. All match mutations continue to live in the established actions
 * used by AdminMatchManagementModal.
 */
export async function loadAdminTournamentMatchWorkspace(
  tournamentId: string
): Promise<AdminTournamentMatchWorkspaceLoadResult> {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    return { ok: false, reason: "unauthorized" };
  }

  if (!UUID_PATTERN.test(tournamentId)) {
    return { ok: false, reason: "not-found" };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [
      tournamentResult,
      capacityResult,
      registrationResult,
      generatedBracketResult,
    ] = await Promise.all([
      supabase
        .from("tournaments")
        .select(TOURNAMENT_SELECT)
        .eq("id", tournamentId)
        .maybeSingle(),
      supabase.rpc("get_tournament_bracket_capacity"),
      supabase
        .from("registrations")
        .select(REGISTRATION_SELECT)
        .eq("tournament_id", tournamentId)
        .not("tournament_bracket_id", "is", null),
      loadGeneratedBracketPageRows({ includeAdminAudit: true }),
    ]);

    if (
      tournamentResult.error ||
      capacityResult.error ||
      registrationResult.error ||
      generatedBracketResult.error
    ) {
      return loadFailure("base-data");
    }

    if (tournamentResult.data === null) {
      return { ok: false, reason: "not-found" };
    }

    if (
      !Array.isArray(capacityResult.data) ||
      !Array.isArray(registrationResult.data) ||
      !Array.isArray(generatedBracketResult.data)
    ) {
      return loadFailure("base-shape");
    }

    const tournamentRow = tournamentResult.data as TournamentRow;
    const tournamentBrackets = tournamentRow.tournament_brackets ?? [];
    const bracketIds = new Set(
      tournamentBrackets.map((bracket) => bracket.id)
    );
    const generatedRows = (
      generatedBracketResult.data as GeneratedBracketPageRow[]
    ).filter((row) => bracketIds.has(row.tournament_bracket_id));
    const registrations = registrationResult.data as RegistrationRow[];
    const referencedRegistrationIds = getGeneratedBracketRegistrationIds(
      generatedRows
    );
    const bracketRegistrations = registrations.filter(
      (registration) =>
        registration.registration_status === "approved" ||
        referencedRegistrationIds.has(registration.id)
    );

    applyRegistrationCounts(
      tournamentRow,
      registrations,
      capacityResult.data as CapacityRow[]
    );

    const clerkUserIds = [
      ...new Set(
        bracketRegistrations.map(
          (registration) => registration.clerk_user_id
        )
      ),
    ];
    const playerResult =
      clerkUserIds.length > 0
        ? await supabase
            .from("players")
            .select(
              "clerk_user_id, public_profile_enabled, account_closed_at"
            )
            .in("clerk_user_id", clerkUserIds)
        : { data: [], error: null };

    if (playerResult.error || !Array.isArray(playerResult.data)) {
      return loadFailure("participant-privacy");
    }

    const playersByClerkId = new Map(
      (playerResult.data as PlayerPrivacyRow[]).map((player) => [
        player.clerk_user_id,
        player,
      ])
    );
    const bracketNames = new Map(
      tournamentBrackets.map((bracket) => [
        bracket.id,
        getTournamentBracketDisplayName(bracket.name),
      ])
    );
    const participants: TournamentParticipant[] = [];
    const bracketParticipants: TournamentParticipant[] = [];

    for (const registration of bracketRegistrations) {
      const player = playersByClerkId.get(registration.clerk_user_id);
      const participant = mapPublicTournamentParticipant(
        {
          registrationId: registration.id,
          playerName: registration.player_name,
          country: registration.country,
          submittedElo: registration.submitted_elo,
          verifiedElo: registration.elo_verified_elo,
          status: registration.registration_status,
          bracketId: registration.tournament_bracket_id,
          bracketName:
            bracketNames.get(registration.tournament_bracket_id) ??
            "Tournament Bracket",
        },
        player
          ? {
              publicProfileEnabled: player.public_profile_enabled,
              accountClosedAt: player.account_closed_at,
            }
          : null
      );

      bracketParticipants.push(participant);
      if (registration.registration_status === "approved") {
        participants.push(participant);
      }
    }

    const tournament = mapTournamentRow(tournamentRow);
    tournament.participants = participants;
    tournament.bracketParticipants = bracketParticipants;
    tournament.generatedBrackets =
      mapGeneratedBrackets(generatedRows, [tournamentRow]).get(
        tournamentRow.id
      ) ?? [];
    tournament.players = participants.length;

    const matchResultData = await loadMatchResultData();
    if (
      matchResultData.error ||
      matchResultData.viewerRole !== "admin" ||
      !Array.isArray(matchResultData.submissions) ||
      !Array.isArray(matchResultData.reportGroups)
    ) {
      return loadFailure("result-data");
    }

    const matchIds = new Set(
      tournament.generatedBrackets.flatMap((bracket) =>
        bracket.matches.map((match) => match.id)
      )
    );

    return {
      ok: true,
      tournament,
      viewer: {
        isAdmin: true,
        relicVerifiedDivision: null,
        registrationIds: bracketRegistrations
          .filter((registration) => registration.clerk_user_id === userId)
          .map((registration) => registration.id),
        registrations: [],
      },
      submissions: matchResultData.submissions.filter((submission) =>
        matchIds.has(submission.matchId)
      ),
      reportGroups: matchResultData.reportGroups.filter((reportGroup) =>
        matchIds.has(reportGroup.matchId)
      ),
    };
  } catch {
    return loadFailure("unexpected");
  }
}

function applyRegistrationCounts(
  tournament: TournamentRow,
  registrations: RegistrationRow[],
  capacities: CapacityRow[]
) {
  const capacityByBracket = new Map(
    capacities.map((capacity) => [
      capacity.bracket_id,
      capacity.registered_players,
    ])
  );
  const activeCohortByBracket = new Map<string, number>();
  const waitlistByBracket = new Map<string, number>();

  for (const registration of registrations) {
    if (
      isActiveReviewCohortStatus(registration.registration_status) ||
      (registration.registration_status === "waitlisted" &&
        registration.waitlist_offer_status === "offered")
    ) {
      activeCohortByBracket.set(
        registration.tournament_bracket_id,
        (activeCohortByBracket.get(registration.tournament_bracket_id) ?? 0) +
          1
      );
    }

    if (
      registration.registration_status === "waitlisted" &&
      registration.waitlist_offer_status === null
    ) {
      waitlistByBracket.set(
        registration.tournament_bracket_id,
        (waitlistByBracket.get(registration.tournament_bracket_id) ?? 0) + 1
      );
    }
  }

  for (const bracket of tournament.tournament_brackets ?? []) {
    bracket.registered_players = capacityByBracket.get(bracket.id) ?? 0;
    bracket.active_cohort_players =
      activeCohortByBracket.get(bracket.id) ?? 0;
    bracket.waitlisted_players = waitlistByBracket.get(bracket.id) ?? 0;
  }
}

function loadFailure(operation: string): AdminTournamentMatchWorkspaceLoadResult {
  console.error("Admin Tournament match workspace load failed.", {
    operation,
  });
  return { ok: false, reason: "load-failed" };
}
