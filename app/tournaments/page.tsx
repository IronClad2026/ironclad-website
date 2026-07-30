import { auth } from "@clerk/nextjs/server";
import TournamentsExperience from "@/components/TournamentsExperience";
import { loadMatchResultData } from "@/lib/match-result-data";
import { getEloVerificationSetting } from "@/lib/platform-settings";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getGeneratedBracketRegistrationIds,
  loadGeneratedBracketPageRows,
  mapGeneratedBrackets,
} from "@/lib/tournament-bracket-data";
import {
  getTournamentBracketDisplayName,
  mapTournamentRow,
  type TournamentParticipant,
  type TournamentRow,
} from "@/lib/tournaments";

export const dynamic = "force-dynamic";

export default async function TournamentsPage() {
  const { userId, sessionClaims } = await auth();
  const isAdmin =
    (
      sessionClaims as {
        metadata?: { role?: string };
      } | null
    )?.metadata?.role === "admin";
  const supabase = createSupabaseAdminClient();
  const [
    tournamentResult,
    capacityResult,
    registrationResult,
    generatedBracketResult,
    eloVerificationSetting,
  ] = await Promise.all([
    supabase
      .from("tournaments")
      .select(
        "id, slug, title, description, banner_image_url, registration_open_at, registration_close_at, start_date, end_date, status, format, prize_pool, rules_url, battlefy_url, grand_final_at, rule_format, result_confirmation_window_minutes, created_at, updated_at, tournament_brackets(id, tournament_id, name, elo_rules, max_players, created_at, updated_at)"
      )
      .order("grand_final_at", { ascending: false, nullsFirst: false }),
    supabase.rpc("get_tournament_bracket_capacity"),
    supabase
      .from("registrations")
      .select(
        "id, clerk_user_id, tournament_id, tournament_bracket_id, player_name, country, submitted_elo, registration_status, admin_notes, created_at"
      )
      .not("tournament_id", "is", null)
      .not("tournament_bracket_id", "is", null),
    loadGeneratedBracketPageRows({
      includeAdminAudit: isAdmin,
    }),
    getEloVerificationSetting(),
  ]);

  if (tournamentResult.error) {
    console.error(
      "Tournament list load failed:",
      tournamentResult.error.message
    );
  }

  if (capacityResult.error) {
    console.error(
      "Tournament capacity load failed:",
      capacityResult.error.message
    );
  }

  if (registrationResult.error) {
    console.error(
      "Tournament registrations load failed:",
      registrationResult.error.message
    );
  }

  if (generatedBracketResult.error) {
    console.error(
      "Generated tournament brackets load failed:",
      generatedBracketResult.error.message
    );
  }

  const registrations = (registrationResult.data ?? []) as {
    id: string;
    clerk_user_id: string;
    tournament_id: string;
    tournament_bracket_id: string;
    player_name: string;
    country: string | null;
    submitted_elo: number | null;
    registration_status:
      | "pending"
      | "manual_review"
      | "approved"
      | "rejected"
      | "waitlisted";
    admin_notes: string | null;
    created_at: string | null;
  }[];
  const referencedRegistrationIds = getGeneratedBracketRegistrationIds(
    generatedBracketResult.data ?? []
  );
  const bracketRegistrations = registrations.filter(
    (registration) =>
      registration.registration_status === "approved" ||
      referencedRegistrationIds.has(registration.id)
  );
  const viewerRegistrationIds = bracketRegistrations
    .filter((registration) => registration.clerk_user_id === userId)
    .map((registration) => registration.id);
  const playerIds = [
    ...new Set(
      bracketRegistrations.map((registration) => registration.clerk_user_id)
    ),
  ];
  const playerResult =
    playerIds.length > 0
      ? await supabase
          .from("players")
          .select("clerk_user_id, in_game_name, country, current_elo")
          .in("clerk_user_id", playerIds)
      : { data: [], error: null };

  if (playerResult.error) {
    console.error(
      "Bracket participant profiles load failed:",
      playerResult.error.message
    );
  }

  const playersByClerkId = new Map(
    (
      (playerResult.data ?? []) as {
        clerk_user_id: string;
        in_game_name: string;
        country: string | null;
        current_elo: number;
      }[]
    ).map((player) => [player.clerk_user_id, player])
  );

  const capacityByBracket = new Map(
    (
      (capacityResult.data ?? []) as {
        bracket_id: string;
        registered_players: number;
        waitlisted_players: number;
      }[]
    ).map((capacity) => [
      capacity.bracket_id,
      {
        registeredPlayers: capacity.registered_players,
        waitlistedPlayers: capacity.waitlisted_players,
      },
    ])
  );
  const tournamentRows = (tournamentResult.data ?? []) as TournamentRow[];

  for (const tournament of tournamentRows) {
    for (const bracket of tournament.tournament_brackets ?? []) {
      const capacity = capacityByBracket.get(bracket.id);
      bracket.registered_players = capacity?.registeredPlayers ?? 0;
      bracket.waitlisted_players = capacity?.waitlistedPlayers ?? 0;
    }
  }

  const bracketNames = new Map(
    tournamentRows.flatMap((tournament) =>
      (tournament.tournament_brackets ?? []).map((bracket) => [
        bracket.id,
        getTournamentBracketDisplayName(bracket.name),
      ])
    )
  );
  const waitlistPositionByRegistration =
    buildWaitlistPositionMap(registrations);
  const viewerRegistrations = userId
    ? registrations
        .filter((registration) => registration.clerk_user_id === userId)
        .map((registration) => ({
          id: registration.id,
          tournamentId: registration.tournament_id,
          tournamentBracketId: registration.tournament_bracket_id,
          bracketName:
            bracketNames.get(registration.tournament_bracket_id) ??
            "Tournament Bracket",
          status: registration.registration_status,
          adminNotes:
            registration.registration_status === "rejected"
              ? registration.admin_notes
              : null,
          createdAt: registration.created_at,
          waitlistPosition:
            registration.registration_status === "waitlisted"
              ? waitlistPositionByRegistration.get(registration.id) ?? null
              : null,
        }))
    : [];
  const participantsByTournament = new Map<string, TournamentParticipant[]>();
  const bracketParticipantsByTournament = new Map<
    string,
    TournamentParticipant[]
  >();

  for (const registration of bracketRegistrations) {
    const player = playersByClerkId.get(registration.clerk_user_id);

    const participant: TournamentParticipant = {
      registrationId: registration.id,
      name: player?.in_game_name || registration.player_name,
      country: player?.country || registration.country || "N/A",
      elo: player?.current_elo ?? registration.submitted_elo ?? 0,
      status: registration.registration_status,
      bracketId: registration.tournament_bracket_id,
      bracketName:
        bracketNames.get(registration.tournament_bracket_id) ??
        "Tournament Bracket",
    };
    const bracketParticipants =
      bracketParticipantsByTournament.get(registration.tournament_id) ?? [];
    bracketParticipants.push(participant);
    bracketParticipantsByTournament.set(
      registration.tournament_id,
      bracketParticipants
    );

    if (registration.registration_status === "approved") {
      const participants =
        participantsByTournament.get(registration.tournament_id) ?? [];
      participants.push(participant);
      participantsByTournament.set(registration.tournament_id, participants);
    }
  }

  const generatedByTournament = mapGeneratedBrackets(
    generatedBracketResult.data ?? [],
    tournamentRows
  );
  const tournaments = tournamentRows.map((row) => {
    const tournament = mapTournamentRow(row);
    tournament.participants = participantsByTournament.get(row.id) ?? [];
    tournament.bracketParticipants =
      bracketParticipantsByTournament.get(row.id) ?? [];
    tournament.generatedBrackets = generatedByTournament.get(row.id) ?? [];
    tournament.players = tournament.participants.length;
    return tournament;
  });
  tournaments.sort(compareTournamentCards);
  const matchResultData = await loadMatchResultData();

  if (tournaments.length === 0) {
    return (
      <main
        className="min-h-screen bg-black bg-cover bg-center px-6 pt-32 text-white"
        style={{
          backgroundImage:
            "linear-gradient(180deg,rgba(0,0,0,0.9),rgba(0,0,0,0.76) 44%,rgba(0,0,0,0.94)),linear-gradient(110deg,rgba(0,0,0,0.94),rgba(0,0,0,0.62),rgba(249,115,22,0.12),rgba(0,0,0,0.92)),url('/images/sfondi/4.jpg')",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
        }}
      >
        <div className="relative z-10 mx-auto max-w-3xl border border-orange-500/30 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86))] p-10 text-center shadow-2xl shadow-black/30 backdrop-blur">
          <h1 className="text-3xl font-black">No Tournaments Published</h1>
          <p className="mt-4 text-zinc-400">
            Tournament data will appear here after an administrator publishes
            an event.
          </p>
        </div>
      </main>
    );
  }

  return (
    <TournamentsExperience
      tournaments={tournaments}
      viewer={{
        isAdmin,
        registrationIds: viewerRegistrationIds,
        registrations: viewerRegistrations,
      }}
      matchResultSubmissions={matchResultData.submissions}
      matchResultReportGroups={matchResultData.reportGroups}
      eloVerificationEnabled={eloVerificationSetting.enabled}
    />
  );
}

function buildWaitlistPositionMap(
  registrations: {
    id: string;
    tournament_bracket_id: string;
    registration_status: string;
    created_at: string | null;
  }[]
) {
  const positions = new Map<string, number>();
  const byBracket = registrations.reduce((groups, registration) => {
    if (registration.registration_status !== "waitlisted") {
      return groups;
    }

    const group = groups.get(registration.tournament_bracket_id) ?? [];
    group.push(registration);
    groups.set(registration.tournament_bracket_id, group);
    return groups;
  }, new Map<string, typeof registrations>());

  for (const group of byBracket.values()) {
    group
      .slice()
      .sort((left, right) => {
        const leftTime = new Date(left.created_at ?? "").getTime();
        const rightTime = new Date(right.created_at ?? "").getTime();

        return (
          (Number.isFinite(leftTime) ? leftTime : 0) -
            (Number.isFinite(rightTime) ? rightTime : 0) ||
          left.id.localeCompare(right.id)
        );
      })
      .forEach((registration, index) => {
        positions.set(registration.id, index + 1);
      });
  }

  return positions;
}

function compareTournamentCards(
  left: ReturnType<typeof mapTournamentRow>,
  right: ReturnType<typeof mapTournamentRow>
) {
  const leftHistorical = left.statusValue === "completed" ? 1 : 0;
  const rightHistorical = right.statusValue === "completed" ? 1 : 0;

  if (leftHistorical !== rightHistorical) {
    return leftHistorical - rightHistorical;
  }

  return getTournamentSortTime(right) - getTournamentSortTime(left);
}

function getTournamentSortTime(tournament: ReturnType<typeof mapTournamentRow>) {
  const dateValue = tournament.grandFinalAt ?? tournament.createdAt;
  const timestamp = new Date(dateValue).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}
