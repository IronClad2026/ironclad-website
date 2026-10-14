// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const loadPlayerCareerDashboardMock = vi.hoisted(() => vi.fn());
const loadPlayerNotificationsMock = vi.hoisted(() => vi.fn());
const loadCommunityPollsForRequestMock = vi.hoisted(() => vi.fn());
const loadPlayerTournamentDivisionInvitationsMock = vi.hoisted(() => vi.fn());
const loadPlayerBadgeRevealDashboardStateMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/app/dashboard/badge-reveal-actions", () => ({
  acknowledgeBadgeReveal: vi.fn(),
}));
vi.mock("@/components/DashboardChampionHistory", () => ({
  default: () => <section data-dashboard-surface="champion-history" />,
}));
vi.mock("@/components/DashboardMatchHistory", () => ({
  default: () => <section data-dashboard-surface="match-history" />,
}));
vi.mock("@/components/DashboardNotifications", () => ({
  default: () => <section data-dashboard-surface="match-actions" />,
}));
vi.mock("@/components/InAppNotificationCenter", () => ({
  default: () => <section data-dashboard-surface="notifications" />,
}));
vi.mock("@/components/PlayerDivisionInvitations", () => ({
  default: () => (
    <section data-dashboard-section="division-invitations" />
  ),
}));
vi.mock("@/components/PlayerRegistrationActions", () => ({
  default: () => <div data-dashboard-surface="registration-actions" />,
}));
vi.mock("@/components/PublicProfileVisibilityCard", () => ({
  default: () => (
    <section data-profile-visibility-control="public-profile" />
  ),
}));
vi.mock("@/components/DiscordContactVisibilityCard", () => ({
  default: () => <section data-profile-visibility-control="discord" />,
}));
vi.mock("@/components/PollsAndDecisions", () => ({
  default: () => <section data-dashboard-surface="community-polls" />,
}));
vi.mock("@/components/badges/DashboardBadgesSection", () => ({
  default: () => <section data-dashboard-surface="badges" />,
}));
vi.mock("@/lib/badges/reveals", () => ({
  loadPlayerBadgeRevealDashboardState:
    loadPlayerBadgeRevealDashboardStateMock,
}));
vi.mock("@/lib/i18n/request", () => ({
  getRequestLocale: vi.fn(async () => "en"),
}));
vi.mock("@/lib/notifications", () => ({
  loadPlayerNotifications: loadPlayerNotificationsMock,
}));
vi.mock("@/lib/player-dashboard", () => ({
  loadPlayerCareerDashboard: loadPlayerCareerDashboardMock,
}));
vi.mock("@/lib/player-polls", () => ({
  loadCommunityPollsForRequest: loadCommunityPollsForRequestMock,
}));
vi.mock("@/lib/player-showcase/read", () => ({
  getPlayerShowcaseEnabled: vi.fn(async () => false),
}));
vi.mock("@/lib/tournament-division-invitations", () => ({
  loadPlayerTournamentDivisionInvitations:
    loadPlayerTournamentDivisionInvitationsMock,
}));
vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));

import PlayerDashboardPage from "@/app/dashboard/page";

describe("Player Dashboard information hierarchy", () => {
  afterEach(cleanup);
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "user_dashboard_hierarchy" });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(
      createDashboardClient()
    );
    loadPlayerCareerDashboardMock.mockResolvedValue({
      notifications: [],
      champions: [],
      statistics: {
        matchesPlayed: 8,
        matchesWon: 5,
        matchesLost: 3,
        winRate: 62.5,
        tournamentsParticipated: 2,
        tournamentsWon: 1,
      },
      matchHistory: [],
      error: null,
    });
    loadPlayerNotificationsMock.mockResolvedValue({
      notifications: [],
      totalCount: 0,
      unreadCount: 0,
      error: null,
    });
    loadCommunityPollsForRequestMock.mockResolvedValue({
      polls: [],
      error: null,
    });
    loadPlayerTournamentDivisionInvitationsMock.mockResolvedValue({
      status: "success",
      invitations: [],
    });
    loadPlayerBadgeRevealDashboardStateMock.mockResolvedValue({
      status: "error",
      code: "award-load-failed",
    });
  });

  it("keeps current competition ahead of statistics, history, utilities, and community", async () => {
    render(await PlayerDashboardPage());

    const commandCentre = document.querySelector(
      "main[data-dashboard-command-centre]"
    );
    expect(commandCentre).not.toBeNull();
    expect(commandCentre).toHaveClass("px-4", "pt-24", "sm:px-6");

    const orderedSections = [
      "header",
      "identity",
      "current-actions",
      "registrations",
      "division-invitations",
      "statistics",
      "history",
      "community",
      "profile-visibility",
    ].map((name) =>
      commandCentre?.querySelector(`[data-dashboard-section="${name}"]`)
    );

    expect(orderedSections.every(Boolean)).toBe(true);
    for (let index = 1; index < orderedSections.length; index += 1) {
      const previous = orderedSections[index - 1];
      const current = orderedSections[index];

      if (!previous || !current) {
        throw new Error("Expected Dashboard hierarchy section is missing.");
      }
      expect(
        previous.compareDocumentPosition(current) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }

    const identity = commandCentre?.querySelector('[data-dashboard-section="identity"]');
    expect(screen.getByRole("heading", { name: "Player Dashboard" })).toBeVisible();
    expect(identity).toHaveTextContent("Command Centre Player");
    expect(identity).toHaveTextContent("1,420");
    expect(identity).toHaveTextContent("Profile Complete");
    expect(identity).toHaveTextContent("Australia/Sydney");
    expect(screen.getByRole("heading", { name: "Your Competition" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Career History" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Profile & Visibility" })).toBeVisible();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: /^Tournaments\s*0$/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /^Championships\s*0$/ })).toHaveAttribute("aria-selected", "false");
    expect(commandCentre?.querySelector('[data-dashboard-section="registration-archive"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /Registration Archive/, hidden: true })).not.toBeInTheDocument();
    expect(document.querySelector('[data-registration-presentation="historical"]')).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /^Championships\s*0$/ }));
    expect(screen.getByRole("tab", { name: /^Championships\s*0$/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: /^Tournaments\s*0$/ }));
    expect(screen.getByRole("tab", { name: /^Tournaments\s*0$/ })).toHaveAttribute("aria-selected", "true");
    const matchActions = commandCentre?.querySelector('[data-dashboard-surface="match-actions"]');
    const updates = commandCentre?.querySelector('[data-dashboard-surface="notifications"]');
    expect((matchActions?.compareDocumentPosition(updates!) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Review your competitive profile and track every IronClad Tournament Registration.")).toBeNull();

    expect(
      document.querySelectorAll("[data-profile-visibility-control]")
    ).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "View/Edit Profile" })
    ).toHaveAttribute("href", "/profile");
    expect(
      screen.getByRole("link", { name: "Go to Tournaments" })
    ).toHaveAttribute("href", "/tournaments");
    expect(
      document.querySelector("[data-dashboard-surface='registration-actions']")
    ).not.toBeNull();
    expect(
      document.querySelector("[data-dashboard-surface='badges']")
    ).not.toBeNull();
    expect(
      document.querySelector("[data-dashboard-surface='community-polls']")
    ).not.toBeNull();
  });

  it("renders only the current bucket while retaining every historical row in the read result", async () => {
    const historical = [
      { id: "completed-record", tournament_title: "Completed historical event", tournaments: { status: "completed" }, tournament_brackets: { launched_at: "2026-08-06T00:00:00.000Z" } },
      { id: "cancelled-record", tournament_title: "Cancelled historical event", tournaments: { status: "cancelled" }, registration_status: "waitlisted", waitlist_offer_status: "offered" },
      { id: "voided-record", tournament_title: "Voided historical event", tournaments: { status: "voided" } },
      { id: "rejected-record", tournament_title: "Rejected historical event", registration_status: "rejected" },
      { id: "withdrawn-record", tournament_title: "Withdrawn historical event", registration_status: "withdrawn" },
    ];
    const client = createDashboardClient(historical);
    const originalRows = structuredClone(client.registrationRows);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(client);

    render(await PlayerDashboardPage());

    expect(screen.getByRole("heading", { name: "Command Centre Cup" })).toBeVisible();
    expect(document.querySelectorAll('[data-registration-presentation="current"]')).toHaveLength(1);
    expect(document.querySelector('[data-dashboard-surface="registration-actions"]')).toBeVisible();
    for (const record of historical) {
      expect(screen.queryByText(record.tournament_title)).not.toBeInTheDocument();
      expect(document.getElementById(`registration-${record.id}`)).toBeNull();
    }
    expect(document.querySelector('[data-dashboard-section="registration-archive"]')).toBeNull();
    expect(screen.queryByText(/View archive|Hide archive|Registration Archive/)).not.toBeInTheDocument();
    expect(client.registrationRows).toEqual(originalRows);
    expect(client.registrationsQuery.eq).toHaveBeenCalledWith("clerk_user_id", "user_dashboard_hierarchy");
  });

  it("redirects signed-out requests before accessing player data", async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(PlayerDashboardPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
    expect(loadPlayerCareerDashboardMock).not.toHaveBeenCalled();
  });
});

function createDashboardClient(historicalOverrides: Record<string, unknown>[] = []) {
  const profileQuery = chainQuery();
  profileQuery.maybeSingle.mockResolvedValue({
    data: {
      id: "11111111-1111-4111-8111-111111111111",
      clerk_user_id: "user_dashboard_hierarchy",
      display_name: "Command Centre Player",
      in_game_name: "CommandCentre",
      discord_username: "command-centre",
      steam_username: null,
      coh3_player_card_url: null,
      country: "AU",
      region: "oceania",
      timezone: "Australia/Sydney",
      current_elo: 1420,
      avatar_url: null,
      bio: null,
      profile_completed: true,
      public_profile_enabled: true,
      discord_public_enabled: false,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
    error: null,
  });

  const currentRegistration = {
    id: "22222222-2222-4222-8222-222222222222",
    tournament_title: "Command Centre Cup",
    bracket_name: "Academy Bracket",
    registration_status: "approved",
    tournament_bracket_id: "33333333-3333-4333-8333-333333333333",
    elo_status: "verified",
    submitted_elo: 1420,
    withdrawn_at: null,
    waitlist_offer_status: null,
    waitlist_offer_created_at: null,
    waitlist_offer_expires_at: null,
    waitlist_offer_resolved_at: null,
    tournament_brackets: { launched_at: null },
    tournaments: { status: "registration_open" },
    created_at: "2026-08-05T00:00:00.000Z",
  };
  const registrationRows = [currentRegistration, ...historicalOverrides.map((overrides) => ({ ...currentRegistration, ...overrides }))];
  const registrationsQuery = chainQuery();
  registrationsQuery.order.mockResolvedValue({
    data: registrationRows,
    error: null,
  });

  return {
    registrationRows,
    registrationsQuery,
    from: vi.fn((table: string) => {
      if (table === "players") return profileQuery;
      if (table === "registrations") return registrationsQuery;
      throw new Error(`Unexpected dashboard table: ${table}`);
    }),
  };
}

function chainQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}
