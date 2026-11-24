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
const loadDashboardOverviewEventsMock = vi.hoisted(() => vi.fn());
const useSearchParamsMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useSearchParams: useSearchParamsMock,
  redirect: () => { throw new Error("NEXT_REDIRECT"); },
}));
vi.mock("@/components/dashboard/overview-event-data", () => ({
  loadDashboardOverviewEvents: loadDashboardOverviewEventsMock,
}));
vi.mock("@/lib/wardrobe/environment", () => ({
  isReadyWardrobePilotEnabled: () => true,
}));
vi.mock("@/components/dashboard/DashboardReadyWardrobe", () => ({
  default: ({ mode }: { mode: string }) => <section data-dashboard-section="wardrobe" data-wardrobe-mode={mode} />,
}));

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
import { getCompetitionPriority } from "@/components/dashboard/competition-presentation";

describe("Player Dashboard information hierarchy", () => {
  afterEach(cleanup);
  beforeEach(() => {
    window.history.replaceState(null, "", "/dashboard");
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    loadDashboardOverviewEventsMock.mockResolvedValue({ events: [{
      id: "event", slug: "command-centre-cup", title: "Command Centre Cup", bannerImageUrl: null,
      status: "registration_open", registrationEnabled: true, registrationOpenAt: null,
      registrationCloseAt: "2099-01-01T00:00:00Z", startDate: null,
      brackets: [{ id: "33333333-3333-4333-8333-333333333333", launchedAt: null, notHeld: false }],
    }], error: false });
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

  it("keeps the next event above wardrobe and current competition on Overview", async () => {
    render(await PlayerDashboardPage());

    const commandCentre = document.querySelector(
      "main[data-dashboard-command-centre]"
    );
    expect(commandCentre).not.toBeNull();
    expect(commandCentre).toHaveClass("px-3", "pt-20", "sm:px-6");
    expect(document.querySelector("[data-dashboard-view]")).toHaveAttribute("data-dashboard-view", "overview");

    const orderedSections = [
      "header",
      "identity",
      "wardrobe",
      "current-actions",
      "registrations",
      "division-invitations",
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
    expect(screen.getByRole("heading", { name: "Command Centre Player" })).toBeVisible();
    expect(identity).toHaveTextContent("Command Centre Player");
    expect(identity).toHaveTextContent("1,420");
    expect(identity).toHaveTextContent("Australia/Sydney");
    expect(screen.getByRole("heading", { name: "Your Competition" })).toBeVisible();
    const spotlight = document.querySelector("[data-dashboard-event]");
    const wardrobe = document.querySelector('[data-dashboard-section="wardrobe"]');
    expect(spotlight).toBeVisible();
    expect((spotlight!.compareDocumentPosition(wardrobe!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Ready Wardrobe" })).toHaveAttribute("href", "/dashboard?wardrobe=open#ready-wardrobe");
    expect(screen.getByRole("link", { name: "Player hub" })).toHaveAttribute("href", "/dashboard?section=player-hub");
    expect(screen.queryByRole("heading", { name: "Player hub" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Career History" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(commandCentre?.querySelector('[data-dashboard-section="registration-archive"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /Registration Archive/, hidden: true })).not.toBeInTheDocument();
    expect(document.querySelector('[data-registration-presentation="historical"]')).toBeNull();
    const matchActions = commandCentre?.querySelector('[data-dashboard-surface="match-actions"]');
    const updates = commandCentre?.querySelector('[data-dashboard-surface="notifications"]');
    expect((matchActions?.compareDocumentPosition(updates!) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Review your competitive profile and track every IronClad Tournament Registration.")).toBeNull();

    expect(
      document.querySelectorAll("[data-profile-visibility-control]")
    ).toHaveLength(1);
    expect(document.querySelector('[data-profile-visibility-control="public-profile"]')).toBeNull();
    expect(document.querySelector('[data-profile-visibility-control="discord"]')).not.toBeNull();
    expect(screen.queryByRole("link", { name: "View/Edit Profile" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to Tournaments" })
    ).toHaveAttribute("href", "/tournaments");
    expect(document.querySelector("[data-dashboard-surface='badges']")).not.toBeVisible();
    expect(document.querySelector("[data-dashboard-surface='community-polls']")).not.toBeVisible();
  });

  it("keeps Player hub details reachable by its real URL without showing them on Overview", async () => {
    window.history.replaceState(null, "", "/dashboard?section=player-hub");
    useSearchParamsMock.mockReturnValue(new URLSearchParams("section=player-hub"));
    render(await PlayerDashboardPage());
    expect(document.querySelector("[data-dashboard-view]")).toHaveAttribute("data-dashboard-view", "hub");
    expect(screen.getByRole("heading", { name: "Player hub" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Player hub" })).toHaveAttribute("aria-current", "page");
    expect(document.querySelector('[data-dashboard-section="statistics"]')).toBeVisible();
    expect(document.querySelector('[data-dashboard-section="current-actions"]')).not.toBeVisible();
    openDisclosure("Career History");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: /^Tournaments\s*0$/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: /^Championships\s*0$/ }));
    expect(screen.getByRole("tab", { name: /^Championships\s*0$/ })).toHaveAttribute("aria-selected", "true");
    openDisclosure("Badge collection");
    openDisclosure("Community polls");
    openDisclosure("Profile visibility");
    expect(document.querySelector("[data-dashboard-surface='badges']")).toBeVisible();
    expect(document.querySelector("[data-dashboard-surface='community-polls']")).toBeVisible();
    expect(document.querySelector('[data-profile-visibility-control="discord"]')).toBeVisible();
    expect(screen.getByRole("link", { name: /View\/Edit Profile/ })).toHaveAttribute("href", "/profile");
  });

  it("keeps historical registrations in read-only details without reusing legacy action anchors", async () => {
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

    const registrations = document.querySelector<HTMLDetailsElement>('details[data-dashboard-section="registrations"]');
    expect(registrations).not.toBeNull();
    if (!registrations!.open) fireEvent.click(registrations!.querySelector("summary")!);
    expect(screen.getByRole("heading", { name: "Command Centre Cup", level: 3 })).toBeVisible();
    expect(document.querySelectorAll('[data-registration-presentation="current"]')).toHaveLength(1);
    expect(document.querySelector('[data-dashboard-surface="registration-actions"]')).toBeVisible();
    expect(document.querySelectorAll('[data-registration-presentation="historical"]')).toHaveLength(historical.length);
    openDisclosure("Past registrations");
    for (const record of historical) {
      expect(screen.getByText(record.tournament_title)).toBeVisible();
      expect(document.getElementById(`registration-${record.id}`)).toBeNull();
    }
    for (const article of document.querySelectorAll('[data-registration-presentation="historical"]')) {
      expect(article.querySelector('[data-dashboard-surface="registration-actions"]')).toBeNull();
      expect(article).toHaveTextContent("Submitted ELO");
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
    expect(loadDashboardOverviewEventsMock).not.toHaveBeenCalled();
  });

  it("prioritizes the nearest available response and leaves the regular order when no response is due", () => {
    const now = Date.parse("2026-11-24T07:00:00Z");
    const match = {
      canConfirm: true, canDispute: true, status: "pending_confirmation" as const,
      confirmationDeadlineAt: "2026-11-24T08:00:00Z",
    };
    const offer = {
      id: "next-seat", launched_at: null, waitlist_offer_status: "offered" as const,
      waitlist_offer_expires_at: "2026-11-24T07:30:00Z",
    };
    const expired = { ...offer, id: "expired-seat", waitlist_offer_expires_at: "2026-11-24T06:30:00Z" };
    expect(getCompetitionPriority([match], [expired, offer], [], now))
      .toEqual({ section: "registrations", registrationId: offer.id });
    expect(getCompetitionPriority([match], [expired], [{ status: "pending" }], now))
      .toEqual({ section: "matches" });
    expect(getCompetitionPriority([], [expired], [{ status: "pending" }], now))
      .toEqual({ section: "invitations" });
    expect(getCompetitionPriority([], [expired], [{ status: "declined" }], now)).toBeNull();
  });
});

function openDisclosure(title: string) {
  const summary = Array.from(document.querySelectorAll("details > summary"))
    .find(element => element.querySelector("strong")?.textContent === title);
  if (!summary) throw new Error(`Expected ${title} disclosure`);
  fireEvent.click(summary);
}

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
