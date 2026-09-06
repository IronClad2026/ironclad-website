// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/tournament-division-invitations", () => ({
  loadPlayerTournamentDivisionInvitations:
    loadPlayerTournamentDivisionInvitationsMock,
}));
vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));

import PlayerDashboardPage from "@/app/dashboard/page";

describe("Player Dashboard information hierarchy", () => {
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
      "profile-visibility",
      "community",
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

    expect(
      screen.getByRole("heading", { name: "Player Dashboard" })
    ).toHaveClass("text-3xl", "sm:text-4xl");
    expect(
      commandCentre?.querySelector('[data-dashboard-section="identity"]')
    ).toHaveClass("mt-4", "p-4", "sm:p-5");
    expect(
      commandCentre?.querySelector('[data-dashboard-section="current-actions"]')
    ).toHaveClass("lg:grid-cols-2");
    expect(
      commandCentre?.querySelector(
        '[data-dashboard-section="profile-visibility"]'
      )
    ).toHaveClass("md:grid-cols-2");
    expect(commandCentre?.querySelector('[role="img"]')).toHaveClass(
      "h-24",
      "w-24",
      "sm:h-28",
      "sm:w-28"
    );

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
});

function createDashboardClient() {
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

  const registrationsQuery = chainQuery();
  registrationsQuery.order.mockResolvedValue({
    data: [
      {
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
      },
    ],
    error: null,
  });

  return {
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
