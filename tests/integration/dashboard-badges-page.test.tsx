import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const dashboardBadgeCollectionMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/components/badges/DashboardBadgeCollection", () => ({
  default: dashboardBadgeCollectionMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));

import DashboardBadgeCollection from "@/components/badges/DashboardBadgeCollection";
import type { DashboardBadgeCollectionProps } from "@/components/badges/DashboardBadgeCollection";
import DashboardBadgeCollectionPage from "@/app/dashboard/badges/page";

describe("dashboard badge collection page", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "user_dashboard_badges" });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(
      createDashboardBadgePageClient()
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the authenticated full collection page with real award rows", async () => {
    const page = await DashboardBadgeCollectionPage();
    const collection = findElement(page, DashboardBadgeCollection);
    const props = collection.props as DashboardBadgeCollectionProps;
    const client = await createAuthenticatedSupabaseClientMock.mock.results[0]
      .value;

    expect(authMock).toHaveBeenCalledTimes(1);
    expect(client.from.mock.calls.map(([table]: [string]) => table)).toEqual([
      "players",
      "player_badge_awards",
    ]);
    expect(props.badgeData.collection.items).toHaveLength(30);
    expect(props.badgeData.collection.earnedCount).toBe(1);
    expect(
      props.badgeData.collection.items.find(
        (item) => item.definition.slug === "first-deployment"
      )
    ).toMatchObject({
      state: "earned",
      award: expect.objectContaining({
        badgeSlug: "first-deployment",
        awardedAt: "2026-08-02T12:00:00.000Z",
      }),
    });
    expect(props.badgeData.entitlement).toEqual({
      premiumEffectsEnabled: false,
    });
    expect(props.badgeData).not.toHaveProperty("pendingRevealQueue");
  });

  it("keeps production empty awards at 0/30 when no rows exist", async () => {
    createAuthenticatedSupabaseClientMock.mockResolvedValue(
      createDashboardBadgePageClient({ awards: [] })
    );

    const page = await DashboardBadgeCollectionPage();
    const collection = findElement(page, DashboardBadgeCollection);
    const props = collection.props as DashboardBadgeCollectionProps;

    expect(props.badgeData.collection.earnedCount).toBe(0);
    expect(
      props.badgeData.collection.items.every((item) => item.state === "locked")
    ).toBe(true);
  });
});

function createDashboardBadgePageClient({
  awards = [
    {
      id: "award-first-deployment",
      badge_slug: "first-deployment",
      unlocked_at: "2026-08-02T12:00:00.000Z",
      original_unlocked_at: "2026-08-02T12:00:00.000Z",
      source_metadata: {},
    },
  ],
}: {
  awards?: Array<Record<string, unknown>>;
} = {}) {
  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: { id: "player-dashboard-badges" },
      error: null,
    })),
  };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);

  const badgeAwardsQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(async () => ({ data: awards, error: null })),
  };
  badgeAwardsQuery.select.mockReturnValue(badgeAwardsQuery);
  badgeAwardsQuery.eq.mockReturnValue(badgeAwardsQuery);

  return {
    from: vi.fn((table: string) => {
      if (table === "players") return profileQuery;
      if (table === "player_badge_awards") return badgeAwardsQuery;
      throw new Error(`Unexpected badge page table: ${table}`);
    }),
  };
}

function findElement(
  node: ReactNode,
  type: typeof DashboardBadgeCollection
): ReactElement<Record<string, unknown>> {
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

  if (matches.length !== 1) {
    throw new Error(`Expected exactly one matching element, found ${matches.length}.`);
  }

  return matches[0];
}
