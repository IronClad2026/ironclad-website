import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const dashboardBadgeCollectionMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/components/badges/DashboardBadgeCollection", () => ({
  default: dashboardBadgeCollectionMock,
}));

import DashboardBadgeCollection from "@/components/badges/DashboardBadgeCollection";
import type { DashboardBadgeCollectionProps } from "@/components/badges/DashboardBadgeCollection";
import DashboardBadgeCollectionPage from "@/app/dashboard/badges/page";

describe("dashboard badge collection page", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "user_dashboard_badges" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the authenticated full collection page with production-safe empty awards", async () => {
    const page = await DashboardBadgeCollectionPage();
    const collection = findElement(page, DashboardBadgeCollection);
    const props = collection.props as DashboardBadgeCollectionProps;

    expect(authMock).toHaveBeenCalledTimes(1);
    expect(props.badgeData.collection.items).toHaveLength(30);
    expect(props.badgeData.collection.earnedCount).toBe(0);
    expect(
      props.badgeData.collection.items.every((item) => item.state === "locked")
    ).toBe(true);
    expect(props.badgeData.entitlement).toEqual({
      premiumEffectsEnabled: false,
    });
    expect(props.badgeData).not.toHaveProperty("pendingRevealQueue");
  });
});

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
