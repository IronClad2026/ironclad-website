import { resolveTournamentDivisionStates } from "@/lib/tournament-division-state";
import { TOURNAMENT_BRACKET_CONFIGS, type TournamentCard } from "@/lib/tournaments";
import type { PlayerProfile } from "@/lib/player-profile";
import type { PlayerCareerDashboard } from "@/lib/player-dashboard";
import type { InAppNotification } from "@/lib/notifications";
import { buildDashboardBadgeData } from "@/lib/badges/dashboard";
import type { PollViewerProjection } from "@/lib/polls";

export const fixturePlayerId = "11111111-1111-4111-8111-111111111111";
export const fixtureUserId = "user_ui_redesign_fixture";
export const fixtureDate = "2026-09-01T12:00:00.000Z";
export const fixtureDeadline = "2099-09-30T12:00:00.000Z";

export function pollFixture(refreshed = false): PollViewerProjection {
  return {
    id: "55555555-5555-4555-8555-555555555555", purpose: "tournament_decision",
    audienceKind: "tournament_approved", tournamentId: "22222222-2222-4222-8222-000000000001",
    tournamentBracketId: null, question: refreshed ? "Refreshed fixture decision" : "Fixture tournament decision",
    context: "In-memory UI verification only.", optionSource: "text", maxSelections: 1, winnerCount: 1,
    authority: "binding", resultVisibility: "after_close", publicFinalTotals: false,
    opensAt: fixtureDate, closesAt: fixtureDeadline, publishedAt: fixtureDate,
    cancelledAt: null, cancellationReason: null, finalDecisionPublishedAt: null,
    finalDecisionBasis: null, finalRationale: null, bindingTieRuleUsed: false,
    status: "open", ballotRevision: 0, selectedOptionIds: [],
    options: ["First option", "Second option"].map((label, index) => ({
      id: `66666666-6666-4666-8666-${String(index + 1).padStart(12, "0")}`,
      position: index + 1, label, map: null, pollResultRank: null, finalDecisionRank: null,
    })),
  };
}

export function pollRpcFixture() {
  const snakeKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(snakeKeys);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), snakeKeys(item)]));
    return value;
  };
  return { poll: snakeKeys(pollFixture(true)) };
}

export function parameters() { return new URLSearchParams(location.search); }
export function fixtureLongText() {
  return "A competitive Company of Heroes 3 event from IronClad.\n\n" +
    "• Original organiser text remains intact.\n• Players arrange their matches and follow the published rules.\n\n".repeat(9) +
    "FullDescriptionEndMarker\n" + "UnbrokenTournamentDescription".repeat(9);
}

function artwork() {
  const ratio = parameters().get("ratio");
  if (ratio === "portrait" || ratio === "wide") {
    const width = ratio === "portrait" ? 600 : 1800;
    const height = ratio === "portrait" ? 900 : 500;
    return "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#20252a"/><rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="#f97316" stroke-width="8"/><text x="30" y="55" fill="white" font-size="30">TOP LEFT — WHOLE ARTWORK</text><text x="30" y="${height - 30}" fill="white" font-size="30">BOTTOM EDGE — ${ratio}</text></svg>`);
  }
  return parameters().has("missing") ? "" : "/images/tournaments/1v1-operation-skyfall.jpeg";
}

export function tournamentFixtures(): TournamentCard[] {
  const count = Math.max(1, Math.min(8, Number(parameters().get("events")) || 1));
  return Array.from({ length: count }, (_, index) => {
    const id = `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`;
    const historical = parameters().has("historical") && index === count - 1;
    const resolved = parameters().has("resolved") && index === count - 1;
    const mixed = parameters().has("mixed");
    const description = parameters().has("long") ? fixtureLongText() : "Join IronClad for a focused Company of Heroes 3 competition.\n\nFind your Division, read the rules and prepare for your next opponent.";
    const contextMaps = parameters().has("contextMaps") && index === 1;
    const configs = mixed && !contextMaps ? TOURNAMENT_BRACKET_CONFIGS : TOURNAMENT_BRACKET_CONFIGS.slice(0, 1);
    const brackets = configs.map((config, divisionIndex) => ({
      id: `33333333-3333-4333-8333-${String(index * 10 + divisionIndex + 1).padStart(12, "0")}`,
      name: config.name,
      requirement: config.defaultEloRules,
      maxPlayers: "8 active players",
      registeredPlayers: 4,
      activeCohortPlayers: 4,
      activeCohortSize: 8,
      waitlistedPlayers: 0,
      isFull: false,
      isWaitlistOnly: false,
      launchedAt: resolved || (mixed && divisionIndex === 0) ? fixtureDate : null,
      prize: parameters().has("prizes") ? "$100" : "No prize",
    }));
    const statusValue = historical ? "cancelled" as const : "registration_open" as const;
    return {
      id,
      slug: `fixture-event-${index + 1}`,
      title: `${historical ? "Historical " : ""}IronClad Open ${index + 1}${parameters().has("long") ? " — " + "LongUnbrokenEventTitle".repeat(5) : ""}`,
      format: "1v1",
      ruleFormat: "format_a",
      ruleFormatLabel: "Format A",
      status: historical ? "Cancelled" : "Open",
      statusValue,
      image: artwork(),
      description,
      details: description,
      organizer: "IronClad Tournaments",
      game: "Company of Heroes 3",
      region: "Global",
      prizePool: parameters().has("prizes") ? "$300 total — awarded by Division" : "",
      players: 4,
      maxPlayers: 8,
      brackets,
      divisionStates: resolveTournamentDivisionStates({
        tournamentId: id,
        eventStatus: statusValue,
        divisions: brackets.map((bracket, divisionIndex) => ({
          canonicalName: configs[divisionIndex].name,
          bracketId: bracket.id,
          approvedCount: bracket.launchedAt ? 8 : 4,
          requiredCount: 8,
          isReady: Boolean(bracket.launchedAt),
          launchedAt: bracket.launchedAt,
          generatedBracketId: bracket.launchedAt ? `generated-${bracket.id}` : null,
          isCompetitionComplete: resolved,
        })),
      }),
      rules: "Existing Format A rules apply.",
      schedule: ["Registration is open.", "Follow your match deadline after launch."],
      contact: "IronClad Admin",
      registrationEnabled: !historical,
      registrationOpenAt: fixtureDate,
      registrationCloseAt: fixtureDeadline,
      createdAt: fixtureDate,
      terminalAt: historical ? fixtureDate : null,
      resultConfirmationWindowMinutes: 30,
      rulesUrl: null,
      battlefyUrl: null,
      participants: [],
      bracketParticipants: [],
      generatedBrackets: [],
      mapPools: parameters().has("emptyMaps") ? [] : brackets.map((bracket, divisionIndex) => ({
        bracketId: bracket.id,
        divisionName: configs[divisionIndex].label,
        publishedAt: fixtureDate,
        launchedAt: bracket.launchedAt,
        maps: Array.from({ length: contextMaps ? 2 : divisionIndex === 0 ? 5 : 3 }, (_, mapIndex) => ({
          id: `map-${divisionIndex}-${mapIndex}`,
          slug: `fixture-map-${mapIndex}`,
          displayName: `${contextMaps ? "Event 2 · " : ""}${["Road to Tunis", "Twin Beaches", "Mountain Village", "Desert Crossing", "Valley of Steel"][mapIndex]}${parameters().has("long") ? "_" + "LongMapName".repeat(5) : ""}`,
          sourceType: mapIndex % 2 === 0 ? "official" as const : "community" as const,
          creatorName: mapIndex % 2 === 0 ? null : "Community Cartographer",
          gameMode: "1v1" as const,
          status: mapIndex === 3 ? "retired" as const : mapIndex === 4 ? "temporarily_disabled" as const : "active" as const,
          thumbnailPath: null,
          sourceReference: null,
        })),
      })),
    } satisfies TournamentCard;
  });
}

export function profileFixture(): PlayerProfile {
  return {
    id: fixturePlayerId, clerk_user_id: fixtureUserId,
    display_name: parameters().has("long") ? "Commander_" + "LongPlayerName".repeat(5) : "Steel Vanguard",
    in_game_name: "Vanguard", discord_username: "vanguard", steam_username: null,
    coh3_player_card_url: null, country: "AU", region: "oceania", timezone: "Australia/Sydney",
    current_elo: 1420, avatar_url: null, bio: null, profile_completed: true,
    public_profile_enabled: false, discord_public_enabled: false,
    created_at: fixtureDate, updated_at: fixtureDate,
  } as PlayerProfile;
}

export function registrationFixtures() {
  if (parameters().has("empty")) return [];
  return ["approved", "waitlisted", "approved"].map((status, index) => ({
    id: `registration-${index + 1}`, tournament_title: index === 2 ? "Previous IronClad Cup" : `IronClad Open ${index + 1}`,
    bracket_name: "Academy", registration_status: status,
    tournament_bracket_id: `fixture-bracket-${index}`, elo_status: "verified", submitted_elo: 1020,
    withdrawn_at: null, waitlist_offer_status: index === 1 ? "offered" : null,
    waitlist_offer_created_at: index === 1 ? fixtureDate : null,
    waitlist_offer_expires_at: index === 1 ? fixtureDeadline : null,
    waitlist_offer_resolved_at: null,
    tournament_brackets: { launched_at: index === 2 ? fixtureDate : null },
    tournaments: { status: index === 2 ? "completed" : "registration_open" },
    created_at: fixtureDate,
  }));
}

export function careerFixture(): PlayerCareerDashboard {
  const empty = parameters().has("empty");
  return {
    error: parameters().has("careerError") ? "load-failed" : null,
    statistics: { matchesPlayed: empty ? 0 : 18, matchesWon: empty ? 0 : 12, matchesLost: empty ? 0 : 6, winRate: empty ? 0 : 66.7, tournamentsParticipated: empty ? 0 : 4, tournamentsWon: empty ? 0 : 1 },
    notifications: empty ? [] : [{
      id: "fixture-action-1", source: "report_group", sourceId: "fixture-report-1", reportGroupId: "fixture-report-1",
      resultType: "normal", noShowRegistrationId: null, noShowStatus: null,
      submissionNumber: 1, gameNumber: 1, tournamentName: "IronClad Open 1", roundName: "Final",
      matchNumber: 1, opponentName: "Field Marshal", reportedWinner: "Steel Vanguard", reportedLoser: "Field Marshal",
      reportedScore: "2–1", status: "pending_confirmation", reviewNotes: null, submittedAt: fixtureDate,
      reviewedAt: null, submittedByViewer: false, confirmationDeadlineAt: fixtureDeadline, finalizedAt: null,
      canConfirm: true, canDispute: true,
    }],
    champions: empty ? [] : [{ id: "fixture-champion", winnerName: "Steel Vanguard", tournamentName: "Previous IronClad Cup", bracketName: "Academy", bannerImageUrl: "/images/tournaments/1v1-operation-skyfall.jpeg", wonAt: fixtureDate }],
    matchHistory: empty ? [] : Array.from({ length: 6 }, (_, index) => ({
      id: `fixture-match-${index}`, tournamentName: "Previous IronClad Cup", bracketName: "Academy",
      opponentName: `Opponent ${index + 1}`, result: index % 2 === 0 ? "win" : "loss", score: index % 2 === 0 ? "2–1" : "0–2",
      playedAt: fixtureDate, roundName: "Semifinal", matchNumber: index + 1, seriesBestOf: 3,
      replayAvailable: false, screenshotAvailable: false,
    })),
  };
}

export function notificationFixture(): InAppNotification[] {
  if (parameters().has("empty")) return [];
  const historical = parameters().has("historicalNotice");
  return [{ id: "fixture-update", recipientRole: "player", type: historical ? "registration.waitlist_offer" : "registration_approved", title: historical ? "Previous waitlist offer" : "Your registration was approved", message: historical ? "Review the retained previous registration record." : "You are in the approved Academy roster. Watch the tournament for Division launch information.", actorDisplayName: null, tournamentId: null, tournamentTitle: "IronClad Open 1", registrationId: historical ? "registration-3" : "registration-1", matchId: null, reportGroupId: null, deadlineAt: null, readAt: null, createdAt: fixtureDate, href: `/dashboard#registration-registration-${historical ? "3" : "1"}` }];
}

export function badgeFixture() {
  return buildDashboardBadgeData({ playerId: fixturePlayerId, awards: parameters().has("empty") ? [] : [
    { badgeSlug: "first-deployment", awardedAt: fixtureDate, awardId: "fixture-award-1" },
    { badgeSlug: "first-victory", awardedAt: fixtureDate, originalAwardedAt: fixtureDate, awardId: "fixture-award-2", isUnrevealed: Boolean(window.__uiFixture?.pendingBadgeReveal || parameters().has("pendingBadge")) },
    { badgeSlug: "academy-champion", awardedAt: fixtureDate, awardId: "fixture-award-3" },
  ] });
}
