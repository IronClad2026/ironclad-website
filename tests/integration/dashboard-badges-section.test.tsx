import {
  isValidElement,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const dashboardBadgesSectionMock = vi.hoisted(() => vi.fn(() => null));
const dashboardChampionHistoryMock = vi.hoisted(() => vi.fn(() => null));
const dashboardMatchHistoryMock = vi.hoisted(() => vi.fn(() => null));
const dashboardNotificationsMock = vi.hoisted(() => vi.fn(() => null));
const inAppNotificationCenterMock = vi.hoisted(() => vi.fn(() => null));
const loadPlayerCareerDashboardMock = vi.hoisted(() => vi.fn());
const loadPlayerNotificationsMock = vi.hoisted(() => vi.fn());
const loadCommunityPollsForRequestMock = vi.hoisted(() => vi.fn());
const pollsAndDecisionsMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/components/badges/DashboardBadgesSection", () => ({
  default: dashboardBadgesSectionMock,
}));

vi.mock("@/components/DashboardChampionHistory", () => ({
  default: dashboardChampionHistoryMock,
}));

vi.mock("@/components/DashboardMatchHistory", () => ({
  default: dashboardMatchHistoryMock,
}));

vi.mock("@/components/DashboardNotifications", () => ({
  default: dashboardNotificationsMock,
}));

vi.mock("@/components/DiscordContactVisibilityCard", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/components/InAppNotificationCenter", () => ({
  default: inAppNotificationCenterMock,
}));

vi.mock("@/components/PollsAndDecisions", () => ({
  default: pollsAndDecisionsMock,
}));

vi.mock("@/components/PublicProfileVisibilityCard", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/lib/notifications", () => ({
  loadPlayerNotifications: loadPlayerNotificationsMock,
}));

vi.mock("@/lib/i18n/request", () => ({
  getRequestLocale: vi.fn(async () => "en"),
}));

vi.mock("@/lib/player-dashboard", () => ({
  loadPlayerCareerDashboard: loadPlayerCareerDashboardMock,
}));

vi.mock("@/lib/player-polls", () => ({
  loadCommunityPollsForRequest: loadCommunityPollsForRequestMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));

import DashboardBadgesSection from "@/components/badges/DashboardBadgesSection";
import type { DashboardBadgesSectionProps } from "@/components/badges/DashboardBadgesSection";
import PlayerDashboardPage from "@/app/dashboard/page";

describe("dashboard badge section integration", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "user_dashboard_badges" });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(
      createDashboardClient()
    );
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
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("passes compact production-safe badge data and preserves existing dashboard sections", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const page = await PlayerDashboardPage();
    const badgeSections = findElements(page, DashboardBadgesSection);
    const badgeSectionProps = badgeSections[0]
      .props as DashboardBadgesSectionProps;
    const client = await createAuthenticatedSupabaseClientMock.mock.results[0]
      .value;

    expect(badgeSections).toHaveLength(1);
    expect(badgeSectionProps).not.toHaveProperty("fixtureData");
    expect(badgeSectionProps.badgeData.collection.items).toHaveLength(30);
    expect(
      badgeSectionProps.badgeData.collection.items.every(
        (item) => item.state === "locked"
      )
    ).toBe(true);
    expect(badgeSectionProps.badgeData).not.toHaveProperty(
      "pendingRevealQueue"
    );
    expect(client.from.mock.calls.map(([table]: [string]) => table)).toEqual([
      "players",
      "registrations",
    ]);
    expect(findElements(page, dashboardNotificationsMock)).toHaveLength(1);
    expect(findElements(page, inAppNotificationCenterMock)).toHaveLength(1);
    expect(findElements(page, pollsAndDecisionsMock)).toHaveLength(1);
    expect(findElements(page, dashboardChampionHistoryMock)).toHaveLength(1);
    expect(findElements(page, dashboardMatchHistoryMock)).toHaveLength(1);
  });

  it("does not pass dashboard fixture data in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const page = await PlayerDashboardPage();
    const [badgeSection] = findElements(page, DashboardBadgesSection);
    const props = badgeSection.props as DashboardBadgesSectionProps;

    expect(props).not.toHaveProperty("fixtureData");
    expect(
      props.badgeData.collection.items.filter((item) => item.state === "earned")
    ).toHaveLength(0);
    expect(props.badgeData.collection.items).toHaveLength(30);
  });
});

function createDashboardClient() {
  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: {
        id: "player-dashboard-badges",
        clerk_user_id: "user_dashboard_badges",
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
      error: null,
    })),
  };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);

  const registrationsQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(async () => ({ data: [], error: null })),
  };
  registrationsQuery.select.mockReturnValue(registrationsQuery);
  registrationsQuery.eq.mockReturnValue(registrationsQuery);

  return {
    from: vi.fn((table: string) => {
      if (table === "players") return profileQuery;
      if (table === "registrations") return registrationsQuery;
      throw new Error(`Unexpected dashboard table: ${table}`);
    }),
  };
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

    if (!isValidElement<Record<string, unknown>>(candidate)) {
      return;
    }

    if (candidate.type === type) {
      matches.push(candidate);
    }

    visit(candidate.props.children as ReactNode);
  }

  visit(node);
  return matches;
}
