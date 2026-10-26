import "server-only";

import {
  getDivisionDisplayName,
  requireDivisionModelVersion,
  type DivisionModelVersion,
} from "@/lib/division-model";
import { isActiveReviewCohortStatus } from "@/lib/tournament-registration-cohort";
import {
  getEffectiveTournamentDivisionState,
  resolveTournamentDivisionStates,
  type EffectiveTournamentDivisionState,
  type TournamentDivisionState,
} from "@/lib/tournament-division-state";
import {
  getTournamentRegistrationAvailability,
  mapPublicTournamentParticipant,
  parseEloEligibilityRule,
  type TournamentBracketName,
  type TournamentParticipant,
  type TournamentStatus,
} from "@/lib/tournaments";
import {
  COMPETITION_READ_LIMITS,
  COMPETITION_SCHEMA_VERSION,
  IRONCLAD_PUBLIC_ORIGIN,
  CompetitionReadError,
  type CompetitionReadClient,
} from "@/lib/competition-read-models/shared";

export type CompetitionParticipant = {
  registrationId: string;
  eventAlias: string;
  eventElo: number | null;
  registrationStatus: TournamentParticipant["status"];
  profileUrl: string | null;
};

export type CompetitionMatch = {
  id: string;
  roundNumber: number;
  roundName: string;
  matchNumber: number;
  bestOf: number;
  status: "scheduled" | "in_progress" | "pending_review" | "completed";
  outcomeType:
    | "automatic_bye"
    | "empty_feeder"
    | "deadline_double_forfeit"
    | null;
  playerOneRegistrationId: string | null;
  playerTwoRegistrationId: string | null;
  playerOneScore: number | null;
  playerTwoScore: number | null;
  winnerRegistrationId: string | null;
  completed: boolean;
  played: boolean;
  decidedAt: string | null;
};

export type CompetitionPlacement = {
  registrationId: string;
  rank: number | null;
  wins: number;
  losses: number;
  points: number;
};

export type DivisionCompetitionView = {
  id: string | null;
  canonicalName: TournamentBracketName;
  displayName: string;
  state: TournamentDivisionState;
  effectiveState: EffectiveTournamentDivisionState;
  approvedCount: number | null;
  capacity: number | null;
  ready: boolean;
  capacityReached: boolean;
  bracketGenerated: boolean;
  bracketPublished: boolean;
  launchedAt: string | null;
  registrationOpen: boolean;
  eloRule: string | null;
  eloRange: ReturnType<typeof parseEloEligibilityRule>;
  participants: CompetitionParticipant[];
  bracket: {
    id: string;
    format: "single_elimination" | "round_robin";
    completed: boolean;
    matches: CompetitionMatch[];
    placements: CompetitionPlacement[];
    championRegistrationId: string | null;
  } | null;
};

export type TournamentCompetitionView = {
  schemaVersion: typeof COMPETITION_SCHEMA_VERSION;
  id: string;
  slug: string;
  name: string;
  divisionModelVersion: DivisionModelVersion;
  status: TournamentStatus;
  format: "1v1" | "2v2" | "4v4";
  // IronClad's tournament schema has no game field. This is the actual platform game.
  game: "Company of Heroes 3";
  publicUrl: string;
  registration: {
    open: boolean;
    enabled: boolean;
    opensAt: string | null;
    closesAt: string | null;
    availability: ReturnType<typeof getTournamentRegistrationAvailability>;
  };
  startDate: string | null;
  endDate: string | null;
  firstCompletedAt: string | null;
  approvedPlayers: number;
  divisions: DivisionCompetitionView[];
};

type Row = Record<string, unknown>;
type Tournament = {
  id: string;
  slug: string;
  title: string;
  division_model_version: DivisionModelVersion;
  status: TournamentStatus;
  format: TournamentCompetitionView["format"];
  registration_enabled: boolean;
  registration_open_at: string | null;
  registration_close_at: string | null;
  start_date: string | null;
  end_date: string | null;
  first_completed_at: string | null;
};
type Division = {
  id: string;
  tournament_id: string;
  name: TournamentBracketName;
  elo_rules: string;
  max_players: number;
  launched_at: string | null;
};
type Registration = {
  id: string;
  profile_id: string | null;
  tournament_id: string;
  tournament_bracket_id: string;
  player_name: string;
  country: string | null;
  submitted_elo: number | null;
  elo_verified_elo: number | null;
  registration_status: TournamentParticipant["status"];
  waitlist_offer_status: string | null;
};
type Generated = {
  id: string;
  tournament_bracket_id: string;
  format: "single_elimination" | "round_robin";
  slot_count: number;
};
type Round = {
  id: string;
  generated_bracket_id: string;
  round_number: number;
  name: string;
};
type Match = Omit<
  CompetitionMatch,
  "roundNumber" | "roundName" | "played" | "completed"
> & {
  generatedBracketId: string;
  roundId: string;
};
type Privacy = {
  id: string;
  public_profile_enabled: boolean;
  account_closed_at: string | null;
};
type Closure = {
  tournament_bracket_id: string;
  closed_at: string;
  reason_code: "minimum_roster_not_reached";
};
type Standing = CompetitionPlacement & { generatedBracketId: string };

export type TournamentCompetitionSnapshot = {
  tournaments: readonly Tournament[];
  divisions: readonly Division[];
  registrations: readonly Registration[];
  generatedBrackets: readonly Generated[];
  rounds: readonly Round[];
  matches: readonly Match[];
  standings: readonly Standing[];
  privacy: readonly Privacy[];
  closures: readonly Closure[];
  factualNoShowMatchIds: ReadonlySet<string>;
};

const MAX_TOURNAMENTS = COMPETITION_READ_LIMITS.tournaments;
const SENTINEL_LIMIT = COMPETITION_READ_LIMITS.rows + 1;
const TOURNAMENT_SELECT =
  "id,slug,title,division_model_version,status,format,registration_enabled,registration_open_at,registration_close_at,start_date,end_date,first_completed_at";
const DIVISION_SELECT =
  "id,tournament_id,name,elo_rules,max_players,launched_at";
const REGISTRATION_SELECT =
  "id,profile_id,tournament_id,tournament_bracket_id,player_name,country,submitted_elo,elo_verified_elo,registration_status,waitlist_offer_status";
const MATCH_SELECT =
  "id,generated_bracket_id,round_id,match_number,series_best_of,status,outcome_type,player_one_registration_id,player_two_registration_id,player_one_score,player_two_score,winner_registration_id,official_result_decided_at";

/** Bounded internal selector. No request authentication, lifecycle RPC or write path. */
export async function loadTournamentCompetitionViews(
  client: CompetitionReadClient,
  tournamentIds: readonly string[],
  options: { now?: number } = {},
): Promise<TournamentCompetitionView[]> {
  if (!Array.isArray(tournamentIds)) fail();
  const ids = [...new Set(tournamentIds)];
  if (
    tournamentIds.length > MAX_TOURNAMENTS ||
    ids.some((id) => !validUuid(id))
  )
    fail();
  if (ids.length === 0) return [];
  const tournaments = (
    await rows(
      client
        .from("tournaments")
        .select(TOURNAMENT_SELECT, { count: "exact" })
        .in("id", ids)
        .limit(SENTINEL_LIMIT),
    )
  ).map(parseTournament);
  if (tournaments.some((row) => !ids.includes(row.id))) fail();
  if (tournaments.length === 0) return [];
  return loadSnapshot(client, tournaments, options);
}

export async function loadTournamentCompetitionView(
  client: CompetitionReadClient,
  slug: string,
  options: { now?: number } = {},
): Promise<TournamentCompetitionView | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) fail();
  const tournaments = (
    await rows(
      client
        .from("tournaments")
        .select(TOURNAMENT_SELECT, { count: "exact" })
        .eq("slug", slug)
        .limit(2),
    )
  ).map(parseTournament);
  if (tournaments.length > 1 || tournaments.some((row) => row.slug !== slug))
    fail();
  return tournaments.length === 0
    ? null
    : (await loadSnapshot(client, tournaments, options))[0];
}

async function loadSnapshot(
  client: CompetitionReadClient,
  tournaments: Tournament[],
  options: { now?: number },
) {
  const ids = tournaments.map((row) => row.id);
  const [divisionRows, registrationRows] = await Promise.all([
    rows(
      client
        .from("tournament_brackets")
        .select(DIVISION_SELECT, { count: "exact" })
        .in("tournament_id", ids)
        .limit(SENTINEL_LIMIT),
    ),
    rows(
      client
        .from("registrations")
        .select(REGISTRATION_SELECT, { count: "exact" })
        .in("tournament_id", ids)
        .limit(SENTINEL_LIMIT),
    ),
  ]);
  const divisions = divisionRows.map(parseDivision);
  const registrations = registrationRows.map(parseRegistration);
  const divisionIds = divisions.map((row) => row.id);
  const playerIds = [
    ...new Set(
      registrations.flatMap((row) => (row.profile_id ? [row.profile_id] : [])),
    ),
  ];
  const [generatedRows, closureRows] = await Promise.all([
    divisionIds.length
      ? rows(
          client
            .from("generated_brackets")
            .select("id,tournament_bracket_id,format,slot_count", {
              count: "exact",
            })
            .in("tournament_bracket_id", divisionIds)
            .limit(SENTINEL_LIMIT),
        )
      : [],
    divisionIds.length
      ? rows(
          client
            .from("tournament_division_not_held_closures")
            .select("tournament_bracket_id,closed_at,reason_code", {
              count: "exact",
            })
            .in("tournament_bracket_id", divisionIds)
            .limit(SENTINEL_LIMIT),
        )
      : [],
  ]);
  const generatedBrackets = generatedRows.map(parseGenerated);
  const launchedIds = new Set(
    divisions.filter((row) => row.launched_at !== null).map((row) => row.id),
  );
  const publishedGeneratedIds = generatedBrackets
    .filter((row) => launchedIds.has(row.tournament_bracket_id))
    .map((row) => row.id);
  const [roundRows, matchRows, standingRows] = await Promise.all([
    publishedGeneratedIds.length
      ? rows(
          client
            .from("bracket_rounds")
            .select("id,generated_bracket_id,round_number,name", {
              count: "exact",
            })
            .in("generated_bracket_id", publishedGeneratedIds)
            .limit(SENTINEL_LIMIT),
        )
      : [],
    publishedGeneratedIds.length
      ? rows(
          client
            .from("tournament_matches")
            .select(MATCH_SELECT, { count: "exact" })
            .in("generated_bracket_id", publishedGeneratedIds)
            .limit(SENTINEL_LIMIT),
        )
      : [],
    publishedGeneratedIds.length
      ? rows(
          client
            .from("tournament_standings")
            .select(
              "generated_bracket_id,registration_id,rank,wins,losses,points",
              { count: "exact" },
            )
            .in("generated_bracket_id", publishedGeneratedIds)
            .limit(SENTINEL_LIMIT),
        )
      : [],
  ]);
  const matches = matchRows.map(parseMatch);
  const matchIds = matches.map((row) => row.id);
  // Read current visibility/closure at the final read boundary, not from an
  // earlier roster snapshot. No privacy cache is introduced by this module.
  const [reports, privacyRows] = await Promise.all([
    matchIds.length
      ? rows(
          client
            .from("match_result_report_groups")
            .select("match_id,result_type,finalized_at,status,no_show_status", {
              count: "exact",
            })
            .in("match_id", matchIds)
            .eq("result_type", "no_show")
            .limit(SENTINEL_LIMIT),
        )
      : [],
    playerIds.length
      ? rows(
          client
            .from("players")
            .select("id,public_profile_enabled,account_closed_at", {
              count: "exact",
            })
            .in("id", playerIds)
            .limit(SENTINEL_LIMIT),
        )
      : [],
  ]);
  const factualNoShowMatchIds = new Set<string>();
  for (const report of reports) {
    const matchId = string(report.match_id);
    if (!matchIds.includes(matchId) || report.result_type !== "no_show") fail();
    // Exact factual predicate shared by Career History and isFactualNoShow;
    // avoid fetching unrelated private report fields merely to satisfy its broad type.
    const status = enumValue(report.status, [
      "pending",
      "approved",
      "rejected",
      "resubmission_requested",
      "pending_confirmation",
      "confirmed",
      "auto_approved",
      "disputed",
      "under_review",
      "reset",
    ] as const);
    const noShowStatus =
      report.no_show_status === null
        ? null
        : enumValue(report.no_show_status, [
            "pending",
            "confirmed",
            "disputed",
            "approved",
            "rejected",
            "auto_confirmed",
          ] as const);
    if (
      nullableTime(report.finalized_at) !== null &&
      ["confirmed", "auto_approved", "approved"].includes(status) &&
      ["confirmed", "auto_confirmed", "approved"].includes(noShowStatus ?? "")
    )
      factualNoShowMatchIds.add(matchId);
  }
  return mapTournamentCompetitionViews(
    {
      tournaments,
      divisions,
      registrations,
      generatedBrackets,
      rounds: roundRows.map(parseRound),
      matches,
      standings: standingRows.map(parseStanding),
      privacy: privacyRows.map(parsePrivacy),
      closures: closureRows.map(parseClosure),
      factualNoShowMatchIds,
    },
    options,
  );
}

/** Pure allow-list projection; raw snapshot records are never spread into a DTO. */
export function mapTournamentCompetitionViews(
  snapshot: TournamentCompetitionSnapshot,
  options: { now?: number } = {},
): TournamentCompetitionView[] {
  const now = options.now ?? Date.now();
  if (!Number.isFinite(now) || snapshot.tournaments.length > MAX_TOURNAMENTS)
    fail();
  for (const values of [
    snapshot.divisions,
    snapshot.registrations,
    snapshot.generatedBrackets,
    snapshot.rounds,
    snapshot.matches,
    snapshot.standings,
    snapshot.privacy,
    snapshot.closures,
  ])
    if (values.length >= SENTINEL_LIMIT) fail();
  const tournaments = unique(snapshot.tournaments);
  const divisions = unique(snapshot.divisions);
  const registrations = unique(snapshot.registrations);
  const generated = unique(snapshot.generatedBrackets);
  const rounds = unique(snapshot.rounds);
  unique(snapshot.matches);
  const privacy = unique(snapshot.privacy);
  const byDivision = new Map<string, Generated>();
  for (const division of divisions.values()) {
    const tournament = tournaments.get(division.tournament_id);
    if (
      !tournament ||
      !getDivisionDisplayName(tournament.division_model_version, division.name)
    )
      fail();
  }
  for (const registration of registrations.values()) {
    if (
      divisions.get(registration.tournament_bracket_id)?.tournament_id !==
      registration.tournament_id
    )
      fail();
    if (
      registration.profile_id !== null &&
      !privacy.has(registration.profile_id)
    )
      fail();
  }
  for (const bracket of generated.values()) {
    if (
      !divisions.has(bracket.tournament_bracket_id) ||
      byDivision.has(bracket.tournament_bracket_id)
    )
      fail();
    byDivision.set(bracket.tournament_bracket_id, bracket);
  }
  const roundCoordinates = new Set<string>();
  for (const round of rounds.values()) {
    const coordinate = `${round.generated_bracket_id}:${round.round_number}`;
    if (
      !generated.has(round.generated_bracket_id) ||
      !divisions.get(
        generated.get(round.generated_bracket_id)!.tournament_bracket_id,
      )?.launched_at ||
      roundCoordinates.has(coordinate)
    )
      fail();
    roundCoordinates.add(coordinate);
  }
  const matchCoordinates = new Set<string>();
  for (const match of snapshot.matches) {
    const bracket = generated.get(match.generatedBracketId);
    if (
      !bracket ||
      rounds.get(match.roundId)?.generated_bracket_id !== bracket.id ||
      !divisions.get(bracket.tournament_bracket_id)?.launched_at
    )
      fail();
    const coordinate = `${match.generatedBracketId}:${rounds.get(match.roundId)!.round_number}:${match.matchNumber}`;
    if (matchCoordinates.has(coordinate)) fail();
    matchCoordinates.add(coordinate);
    const participants = [
      match.playerOneRegistrationId,
      match.playerTwoRegistrationId,
    ].filter((id): id is string => id !== null);
    if (
      new Set(participants).size !== participants.length ||
      participants.some(
        (id) =>
          registrations.get(id)?.tournament_bracket_id !==
          bracket.tournament_bracket_id,
      ) ||
      (match.winnerRegistrationId !== null &&
        !participants.includes(match.winnerRegistrationId))
    )
      fail();
  }
  const standingCoordinates = new Set<string>();
  for (const standing of snapshot.standings) {
    const bracket = generated.get(standing.generatedBracketId);
    const coordinate = `${standing.generatedBracketId}:${standing.registrationId}`;
    if (
      !bracket ||
      registrations.get(standing.registrationId)?.tournament_bracket_id !==
        bracket.tournament_bracket_id ||
      !divisions.get(bracket.tournament_bracket_id)?.launched_at ||
      standingCoordinates.has(coordinate)
    )
      fail();
    standingCoordinates.add(coordinate);
  }
  const closures = new Map<string, Closure>();
  for (const closure of snapshot.closures) {
    if (
      !divisions.has(closure.tournament_bracket_id) ||
      closures.has(closure.tournament_bracket_id)
    )
      fail();
    closures.set(closure.tournament_bracket_id, closure);
  }
  return [...tournaments.values()].map((tournament) => {
    const eventDivisions = [...divisions.values()].filter(
      (row) => row.tournament_id === tournament.id,
    );
    const availability = getTournamentRegistrationAvailability(
      {
        statusValue: tournament.status,
        registrationEnabled: tournament.registration_enabled,
        registrationOpenAt: tournament.registration_open_at,
        registrationCloseAt: tournament.registration_close_at,
      },
      now,
    );
    const states = resolveTournamentDivisionStates({
      tournamentId: tournament.id,
      divisionModelVersion: tournament.division_model_version,
      eventStatus: tournament.status,
      divisions: eventDivisions.map((division) => {
        const roster = snapshot.registrations.filter(
          (row) => row.tournament_bracket_id === division.id,
        );
        const approvedCount = roster.filter(
          (row) => row.registration_status === "approved",
        ).length;
        const active = roster.filter(
          (row) =>
            isActiveReviewCohortStatus(row.registration_status) ||
            (row.registration_status === "waitlisted" &&
              row.waitlist_offer_status === "offered"),
        ).length;
        const requiredCount = Math.min(division.max_players, 8);
        const bracket = byDivision.get(division.id);
        const matches = snapshot.matches.filter(
          (row) => row.generatedBracketId === bracket?.id,
        );
        return {
          canonicalName: division.name,
          bracketId: division.id,
          approvedCount,
          requiredCount,
          isReady: approvedCount === requiredCount && active === approvedCount,
          launchedAt: division.launched_at,
          generatedBracketId: bracket?.id ?? null,
          isCompetitionComplete:
            division.launched_at !== null && bracket
              ? isComplete(bracket, matches, rounds)
              : false,
          notHeldAt: closures.get(division.id)?.closed_at ?? null,
          notHeldReasonCode: closures.get(division.id)?.reason_code ?? null,
        };
      }),
    });
    return {
      schemaVersion: COMPETITION_SCHEMA_VERSION,
      id: tournament.id,
      slug: tournament.slug,
      name: tournament.title,
      divisionModelVersion: tournament.division_model_version,
      status: tournament.status,
      format: tournament.format,
      game: "Company of Heroes 3",
      publicUrl: `${IRONCLAD_PUBLIC_ORIGIN}/tournaments?tournament=${encodeURIComponent(tournament.slug)}`,
      registration: {
        open:
          availability === "open" &&
          states.some(
            (state) =>
              state.bracketId !== null &&
              state.launchedAt === null &&
              state.state !== "not_held",
          ),
        enabled: tournament.registration_enabled,
        opensAt: tournament.registration_open_at,
        closesAt: tournament.registration_close_at,
        availability,
      },
      startDate: tournament.start_date,
      endDate: tournament.end_date,
      firstCompletedAt: tournament.first_completed_at,
      approvedPlayers: states.reduce(
        (total, state) => total + (state.approvedCount ?? 0),
        0,
      ),
      divisions: states.map((state): DivisionCompetitionView => {
        const division = state.bracketId
          ? divisions.get(state.bracketId)
          : null;
        const bracket = division?.launched_at
          ? byDivision.get(division.id)
          : undefined;
        const matchRows = snapshot.matches.filter(
          (row) => row.generatedBracketId === bracket?.id,
        );
        const standings = snapshot.standings.filter(
          (row) => row.generatedBracketId === bracket?.id,
        );
        const referenced = new Set([
          ...matchRows.flatMap((row) => [
            row.playerOneRegistrationId,
            row.playerTwoRegistrationId,
          ]),
          ...standings.map((row) => row.registrationId),
        ]);
        const participants = snapshot.registrations
          .filter(
            (row) =>
              row.tournament_bracket_id === division?.id &&
              (row.registration_status === "approved" ||
                referenced.has(row.id)),
          )
          .map((row) => {
            const player = row.profile_id ? privacy.get(row.profile_id) : null;
            const participant = mapPublicTournamentParticipant(
              {
                registrationId: row.id,
                playerName: row.player_name,
                country: row.country,
                submittedElo: row.submitted_elo,
                verifiedElo: row.elo_verified_elo,
                status: row.registration_status,
                bracketId: row.tournament_bracket_id,
                bracketName: division!.name,
              },
              player
                ? {
                    playerId: player.id,
                    publicProfileEnabled: player.public_profile_enabled,
                    accountClosedAt: player.account_closed_at,
                  }
                : null,
            );
            return {
              registrationId: participant.registrationId,
              eventAlias: participant.name,
              eventElo: participant.elo,
              registrationStatus: participant.status,
              profileUrl: participant.profileHref
                ? IRONCLAD_PUBLIC_ORIGIN + participant.profileHref
                : null,
            };
          });
        return {
          id: state.bracketId,
          canonicalName: state.canonicalName,
          displayName: division
            ? getDivisionDisplayName(
                tournament.division_model_version,
                division.name,
              )!
            : getDivisionDisplayName(
                tournament.division_model_version,
                state.canonicalName,
              )!,
          state: state.state,
          effectiveState: getEffectiveTournamentDivisionState(state),
          approvedCount: state.approvedCount,
          capacity: state.requiredCount,
          ready: state.isReady,
          capacityReached:
            division != null &&
            state.requiredCount !== null &&
            snapshot.registrations.filter(
              (row) =>
                row.tournament_bracket_id === division.id &&
                (isActiveReviewCohortStatus(row.registration_status) ||
                  (row.registration_status === "waitlisted" &&
                    row.waitlist_offer_status === "offered")),
            ).length >= state.requiredCount,
          bracketGenerated: division != null && byDivision.has(division.id),
          bracketPublished: bracket != null,
          launchedAt: state.launchedAt,
          registrationOpen:
            availability === "open" &&
            division != null &&
            state.launchedAt === null &&
            state.state !== "not_held",
          eloRule: division?.elo_rules ?? null,
          eloRange: division
            ? parseEloEligibilityRule(division.elo_rules)
            : null,
          participants,
          bracket: bracket
            ? {
                id: bracket.id,
                format: bracket.format,
                completed: state.isCompetitionComplete,
                matches: matchRows
                  .map((row) => {
                    const round = rounds.get(row.roundId)!;
                    return {
                      id: row.id,
                      roundNumber: round.round_number,
                      roundName: round.name,
                      matchNumber: row.matchNumber,
                      bestOf: row.bestOf,
                      status: row.status,
                      outcomeType: row.outcomeType,
                      playerOneRegistrationId: row.playerOneRegistrationId,
                      playerTwoRegistrationId: row.playerTwoRegistrationId,
                      playerOneScore: row.playerOneScore,
                      playerTwoScore: row.playerTwoScore,
                      winnerRegistrationId: row.winnerRegistrationId,
                      completed: row.status === "completed",
                      played: isPlayed(row, snapshot.factualNoShowMatchIds),
                      decidedAt: row.decidedAt,
                    };
                  })
                  .sort(
                    (a, b) =>
                      a.roundNumber - b.roundNumber ||
                      a.matchNumber - b.matchNumber,
                  ),
                placements: standings.map(
                  ({ registrationId, rank, wins, losses, points }) => ({
                    registrationId,
                    rank,
                    wins,
                    losses,
                    points,
                  }),
                ),
                championRegistrationId: champion(
                  bracket,
                  matchRows,
                  standings,
                  rounds,
                ),
              }
            : null,
        };
      }),
    };
  });
}

// Parity with existing Career History and is_tournament_match_played_for_leaderboard:
// proof completeness is a separate authority, not an additional played-count rule.
function isPlayed(match: Match, noShows: ReadonlySet<string>) {
  return (
    match.status === "completed" &&
    match.outcomeType === null &&
    match.playerOneRegistrationId !== null &&
    match.playerTwoRegistrationId !== null &&
    match.playerOneScore !== null &&
    match.playerTwoScore !== null &&
    match.winnerRegistrationId !== null &&
    !noShows.has(match.id)
  );
}

// Mirrors the existing read-only division-state resolver / is_generated_bracket_complete.
function isComplete(
  bracket: Generated,
  matches: readonly Match[],
  rounds: ReadonlyMap<string, Round>,
) {
  if (bracket.format === "round_robin")
    return (
      matches.length > 0 &&
      matches.every(
        (row) =>
          row.status === "completed" && row.winnerRegistrationId !== null,
      )
    );
  const final = [...matches].sort(
    (a, b) =>
      rounds.get(b.roundId)!.round_number -
        rounds.get(a.roundId)!.round_number || b.matchNumber - a.matchNumber,
  )[0];
  return Boolean(
    final &&
      final.status === "completed" &&
      (final.winnerRegistrationId !== null ||
        final.outcomeType === "deadline_double_forfeit" ||
        final.outcomeType === "empty_feeder"),
  );
}

// Titles follow Career History: a final bye may win a title without being played.
// Round-robin rank 1 is a title only when the expected fixture set is completed.
function champion(
  bracket: Generated,
  matches: readonly Match[],
  standings: readonly Standing[],
  rounds: ReadonlyMap<string, Round>,
) {
  if (bracket.format === "round_robin") {
    const required = (bracket.slot_count * (bracket.slot_count - 1)) / 2;
    if (
      required <= 0 ||
      matches.length !== required ||
      !matches.every((row) => row.status === "completed")
    )
      return null;
    const winners = standings.filter((row) => row.rank === 1);
    if (winners.length > 1) fail();
    return winners[0]?.registrationId ?? null;
  }
  const finals = matches.filter(
    (row) =>
      rounds.get(row.roundId)?.round_number === Math.log2(bracket.slot_count),
  );
  if (finals.length > 1) fail();
  const final = finals[0];
  return final?.status === "completed" &&
    (final.outcomeType === null || final.outcomeType === "automatic_bye")
    ? final.winnerRegistrationId
    : null;
}

async function rows(request: PromiseLike<unknown>): Promise<Row[]> {
  let response: unknown;
  try {
    response = await request;
  } catch {
    throw new CompetitionReadError(
      "Tournament competition data is unavailable.",
      "QUERY_FAILED",
    );
  }
  if (!record(response)) fail();
  if (response.error !== null)
    throw new CompetitionReadError(
      "Tournament competition data is unavailable.",
      "QUERY_FAILED",
    );
  if (
    !Array.isArray(response.data) ||
    !Number.isSafeInteger(response.count) ||
    !response.data.every(record)
  )
    fail();
  if (
    response.count !== response.data.length ||
    response.data.length >= SENTINEL_LIMIT
  )
    throw new CompetitionReadError(
      "Tournament competition read limit exceeded.",
      "LIMIT_EXCEEDED",
    );
  return response.data;
}

function parseTournament(row: Row): Tournament {
  if (
    row.division_model_version !== "legacy_three_v1" &&
    row.division_model_version !== "four_division_v1"
  )
    fail();
  const model = requireDivisionModelVersion(row.division_model_version);
  const status = enumValue(row.status, [
    "upcoming",
    "registration_open",
    "in_progress",
    "completed",
    "cancelled",
    "voided",
  ] as const);
  return {
    id: id(row.id),
    slug: string(row.slug),
    title: string(row.title),
    division_model_version: model,
    status,
    format: enumValue(row.format, ["1v1", "2v2", "4v4"] as const),
    registration_enabled: boolean(row.registration_enabled),
    registration_open_at: nullableTime(row.registration_open_at),
    registration_close_at: nullableTime(row.registration_close_at),
    start_date: nullableTime(row.start_date),
    end_date: nullableTime(row.end_date),
    first_completed_at: nullableTime(row.first_completed_at),
  };
}
function parseDivision(row: Row): Division {
  return {
    id: id(row.id),
    tournament_id: id(row.tournament_id),
    name: enumValue(row.name, ["Academy", "Challenge", "Main", "Pro"] as const),
    elo_rules: string(row.elo_rules),
    max_players: integer(row.max_players, 1),
    launched_at: nullableTime(row.launched_at),
  };
}
function parseRegistration(row: Row): Registration {
  return {
    id: id(row.id),
    profile_id: nullableId(row.profile_id),
    tournament_id: id(row.tournament_id),
    tournament_bracket_id: id(row.tournament_bracket_id),
    player_name: string(row.player_name),
    country: nullableString(row.country),
    submitted_elo: nullableInteger(row.submitted_elo),
    elo_verified_elo: nullableInteger(row.elo_verified_elo),
    registration_status: enumValue(row.registration_status, [
      "pending",
      "manual_review",
      "approved",
      "rejected",
      "waitlisted",
      "withdrawn",
    ] as const),
    waitlist_offer_status:
      row.waitlist_offer_status === null
        ? null
        : enumValue(row.waitlist_offer_status, [
            "offered",
            "accepted",
            "declined",
            "expired",
            "cancelled",
          ] as const),
  };
}
function parseGenerated(row: Row): Generated {
  return {
    id: id(row.id),
    tournament_bracket_id: id(row.tournament_bracket_id),
    format: enumValue(row.format, [
      "single_elimination",
      "round_robin",
    ] as const),
    slot_count: integer(row.slot_count, 1),
  };
}
function parseRound(row: Row): Round {
  return {
    id: id(row.id),
    generated_bracket_id: id(row.generated_bracket_id),
    round_number: integer(row.round_number, 1),
    name: string(row.name),
  };
}
function parseMatch(row: Row): Match {
  return {
    id: id(row.id),
    generatedBracketId: id(row.generated_bracket_id),
    roundId: id(row.round_id),
    matchNumber: integer(row.match_number, 1),
    bestOf: integer(row.series_best_of, 1),
    status: enumValue(row.status, [
      "scheduled",
      "in_progress",
      "pending_review",
      "completed",
    ] as const),
    outcomeType:
      row.outcome_type === null
        ? null
        : enumValue(row.outcome_type, [
            "automatic_bye",
            "empty_feeder",
            "deadline_double_forfeit",
          ] as const),
    playerOneRegistrationId: nullableId(row.player_one_registration_id),
    playerTwoRegistrationId: nullableId(row.player_two_registration_id),
    playerOneScore: nullableInteger(row.player_one_score),
    playerTwoScore: nullableInteger(row.player_two_score),
    winnerRegistrationId: nullableId(row.winner_registration_id),
    decidedAt: nullableTime(row.official_result_decided_at),
  };
}
function parseStanding(row: Row): Standing {
  return {
    generatedBracketId: id(row.generated_bracket_id),
    registrationId: id(row.registration_id),
    rank: row.rank === null ? null : integer(row.rank, 1),
    wins: integer(row.wins),
    losses: integer(row.losses),
    points: integer(row.points),
  };
}
function parsePrivacy(row: Row): Privacy {
  return {
    id: id(row.id),
    public_profile_enabled: boolean(row.public_profile_enabled),
    account_closed_at: nullableTime(row.account_closed_at),
  };
}
function parseClosure(row: Row): Closure {
  return {
    tournament_bracket_id: id(row.tournament_bracket_id),
    closed_at: string(nullableTime(row.closed_at)),
    reason_code: enumValue(row.reason_code, [
      "minimum_roster_not_reached",
    ] as const),
  };
}
function unique<T extends { id: string }>(values: readonly T[]) {
  const result = new Map<string, T>();
  for (const value of values) {
    if (result.has(value.id)) fail();
    result.set(value.id, value);
  }
  return result;
}
function record(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) fail();
  return value;
}
function nullableString(value: unknown) {
  return value === null ? null : string(value);
}
function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
function id(value: unknown): string {
  if (!validUuid(value)) fail();
  return value;
}
function nullableId(value: unknown) {
  return value === null ? null : id(value);
}
function integer(value: unknown, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min)
    fail();
  return value;
}
function nullableInteger(value: unknown) {
  return value === null ? null : integer(value);
}
function nullableTime(value: unknown): string | null {
  if (value === null) return null;
  const result = string(value);
  if (!Number.isFinite(Date.parse(result))) fail();
  return result;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") fail();
  return value;
}
function enumValue<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) fail();
  return value as T;
}
function fail(): never {
  throw new CompetitionReadError(
    "Tournament competition data could not be read safely.",
  );
}
