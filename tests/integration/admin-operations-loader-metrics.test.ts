import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { adminIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import { loadAdminOperationsMetrics } from "@/lib/admin-operations";

const NOW = "2026-08-19T12:00:00.000Z";
const CURRENT = "2026-08-18T09:00:00.000Z";
const PREVIOUS = "2026-08-10T09:00:00.000Z";

function queryFor(rows: unknown[]) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (
    resolve: (value: {
      data: unknown[];
      error: null;
      count: number;
    }) => unknown,
    reject: (reason: unknown) => unknown
  ) =>
    Promise.resolve({ data: rows, error: null, count: rows.length }).then(
      resolve,
      reject
    );
  return query;
}

function match(
  id: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    generated_bracket_id: "generated-main",
    round_id: "round-one",
    status: "scheduled",
    player_one_registration_id: "registration-approved-main-1",
    player_two_registration_id: "registration-approved-main-2",
    player_one_score: null,
    player_two_score: null,
    winner_registration_id: null,
    official_result_submission_id: null,
    official_result_decided_by: null,
    official_result_decided_at: null,
    activation_version: 0,
    activated_at: null,
    deadline_at: null,
    outcome_type: null,
    deadline_ruled_at: null,
    hold_started_at: null,
    hold_released_at: null,
    ...overrides,
  };
}

function reportGroup(
  id: string,
  matchId: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    match_id: matchId,
    tournament_id: "tournament-live",
    result_type: "normal",
    status: "pending_confirmation",
    confirmation_deadline_at: "2026-08-19T13:00:00.000Z",
    no_show_status: null,
    finalized_at: null,
    finalized_source: null,
    created_at: CURRENT,
    disputed_at: null,
    reviewed_at: null,
    ...overrides,
  };
}

function registration(
  id: string,
  status: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    profile_id: `profile-${id}`,
    player_name: `Player ${id}`,
    tournament_id: "tournament-live",
    tournament_title: "IronClad Live",
    tournament_bracket_id: "bracket-main",
    bracket_name: "Main",
    registration_status: status,
    created_at: CURRENT,
    withdrawn_at: null,
    waitlist_offer_status: null,
    waitlist_offer_created_at: null,
    waitlist_offer_expires_at: null,
    waitlist_offer_resolved_at: null,
    ...overrides,
  };
}

function fixtureTables(): Record<string, unknown[]> {
  const players = [
    {
      id: "profile-repeat",
      display_name: "Repeat Player",
      created_at: CURRENT,
      profile_completed: true,
      account_closed_at: null,
      steam_id64: "steam-linked",
      relic_elo_verified_at: CURRENT,
      public_profile_enabled: true,
    },
    {
      id: "profile-open",
      display_name: "Open Player",
      created_at: PREVIOUS,
      profile_completed: false,
      account_closed_at: null,
      steam_id64: null,
      relic_elo_verified_at: null,
      public_profile_enabled: false,
    },
    {
      id: "profile-closed",
      display_name: "Closed Player",
      created_at: CURRENT,
      profile_completed: true,
      account_closed_at: CURRENT,
      steam_id64: "steam-closed",
      relic_elo_verified_at: null,
      public_profile_enabled: true,
    },
  ];

  const registrations = [
    registration("registration-approved-main-1", "approved", {
      profile_id: "profile-repeat",
      player_name: "Repeat Player",
      created_at: PREVIOUS,
    }),
    registration("registration-approved-main-2", "approved", {
      profile_id: "profile-open",
      player_name: "Open Player",
    }),
    registration("registration-approved-academy", "approved", {
      profile_id: "profile-repeat",
      player_name: "Repeat Player",
      tournament_id: "tournament-completed",
      tournament_title: "IronClad Completed",
      tournament_bracket_id: "bracket-academy",
      bracket_name: "Academy",
    }),
    registration("registration-pending", "pending", {
      player_name: "Pending Player",
    }),
    registration("registration-rejected", "rejected", {
      player_name: "Rejected Player",
    }),
    registration("registration-manual", "manual_review", {
      player_name: "Manual Player",
    }),
    registration("registration-waiting", "waitlisted", {
      player_name: "Waiting Player",
    }),
    registration("registration-offered", "waitlisted", {
      player_name: "Offered Player",
      tournament_id: "tournament-registration-open",
      tournament_title: "IronClad Registration Open",
      tournament_bracket_id: "bracket-registration-open",
      bracket_name: "Challenge",
      waitlist_offer_status: "offered",
      waitlist_offer_created_at: CURRENT,
      waitlist_offer_expires_at: "2026-08-19T11:00:00.000Z",
    }),
    registration("registration-accepted", "waitlisted", {
      player_name: "Accepted Player",
      waitlist_offer_status: "accepted",
      waitlist_offer_created_at: PREVIOUS,
      waitlist_offer_resolved_at: CURRENT,
    }),
    registration("registration-declined", "waitlisted", {
      player_name: "Declined Player",
      waitlist_offer_status: "declined",
      waitlist_offer_created_at: PREVIOUS,
      waitlist_offer_resolved_at: CURRENT,
    }),
    registration("registration-expired", "waitlisted", {
      player_name: "Expired Player",
      waitlist_offer_status: "expired",
      waitlist_offer_created_at: PREVIOUS,
      waitlist_offer_resolved_at: CURRENT,
    }),
    registration("registration-withdrawn", "withdrawn", {
      player_name: "Withdrawn Player",
      withdrawn_at: CURRENT,
    }),
  ];

  const tournaments = [
    {
      id: "tournament-live",
      title: "IronClad Live",
      status: "in_progress",
      registration_enabled: false,
      registration_open_at: PREVIOUS,
      registration_close_at: "2026-08-25T00:00:00.000Z",
      created_at: CURRENT,
      first_completed_at: null,
    },
    {
      id: "tournament-completed",
      title: "IronClad Completed",
      status: "completed",
      registration_enabled: false,
      registration_open_at: PREVIOUS,
      registration_close_at: PREVIOUS,
      created_at: PREVIOUS,
      first_completed_at: CURRENT,
    },
    {
      id: "tournament-cancelled",
      title: "IronClad Cancelled",
      status: "cancelled",
      registration_enabled: false,
      registration_open_at: null,
      registration_close_at: null,
      created_at: PREVIOUS,
      first_completed_at: null,
    },
    {
      id: "tournament-voided",
      title: "IronClad Voided",
      status: "voided",
      registration_enabled: false,
      registration_open_at: null,
      registration_close_at: null,
      created_at: PREVIOUS,
      first_completed_at: null,
    },
    {
      id: "tournament-registration-open",
      title: "IronClad Registration Open",
      status: "registration_open",
      registration_enabled: true,
      registration_open_at: null,
      registration_close_at: null,
      created_at: CURRENT,
      first_completed_at: null,
    },
  ];

  const tournamentMatches = [
    match("match-ready"),
    match("match-playable", {
      status: "in_progress",
      activation_version: 1,
      activated_at: "2026-08-19T09:00:00.000Z",
      deadline_at: "2026-08-19T13:00:00.000Z",
    }),
    match("match-player-confirmed", {
      status: "completed",
      player_one_score: 2,
      player_two_score: 1,
      winner_registration_id: "registration-approved-main-1",
    }),
    match("match-auto-confirmed", {
      status: "completed",
      player_one_score: 0,
      player_two_score: 2,
      winner_registration_id: "registration-approved-main-2",
    }),
    match("match-admin-approved", {
      status: "completed",
      player_one_score: 2,
      player_two_score: 0,
      winner_registration_id: "registration-approved-main-1",
    }),
    match("match-direct-legacy", {
      status: "completed",
      player_one_score: 2,
      player_two_score: 0,
      winner_registration_id: "registration-approved-main-1",
      official_result_decided_by: "user_test_admin",
      official_result_decided_at: CURRENT,
    }),
    match("match-no-show", { status: "completed" }),
    match("match-bye", {
      status: "completed",
      outcome_type: "automatic_bye",
    }),
    match("match-walkover", {
      status: "completed",
      round_id: "round-final",
      outcome_type: "automatic_bye",
    }),
    match("match-double-forfeit", {
      status: "completed",
      outcome_type: "deadline_double_forfeit",
    }),
    match("match-empty-feeder", {
      status: "completed",
      outcome_type: "empty_feeder",
    }),
    match("match-disputed", {
      status: "in_progress",
      activation_version: 1,
      activated_at: CURRENT,
      deadline_at: "2026-08-20T12:00:00.000Z",
    }),
    match("match-review", {
      status: "in_progress",
      activation_version: 1,
      activated_at: CURRENT,
      deadline_at: "2026-08-20T12:00:00.000Z",
    }),
    match("match-overdue", {
      status: "in_progress",
      activation_version: 1,
      activated_at: PREVIOUS,
      deadline_at: "2026-08-19T11:00:00.000Z",
    }),
    match("match-hold", {
      status: "in_progress",
      activation_version: 1,
      activated_at: CURRENT,
      deadline_at: "2026-08-20T12:00:00.000Z",
      hold_started_at: "2026-08-19T10:00:00.000Z",
    }),
    match("match-awaiting", {
      status: "in_progress",
      activation_version: 1,
      activated_at: CURRENT,
      deadline_at: "2026-08-20T12:00:00.000Z",
    }),
    match("match-expired-confirmation", {
      status: "in_progress",
      activation_version: 1,
      activated_at: PREVIOUS,
      deadline_at: "2026-08-19T11:00:00.000Z",
    }),
    match("match-unlaunched", {
      generated_bracket_id: "generated-unlaunched",
      status: "completed",
      player_one_score: 2,
      player_two_score: 0,
      winner_registration_id: "registration-approved-main-1",
    }),
  ];

  const reportGroups = [
    reportGroup("report-player", "match-player-confirmed", {
      status: "confirmed",
      finalized_at: CURRENT,
      finalized_source: "opponent_confirmation",
    }),
    reportGroup("report-player-duplicate", "match-player-confirmed", {
      status: "approved",
      finalized_at: CURRENT,
      finalized_source: "admin_override",
    }),
    reportGroup("report-auto", "match-auto-confirmed", {
      status: "auto_approved",
      finalized_at: CURRENT,
      finalized_source: "cron_auto_approval",
    }),
    reportGroup("report-admin", "match-admin-approved", {
      status: "approved",
      finalized_at: CURRENT,
      finalized_source: "admin_approval",
    }),
    reportGroup("report-no-show", "match-no-show", {
      result_type: "no_show",
      status: "confirmed",
      no_show_status: "confirmed",
      finalized_at: CURRENT,
    }),
    reportGroup("report-disputed", "match-disputed", {
      status: "disputed",
      disputed_at: CURRENT,
    }),
    reportGroup("report-review", "match-review", {
      status: "under_review",
      reviewed_at: CURRENT,
    }),
    reportGroup("report-awaiting", "match-awaiting"),
    reportGroup("report-expired", "match-expired-confirmation", {
      confirmation_deadline_at: "2026-08-19T11:00:00.000Z",
    }),
    reportGroup("report-unlaunched", "match-unlaunched", {
      status: "disputed",
      disputed_at: CURRENT,
    }),
  ];

  return {
    players,
    registrations,
    tournaments,
    tournament_brackets: [
      {
        id: "bracket-main",
        tournament_id: "tournament-live",
        name: "Main",
        launched_at: PREVIOUS,
      },
      {
        id: "bracket-academy",
        tournament_id: "tournament-completed",
        name: "Academy",
        launched_at: PREVIOUS,
      },
      {
        id: "bracket-registration-open",
        tournament_id: "tournament-registration-open",
        name: "Challenge",
        launched_at: null,
      },
    ],
    generated_brackets: [
      { id: "generated-main", tournament_bracket_id: "bracket-main" },
      {
        id: "generated-unlaunched",
        tournament_bracket_id: "bracket-registration-open",
      },
    ],
    bracket_rounds: [
      {
        id: "round-one",
        generated_bracket_id: "generated-main",
        round_number: 1,
      },
      {
        id: "round-final",
        generated_bracket_id: "generated-main",
        round_number: 2,
      },
    ],
    tournament_matches: tournamentMatches,
    match_result_report_groups: reportGroups,
    match_result_submissions: [
      {
        id: "legacy-review",
        match_id: "match-review",
        status: "pending",
        report_group_id: null,
      },
      {
        id: "legacy-unlaunched",
        match_id: "match-unlaunched",
        status: "pending",
        report_group_id: null,
      },
    ],
    notifications: [
      {
        id: "assistance-1",
        actor_display_name: "Repeat Player",
        tournament_id: "tournament-live",
        tournament_title: "IronClad Live",
        match_id: "match-playable",
        created_at: CURRENT,
      },
    ],
  };
}

describe("Admin Operations canonical loader metrics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    authMock.mockResolvedValue(adminIdentity);
    const tables = fixtureTables();
    createSupabaseAdminClientMock.mockReturnValue({
      from: vi.fn((table: string) => queryFor(tables[table] ?? [])),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("groups Players, registrations, Tournaments, and Divisions without merging statuses", async () => {
    const metrics = await loadAdminOperationsMetrics("7d");
    expect(metrics).not.toBeNull();
    if (!metrics) throw new Error("Expected Admin metrics.");

    expect(metrics.players).toMatchObject({
      total: 3,
      openAccounts: 2,
      completedProfiles: 2,
      steamLinked: 2,
      relicVerified: 1,
      publicProfiles: 1,
      newInPeriod: 2,
    });
    expect(metrics.players.closedAccounts).toHaveLength(1);
    expect(metrics.players.closedAccounts[0]).toMatchObject({
      primary: "Closed Player",
      href: "/admin/operations#who-left",
    });
    expect(metrics.overview.registrations.href).toBe("/admin/registrations");

    expect(metrics.registrations.statusGroups).toEqual([
      { label: "Pending", value: 1 },
      { label: "Approved", value: 3 },
      { label: "Rejected", value: 1 },
      { label: "Manual review", value: 1 },
      { label: "Raw waitlisted", value: 5 },
      { label: "Withdrawn", value: 1 },
    ]);
    expect(metrics.registrations.waitlistOfferGroups).toEqual([
      { label: "Waiting Now", value: 1 },
      { label: "Offered Now", value: 1 },
      { label: "Vacancy Accepted", value: 1 },
      { label: "Vacancy Declined", value: 1 },
      { label: "Vacancy Expired", value: 1 },
      { label: "Vacancy Cancelled", value: 0 },
    ]);
    expect(metrics.registrations.withdrawnInPeriod).toBe(1);
    expect(metrics.registrations.who.pending[0]).toMatchObject({
      primary: "Pending Player",
      href: "/admin/registrations?filter=pending&selected=registration-pending",
    });
    expect(metrics.registrations.who.manualReview[0].primary).toBe(
      "Manual Player"
    );
    expect(metrics.registrations.who.withdrawn[0].primary).toBe(
      "Withdrawn Player"
    );
    expect(metrics.registrations.who.vacancyAccepted[0].primary).toBe(
      "Accepted Player"
    );
    expect(metrics.registrations.who.vacancyDeclined[0].primary).toBe(
      "Declined Player"
    );
    expect(metrics.registrations.who.vacancyExpired[0].primary).toBe(
      "Expired Player"
    );

    expect(metrics.tournaments).toMatchObject({
      total: 5,
      active: 2,
      registrationOpenNow: 1,
      launched: 2,
      completed: 1,
      cancelled: 1,
      voided: 1,
      completionRate: 50,
    });
    expect(metrics.tournaments.participationByDivision).toEqual([
      { label: "Academy", value: 1 },
      { label: "Challenge", value: 0 },
      { label: "Main / Pro", value: 2 },
    ]);
    expect(metrics.tournaments.completedByDivision).toEqual([
      { label: "Academy", value: 1 },
      { label: "Challenge", value: 0 },
      { label: "Main / Pro", value: 0 },
    ]);
    expect(metrics.health.repeatApprovedParticipants).toBe(1);
  });

  it("uses launched Matches only and keeps outcome/result sources distinct", async () => {
    const metrics = await loadAdminOperationsMetrics("7d");
    expect(metrics).not.toBeNull();
    if (!metrics) throw new Error("Expected Admin metrics.");

    expect(metrics.matches).toMatchObject({
      total: 17,
      playable: 1,
      readyForActivation: 1,
      active: 7,
      completed: 9,
      outcomes: {
        played: 4,
        confirmedNoShows: 1,
        doubleForfeits: 1,
        byes: 1,
        walkovers: 1,
        automaticProgressions: 2,
        emptyFeeders: 1,
      },
      resultResolution: {
        playerConfirmed: 1,
        automaticallyConfirmed: 1,
        adminApproved: 1,
        directLegacyAdmin: 1,
      },
    });
    expect(
      Object.values(metrics.matches.resultResolution).reduce(
        (sum, count) => sum + count,
        0
      )
    ).toBe(4);
    expect(metrics.matches.who.disputed).toHaveLength(1);
    expect(metrics.matches.who.disputed[0].id).toBe("match-disputed");
    expect(metrics.matches.who.noShows[0].id).toBe("match-no-show");
    expect(metrics.matches.who.disputed.some((row) => row.id === "match-unlaunched"))
      .toBe(false);
  });

  it("keeps attention queues separate and links Who rows into existing workflows", async () => {
    const metrics = await loadAdminOperationsMetrics("7d");
    expect(metrics).not.toBeNull();
    if (!metrics) throw new Error("Expected Admin metrics.");

    expect(metrics.matches.operationalHealth).toEqual({
      awaitingConfirmation: 2,
      openDisputes: 1,
      underAdminReview: 1,
      pendingAdminAssistance: 1,
      overdueMatchActions: 1,
      activeAdminHolds: 1,
      expiredConfirmationActions: 1,
      expiredWaitlistOffers: 1,
    });
    expect(metrics.overview.openIssues.value).toBe(7);
    expect(metrics.attention.map(({ key, count }) => ({ key, count }))).toEqual([
      { key: "disputes", count: 1 },
      { key: "admin-review", count: 1 },
      { key: "admin-assistance", count: 1 },
      { key: "overdue-matches", count: 1 },
      { key: "expired-confirmations", count: 1 },
      { key: "expired-waitlist-offers", count: 1 },
      { key: "admin-holds", count: 1 },
    ]);
    expect(metrics.matches.who.underReview[0].id).toBe("match-review");
    expect(metrics.matches.who.overdue[0].id).toBe("match-overdue");
    expect(metrics.matches.who.adminAssistance[0]).toMatchObject({
      id: "match-playable",
      primary: "Repeat Player vs Open Player",
      href: "/tournaments?tournament=tournament-live&tab=brackets&match=match-playable",
    });
  });
});
