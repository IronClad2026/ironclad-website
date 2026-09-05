import {
  isValidElement,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import italianBadgesDictionary from "@/lib/i18n/dictionaries/it/badges";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const dashboardBadgesSectionMock = vi.hoisted(() => vi.fn(() => null));
const loadPlayerCareerDashboardMock = vi.hoisted(() => vi.fn());
const loadPlayerNotificationsMock = vi.hoisted(() => vi.fn());
const loadCommunityPollsForRequestMock = vi.hoisted(() => vi.fn());
const loadPlayerTournamentDivisionInvitationsMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/app/dashboard/badge-reveal-actions", () => ({
  acknowledgeBadgeReveal: vi.fn(),
}));
vi.mock("@/components/badges/DashboardBadgesSection", () => ({
  default: dashboardBadgesSectionMock,
}));
vi.mock("@/components/DashboardChampionHistory", () => ({
  default: vi.fn(() => null),
}));
vi.mock("@/components/DashboardMatchHistory", () => ({
  default: vi.fn(() => null),
}));
vi.mock("@/components/DashboardNotifications", () => ({
  default: vi.fn(() => null),
}));
vi.mock("@/components/DiscordContactVisibilityCard", () => ({
  default: vi.fn(() => null),
}));
vi.mock("@/components/InAppNotificationCenter", () => ({
  default: vi.fn(() => null),
}));
vi.mock("@/components/PollsAndDecisions", () => ({
  default: vi.fn(() => null),
}));
vi.mock("@/components/PublicProfileVisibilityCard", () => ({
  default: vi.fn(() => null),
}));
vi.mock("@/lib/i18n/request", () => ({
  getRequestLocale: vi.fn(async () => "it"),
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
import DashboardBadgesSection, {
  type DashboardBadgesSectionProps,
} from "@/components/badges/DashboardBadgesSection";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const AWARD_ID = "22222222-2222-4222-8222-222222222222";

describe("dashboard Badge section integration", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "user-dashboard-badges" });
    loadPlayerCareerDashboardMock.mockResolvedValue({
      notifications: [],
      champions: [],
      statistics: {
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        winRate: 0,
        tournamentsParticipated: 0,
        tournamentsWon: 0,
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
  });

  it("passes real owned and pending Badge state into the current dashboard", async () => {
    const client = createDashboardClient();
    createAuthenticatedSupabaseClientMock.mockResolvedValue(client);

    const props = getBadgeSectionProps(await PlayerDashboardPage());

    expect(props.locale).toBe("it");
    expect(props.dictionary).toMatchObject({
      dashboard: { title: italianBadgesDictionary.dashboard.title },
    });
    expect(props.badgeData?.collection.items).toHaveLength(30);
    expect(props.badgeData?.collection.earnedCount).toBe(1);
    expect(
      props.badgeData?.collection.items.find(
        (item) => item.definition.slug === "first-victory"
      )
    ).toMatchObject({
      state: "earned",
      award: {
        awardId: AWARD_ID,
        isUnrevealed: true,
      },
    });
    expect(props.pendingReveals?.map((item) => item.id)).toEqual([AWARD_ID]);
    expect(props.loadError).toBeNull();
    expect(props.revealLoadError).toBeNull();
    expect(client.from.mock.calls.map(([table]) => table)).toEqual([
      "players",
      "registrations",
      "player_badge_awards",
      "player_badge_reveals",
    ]);
  });

  it("keeps an award read error distinct from a legitimate zero total", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(
      createDashboardClient({ awardError: { code: "42P01" } })
    );

    const props = getBadgeSectionProps(await PlayerDashboardPage());

    expect(props.badgeData).toBeNull();
    expect(props.pendingReveals).toEqual([]);
    expect(props.loadError).toBe(
      italianBadgesDictionary.dashboard.loadErrorDescription
    );
    expect(props.revealLoadError).toBeNull();
  });

  it("fails closed instead of replaying awards when reveal state is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(
      createDashboardClient({ revealError: { code: "42501" } })
    );

    const props = getBadgeSectionProps(await PlayerDashboardPage());

    expect(props.badgeData).toBeNull();
    expect(props.pendingReveals).toEqual([]);
    expect(props.loadError).toBeNull();
    expect(props.revealLoadError).toBe(
      italianBadgesDictionary.dashboard.loadErrorDescription
    );
  });

  it("propagates a dashboard player read failure as an unavailable state", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = createDashboardClient({
      playerError: { code: "42501" },
    });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(client);

    const props = getBadgeSectionProps(await PlayerDashboardPage());

    expect(props.badgeData).toBeNull();
    expect(props.pendingReveals).toEqual([]);
    expect(props.loadError).toBe(
      italianBadgesDictionary.dashboard.loadErrorDescription
    );
    expect(props.revealLoadError).toBeNull();
    expect(client.from.mock.calls.map(([table]) => table)).toEqual([
      "players",
      "registrations",
    ]);
  });
});

function createDashboardClient({
  awards = [
    {
      id: AWARD_ID,
      badge_slug: "first-victory",
      unlocked_at: "2026-08-03T18:30:00.000Z",
      original_unlocked_at: "2026-08-03T18:30:00.000Z",
      source_metadata: {},
    },
  ],
  playerError = null,
  awardError = null,
  revealError = null,
}: {
  awards?: Array<Record<string, unknown>>;
  playerError?: { code: string } | null;
  awardError?: { code: string } | null;
  revealError?: { code: string } | null;
} = {}) {
  const profileQuery = chainQuery();
  profileQuery.maybeSingle.mockResolvedValue({
    data: playerError
      ? null
      : {
          id: PLAYER_ID,
          clerk_user_id: "user-dashboard-badges",
          display_name: "Badge Tester",
          in_game_name: "BadgeTester",
          discord_username: null,
          steam_username: null,
          coh3_player_card_url: null,
          country: null,
          region: null,
          timezone: null,
          current_elo: null,
          avatar_url: null,
          bio: null,
          profile_completed: true,
          public_profile_enabled: false,
          discord_public_enabled: false,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        },
    error: playerError,
  });

  const registrationsQuery = chainQuery();
  registrationsQuery.order.mockResolvedValue({ data: [], error: null });

  const badgeAwardsQuery = chainQuery();
  badgeAwardsQuery.order.mockResolvedValue({
    data: awardError ? null : awards,
    error: awardError,
  });

  const badgeRevealsQuery = chainQuery();
  badgeRevealsQuery.eq.mockResolvedValue({
    data: revealError ? null : [],
    error: revealError,
  });

  return {
    from: vi.fn((table: string) => {
      if (table === "players") return profileQuery;
      if (table === "registrations") return registrationsQuery;
      if (table === "player_badge_awards") return badgeAwardsQuery;
      if (table === "player_badge_reveals") return badgeRevealsQuery;
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

function getBadgeSectionProps(node: ReactNode): DashboardBadgesSectionProps {
  const elements = findElements(node, DashboardBadgesSection);
  expect(elements).toHaveLength(1);
  return elements[0].props as unknown as DashboardBadgesSectionProps;
}

function findElements(
  node: ReactNode,
  type: ElementType
): Array<ReactElement<Record<string, unknown>>> {
  const matches: Array<ReactElement<Record<string, unknown>>> = [];

  function visit(candidate: ReactNode) {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }

    if (!isValidElement<Record<string, unknown>>(candidate)) return;
    if (candidate.type === type) matches.push(candidate);
    visit(candidate.props.children as ReactNode);
  }

  visit(node);
  return matches;
}
