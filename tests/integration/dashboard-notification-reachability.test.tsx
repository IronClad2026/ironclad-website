import {
  isValidElement,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const dashboardNotificationsMock = vi.hoisted(() => vi.fn(() => null));
const inAppNotificationCenterMock = vi.hoisted(() => vi.fn(() => null));
const loadPlayerCareerDashboardMock = vi.hoisted(() => vi.fn());
const loadPlayerNotificationsMock = vi.hoisted(() => vi.fn());
const loadCommunityPollsForRequestMock = vi.hoisted(() => vi.fn());
const pollsAndDecisionsMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/components/DashboardChampionHistory", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/components/DashboardMatchHistory", () => ({
  default: vi.fn(() => null),
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

vi.mock("@/components/PublicProfileVisibilityCard", () => ({
  default: vi.fn(() => null),
}));

vi.mock("@/components/PollsAndDecisions", () => ({
  default: pollsAndDecisionsMock,
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

import PlayerDashboardPage from "@/app/dashboard/page";

const matchNotifications = [
  {
    id: "report_group:11111111-1111-4111-8111-111111111111",
    status: "pending_confirmation",
  },
];

const ordinaryNotifications = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    readAt: null,
  },
];

describe("dashboard notification reachability", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "user_reachability_player" });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(
      createDashboardClient()
    );
    loadPlayerCareerDashboardMock.mockResolvedValue({
      notifications: matchNotifications,
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
      notifications: ordinaryNotifications,
      totalCount: 7,
      unreadCount: 3,
      error: null,
    });
    loadCommunityPollsForRequestMock.mockResolvedValue({
      polls: [],
      error: null,
    });
  });

  it("separates match-result actions from ordinary unified notifications", async () => {
    const page = await PlayerDashboardPage();
    const dashboardNotifications = findElements(
      page,
      dashboardNotificationsMock
    );
    const unifiedNotificationCenters = findElements(
      page,
      inAppNotificationCenterMock
    );

    expect(dashboardNotifications).toHaveLength(1);
    expect(dashboardNotifications[0].props).toEqual({
      notifications: matchNotifications,
    });

    expect(unifiedNotificationCenters).toHaveLength(1);
    expect(unifiedNotificationCenters[0].props).toMatchObject({
      scope: "player",
      notifications: ordinaryNotifications,
      totalCount: 7,
      unreadCount: 3,
      error: null,
    });
    expect(unifiedNotificationCenters[0].props).not.toHaveProperty(
      "matchNotifications"
    );

    const communityPollSections = findElements(page, pollsAndDecisionsMock);
    expect(communityPollSections).toHaveLength(1);
    expect(communityPollSections[0].props).toMatchObject({
      surface: "community",
      initialPolls: [],
      initialError: null,
    });
  });
});

function createDashboardClient() {
  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
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
