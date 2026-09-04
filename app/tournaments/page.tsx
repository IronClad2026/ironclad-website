import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import TournamentsExperience from "@/components/TournamentsExperience";
import { loadEffectiveRegistrationDocumentSet } from "@/lib/legal-documents";
import { loadTournamentPollsForRequest } from "@/lib/player-polls";
import { loadMatchResultData } from "@/lib/match-result-data";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isActiveReviewCohortStatus } from "@/lib/tournament-registration-cohort";
import {
  mapTournamentMediaAdminItem,
  parseTournamentMediaDatabaseRow,
  sortTournamentMediaNewestFirst,
  type TournamentMediaItem,
} from "@/lib/tournament-media";
import {
  groupPublicTournamentMapPoolEntries,
  projectPublishedTournamentMapPools,
  type PublicTournamentMapPoolEntryDatabaseRow,
} from "@/lib/tournament-map-pools";
import {
  getGeneratedBracketRegistrationIds,
  loadGeneratedBracketPageRows,
  mapGeneratedBrackets,
} from "@/lib/tournament-bracket-data";
import { loadTournamentDivisionStates } from "@/lib/tournament-division-state-data";
import {
  getTournamentEventSection,
  projectPublicTournamentDivisionStates,
} from "@/lib/tournament-division-state";
import {
  getTournamentBracketDisplayName,
  getPublicTournamentRowsForRequest,
  isTournamentBracketPublic,
  mapPublicTournamentParticipant,
  mapTournamentRow,
  type TournamentParticipant,
  type TournamentRow,
} from "@/lib/tournaments";
import { loadDictionary } from "@/lib/i18n/loaders";
import { getRequestLocale } from "@/lib/i18n/request";
import { translate } from "@/lib/i18n/translate";
import type { MessageValues } from "@/lib/i18n/types";

export const dynamic = "force-dynamic";

type RelicVerifiedDivision = "Academy" | "Challenge" | "Main / Pro";

type TournamentsPageProps = {
  searchParams?: Promise<{
    tournament?: string | string[];
  }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const dictionary = await loadDictionary(locale, "competition");

  return {
    title: translate(dictionary, "metadata.title"),
    description: translate(dictionary, "metadata.description"),
  };
}

function normalizeRelicVerifiedDivision(
  value: unknown
): RelicVerifiedDivision | null {
  return value === "Academy" ||
    value === "Challenge" ||
    value === "Main / Pro"
    ? value
    : null;
}

export default async function TournamentsPage({
  searchParams,
}: TournamentsPageProps) {
  const [{ userId, sessionClaims }, locale] = await Promise.all([
    auth(),
    getRequestLocale(),
  ]);
  const competition = await loadDictionary(locale, "competition");
  const t = (path: string, values?: MessageValues) =>
    translate(competition, path, values);
  const params = await searchParams;
  const isAdmin =
    (
      sessionClaims as {
        metadata?: { role?: string };
      } | null
    )?.metadata?.role === "admin";
  const supabase = createSupabaseAdminClient();
  const viewerDivisionRequest = userId
    ? supabase
        .from("players")
        .select("relic_verified_division")
        .eq("clerk_user_id", userId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [
    tournamentResult,
    capacityResult,
    registrationResult,
    generatedBracketResult,
    notHeldResult,
    viewerDivisionResult,
    registrationDocuments,
  ] = await Promise.all([
    supabase
      .from("tournaments")
      .select(
        "id, slug, title, description, banner_image_url, registration_open_at, registration_close_at, start_date, end_date, status, format, prize_pool, rules_url, battlefy_url, registration_enabled, rule_format, result_confirmation_window_minutes, terminal_at, first_completed_at, created_at, updated_at, tournament_brackets(id, tournament_id, name, elo_rules, max_players, launched_at, map_pool_published_at, created_at, updated_at)"
      )
      .order("created_at", { ascending: false }),
    supabase.rpc("get_tournament_bracket_capacity"),
    supabase
      .from("registrations")
      .select(
        "id, clerk_user_id, tournament_id, tournament_bracket_id, player_name, country, submitted_elo, elo_verified_elo, registration_status, waitlist_offer_status, created_at"
      )
      .not("tournament_id", "is", null)
      .not("tournament_bracket_id", "is", null),
    loadGeneratedBracketPageRows({
      includeAdminAudit: isAdmin,
    }),
    supabase.rpc("get_tournament_division_not_held_states"),
    viewerDivisionRequest,
    loadEffectiveRegistrationDocumentSet(supabase),
  ]);

  if (viewerDivisionResult.error) {
    console.error("Tournament verified division load failed.");
  }

  const relicVerifiedDivision = viewerDivisionResult.error
    ? null
    : normalizeRelicVerifiedDivision(
        (
          viewerDivisionResult.data as {
            relic_verified_division?: unknown;
          } | null
        )?.relic_verified_division
      );

  if (tournamentResult.error) {
    console.error("Tournament list load failed.");
  }

  if (capacityResult.error) {
    console.error("Tournament capacity load failed.");
  }

  if (registrationResult.error) {
    console.error("Tournament registrations load failed.");
  }

  if (generatedBracketResult.error) {
    console.error("Generated tournament brackets load failed.");
  }

  if (notHeldResult.error) {
    console.error("Tournament Division Not Held state load failed.");
  }

  if (
    tournamentResult.error ||
    capacityResult.error ||
    registrationResult.error ||
    generatedBracketResult.error ||
    notHeldResult.error ||
    viewerDivisionResult.error
  ) {
    throw new Error("Tournament data could not be loaded.");
  }

  if (
    !Array.isArray(tournamentResult.data) ||
    !Array.isArray(capacityResult.data) ||
    !Array.isArray(registrationResult.data) ||
    !Array.isArray(generatedBracketResult.data) ||
    !Array.isArray(notHeldResult.data)
  ) {
    console.error("Tournament data load returned an invalid response.");
    throw new Error("Tournament data could not be loaded.");
  }

  const allTournamentRows = tournamentResult.data as TournamentRow[];
  const requestedTournament = getSingleSearchParam(params?.tournament);
  const tournamentRows = getPublicTournamentRowsForRequest(
    allTournamentRows,
    requestedTournament ?? null
  );
  const includedTournamentIds = new Set(
    tournamentRows.map((tournament) => tournament.id)
  );
  const divisionStatesByTournament = await loadTournamentDivisionStates(
    supabase,
    tournamentRows,
    {
      readinessRows: capacityResult.data,
      generatedBracketRows: generatedBracketResult.data,
      notHeldRows: notHeldResult.data,
    }
  );
  const publishedMapPoolBracketIds = tournamentRows.flatMap((tournament) =>
    (tournament.tournament_brackets ?? [])
      .filter((bracket) => bracket.map_pool_published_at !== null)
      .map((bracket) => bracket.id)
  );
  const [mapPoolEntryResult, tournamentMediaResult] = await Promise.all([
    publishedMapPoolBracketIds.length > 0
      ? supabase
          .from("tournament_bracket_map_pool_entries")
          .select(
            "tournament_bracket_id, added_at, removed_at, coh3_maps(id, slug, display_name, source_type, creator_name, game_mode, status, thumbnail_path, source_reference, created_at, updated_at)"
          )
          .in("tournament_bracket_id", publishedMapPoolBracketIds)
          .is("removed_at", null)
          .order("added_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    tournamentRows.length > 0
      ? supabase
          .from("tournament_media")
          .select(
            "id, tournament_id, title, url, media_type, description, match_id, published, created_at, updated_at"
          )
          .in(
            "tournament_id",
            tournamentRows.map((tournament) => tournament.id)
          )
          .eq("published", true)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (mapPoolEntryResult.error) {
    console.error("Published tournament map pools failed to load.");
    throw new Error("Tournament data could not be loaded.");
  }

  if (!Array.isArray(mapPoolEntryResult.data)) {
    console.error("Published tournament map pools returned an invalid response.");
    throw new Error("Tournament data could not be loaded.");
  }

  if (tournamentMediaResult.error) {
    console.error("Published tournament media failed to load.");
    throw new Error("Tournament data could not be loaded.");
  }

  if (!Array.isArray(tournamentMediaResult.data)) {
    console.error("Published tournament media returned an invalid response.");
    throw new Error("Tournament data could not be loaded.");
  }

  const parsedTournamentMedia = [];

  for (const row of tournamentMediaResult.data) {
    const parsed = parseTournamentMediaDatabaseRow(row);

    if (!parsed) {
      console.error("Published tournament media contained an invalid row.");
      throw new Error("Tournament data could not be loaded.");
    }

    parsedTournamentMedia.push(parsed);
  }

  const mediaByTournament = new Map<string, TournamentMediaItem[]>();

  for (const media of sortTournamentMediaNewestFirst(
    parsedTournamentMedia.map(mapTournamentMediaAdminItem)
  )) {
    if (!media.published || !includedTournamentIds.has(media.tournamentId)) {
      continue;
    }

    const items = mediaByTournament.get(media.tournamentId) ?? [];
    items.push({
      id: media.id,
      title: media.title,
      url: media.url,
      mediaType: media.mediaType,
      description: media.description,
    });
    mediaByTournament.set(media.tournamentId, items);
  }

  const mapPoolEntriesByBracket = groupPublicTournamentMapPoolEntries(
    mapPoolEntryResult.data as unknown as PublicTournamentMapPoolEntryDatabaseRow[]
  );
  const publicBracketIds = new Set(
    tournamentRows.flatMap((tournament) =>
      (tournament.tournament_brackets ?? [])
        .filter((bracket) => isTournamentBracketPublic(bracket.launched_at))
        .map((bracket) => bracket.id)
    )
  );
  const publicGeneratedBracketRows = (
    generatedBracketResult.data ?? []
  ).filter((generated) =>
    publicBracketIds.has(generated.tournament_bracket_id)
  );
  const registrations = (
    (registrationResult.data ?? []) as {
      id: string;
      clerk_user_id: string;
      tournament_id: string;
      tournament_bracket_id: string;
      player_name: string;
      country: string | null;
      submitted_elo: number | null;
      elo_verified_elo: number | null;
      registration_status:
        | "pending"
        | "manual_review"
        | "approved"
        | "rejected"
        | "waitlisted"
        | "withdrawn";
      waitlist_offer_status:
        | "offered"
        | "accepted"
        | "declined"
        | "expired"
        | "cancelled"
        | null;
      created_at: string | null;
    }[]
  ).filter((registration) =>
    includedTournamentIds.has(registration.tournament_id)
  );
  const referencedRegistrationIds = getGeneratedBracketRegistrationIds(
    publicGeneratedBracketRows
  );
  const activeCohortCountByBracket = new Map<string, number>();
  const waitlistCountByBracket = new Map<string, number>();

  for (const registration of registrations) {
    if (
      isActiveReviewCohortStatus(registration.registration_status) ||
      (registration.registration_status === "waitlisted" &&
        registration.waitlist_offer_status === "offered")
    ) {
      activeCohortCountByBracket.set(
        registration.tournament_bracket_id,
        (activeCohortCountByBracket.get(
          registration.tournament_bracket_id
        ) ?? 0) + 1
      );
    }

    if (
      registration.registration_status === "waitlisted" &&
      registration.waitlist_offer_status === null
    ) {
      waitlistCountByBracket.set(
        registration.tournament_bracket_id,
        (waitlistCountByBracket.get(registration.tournament_bracket_id) ?? 0) +
          1
      );
    }
  }
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
          .select("clerk_user_id, public_profile_enabled, account_closed_at")
          .in("clerk_user_id", playerIds)
      : { data: [], error: null };

  if (playerResult.error) {
    console.error("Bracket participant profiles load failed.");
    throw new Error("Tournament data could not be loaded.");
  }

  if (!Array.isArray(playerResult.data)) {
    console.error("Bracket participant profiles returned an invalid response.");
    throw new Error("Tournament data could not be loaded.");
  }

  const playersByClerkId = new Map(
    (
      playerResult.data as {
        clerk_user_id: string;
        public_profile_enabled: boolean;
        account_closed_at: string | null;
      }[]
    ).map((player) => [player.clerk_user_id, player])
  );

  const capacityByBracket = new Map(
    (
      (capacityResult.data ?? []) as {
        bracket_id: string;
        registered_players: number;
      }[]
    ).map((capacity) => [
      capacity.bracket_id,
      {
        registeredPlayers: capacity.registered_players,
      },
    ])
  );
  for (const tournament of tournamentRows) {
    for (const bracket of tournament.tournament_brackets ?? []) {
      const capacity = capacityByBracket.get(bracket.id);
      bracket.registered_players = capacity?.registeredPlayers ?? 0;
      bracket.active_cohort_players =
        activeCohortCountByBracket.get(bracket.id) ?? 0;
      bracket.waitlisted_players = waitlistCountByBracket.get(bracket.id) ?? 0;
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
          waitlistOfferStatus: registration.waitlist_offer_status,
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
    publicGeneratedBracketRows,
    tournamentRows
  );
  const tournaments = tournamentRows.map((row) => {
    const divisionStates = divisionStatesByTournament.get(row.id);

    if (!divisionStates) {
      console.error("Tournament division-state projection was missing.");
      throw new Error("Tournament data could not be loaded.");
    }

    const publicDivisionStates = projectPublicTournamentDivisionStates(
      divisionStates
    );
    const notHeldBracketIds = new Set(
      divisionStates.flatMap((division) =>
        division.state === "not_held" && division.bracketId
          ? [division.bracketId]
          : []
      )
    );
    const tournament = mapTournamentRow(
      row,
      { locale, t },
      publicDivisionStates
    );
    tournament.participants = (
      participantsByTournament.get(row.id) ?? []
    ).filter((participant) => !notHeldBracketIds.has(participant.bracketId));
    tournament.bracketParticipants =
      (bracketParticipantsByTournament.get(row.id) ?? []).filter(
        (participant) => !notHeldBracketIds.has(participant.bracketId)
      );
    tournament.generatedBrackets = generatedByTournament.get(row.id) ?? [];
    tournament.media = mediaByTournament.get(row.id) ?? [];
    tournament.mapPools = projectPublishedTournamentMapPools(
      (row.tournament_brackets ?? []).map((bracket) => ({
        id: bracket.id,
        name: bracket.name,
        mapPoolPublishedAt: bracket.map_pool_published_at,
        launchedAt: bracket.launched_at,
        entries: mapPoolEntriesByBracket.get(bracket.id) ?? [],
      }))
    );
    tournament.players = tournament.participants.length;
    return tournament;
  });
  tournaments.sort(compareTournamentCards);

  if (tournaments.length === 0) {
    return <TournamentEmptyState t={t} />;
  }

  const tournamentPolls = await loadTournamentPollsForRequest(
    tournaments.map((tournament) => tournament.id),
    Boolean(userId)
  );
  const matchResultData = await loadMatchResultData();

  if (
    matchResultData.error ||
    !Array.isArray(matchResultData.submissions) ||
    !Array.isArray(matchResultData.reportGroups)
  ) {
    throw new Error("Tournament Match data could not be loaded.");
  }

  const includedMatchIds = new Set(
    tournaments.flatMap((tournament) =>
      tournament.generatedBrackets.flatMap((bracket) =>
        bracket.matches.map((match) => match.id)
      )
    )
  );

  return (
    <TournamentsExperience
      tournaments={tournaments}
      tournamentPollsByTournament={tournamentPolls.pollsByTournament}
      pollLoadError={tournamentPolls.error}
      viewer={{
        isAdmin,
        relicVerifiedDivision,
        registrationIds: viewerRegistrationIds,
        registrations: viewerRegistrations,
      }}
      registrationDocuments={registrationDocuments}
      matchResultSubmissions={matchResultData.submissions.filter((submission) =>
        includedMatchIds.has(submission.matchId)
      )}
      matchResultReportGroups={matchResultData.reportGroups.filter(
        (reportGroup) => includedMatchIds.has(reportGroup.matchId)
      )}
      eloVerificationEnabled={true}
    />
  );
}

function TournamentEmptyState({
  t,
}: {
  t: (path: string, values?: MessageValues) => string;
}) {
  return (
    <main
      className="min-h-screen bg-black bg-cover bg-center bg-fixed px-6 pt-32 text-white"
      style={{
        backgroundImage:
          "linear-gradient(180deg,rgba(0,0,0,0.9),rgba(0,0,0,0.76) 44%,rgba(0,0,0,0.94)),linear-gradient(110deg,rgba(0,0,0,0.94),rgba(0,0,0,0.62),rgba(249,115,22,0.12),rgba(0,0,0,0.92)),url('/images/sfondi/4.jpg')",
        backgroundAttachment: "fixed",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <div className="mx-auto max-w-3xl border border-orange-500/30 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(8,8,8,0.86))] p-10 text-center shadow-2xl shadow-black/30 backdrop-blur">
        <h1 className="text-3xl font-black">{t("emptyState.title")}</h1>
        <p className="mt-4 text-zinc-400">{t("emptyState.description")}</p>
      </div>
    </main>
  );
}

function getSingleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildWaitlistPositionMap(
  registrations: {
    id: string;
    tournament_bracket_id: string;
    registration_status: string;
    waitlist_offer_status: string | null;
    created_at: string | null;
  }[]
) {
  const positions = new Map<string, number>();
  const byBracket = registrations.reduce((groups, registration) => {
    if (
      registration.registration_status !== "waitlisted" ||
      registration.waitlist_offer_status !== null
    ) {
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
  const sectionOrder = {
    in_competition: 0,
    open: 1,
    resolved: 2,
  } as const;
  const leftSection = getTournamentEventSection(left.divisionStates);
  const rightSection = getTournamentEventSection(right.divisionStates);
  const sectionDifference =
    sectionOrder[leftSection] - sectionOrder[rightSection];

  if (sectionDifference !== 0) {
    return sectionDifference;
  }

  const timeDifference =
    getTournamentSortTime(right, rightSection) -
    getTournamentSortTime(left, leftSection);

  return timeDifference || left.id.localeCompare(right.id);
}

function getTournamentSortTime(
  tournament: ReturnType<typeof mapTournamentRow>,
  section: ReturnType<typeof getTournamentEventSection>
) {
  const dateValue =
    section === "resolved"
      ? tournament.terminalAt ??
        tournament.firstCompletedAt ??
        tournament.createdAt
      : tournament.createdAt;
  const timestamp = new Date(dateValue).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}
