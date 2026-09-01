import { describe, expect, it, vi } from "vitest";
import {
  buildDashboardBadgeDataFromAwards,
  loadPlayerBadgeAwards,
  mapPlayerBadgeAwardRows,
} from "@/lib/badges/read";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
type BadgeAwardReadClient = Parameters<typeof loadPlayerBadgeAwards>[0];

function createAwardReadClient({
  data,
  error = null,
}: {
  data?: unknown;
  error?: { code?: string; message: string } | null;
}) {
  const result = { data: data ?? [], error };
  const query = {
    eq: vi.fn(() => query),
    order: vi.fn(async () => result),
    select: vi.fn(() => query),
  };
  const from = vi.fn(() => query);

  return {
    client: { from } as unknown as BadgeAwardReadClient,
    from,
    query,
  };
}

describe("badge award reads", () => {
  it("maps real award rows into the dashboard badge contract", async () => {
    const fixture = createAwardReadClient({
      data: [
        {
          id: "award-1",
          badge_slug: "first-victory",
          unlocked_at: "2026-08-03T18:30:00.000Z",
          original_unlocked_at: "2026-08-03T18:00:00.000Z",
          source_metadata: { evidenceLabel: "Match #1" },
        },
      ],
    });

    const result = await buildDashboardBadgeDataFromAwards(
      fixture.client,
      PLAYER_ID
    );

    expect(fixture.from).toHaveBeenCalledWith("player_badge_awards");
    expect(fixture.query.eq).toHaveBeenCalledWith("player_id", PLAYER_ID);
    expect(fixture.query.order).toHaveBeenCalledWith("unlocked_at", {
      ascending: false,
    });
    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("Expected Badge data.");
    expect(result.data.collection.earnedCount).toBe(1);
    expect(
      result.data.collection.items.find(
        (item) => item.definition.slug === "first-victory"
      )
    ).toMatchObject({
      state: "earned",
      award: {
        awardId: "award-1",
        badgeSlug: "first-victory",
        awardedAt: "2026-08-03T18:30:00.000Z",
        originalAwardedAt: "2026-08-03T18:00:00.000Z",
        evidenceLabel: "Match #1",
      },
    });
  });

  it("ignores non-canonical or malformed award rows", () => {
    expect(
      mapPlayerBadgeAwardRows([
        {
          id: "award-1",
          badge_slug: "first-deployment",
          unlocked_at: "2026-08-03T18:30:00.000Z",
          original_unlocked_at: null,
          source_metadata: {},
        },
        {
          id: "award-2",
          badge_slug: "invented-badge",
          unlocked_at: "2026-08-03T18:30:00.000Z",
          original_unlocked_at: null,
          source_metadata: {},
        },
        {
          id: "award-3",
          badge_slug: "first-victory",
          unlocked_at: "not-a-date",
          original_unlocked_at: null,
          source_metadata: {},
        },
      ])
    ).toEqual([
      {
        awardId: "award-1",
        badgeSlug: "first-deployment",
        awardedAt: "2026-08-03T18:30:00.000Z",
        originalAwardedAt: null,
        evidenceLabel: null,
      },
    ]);
  });

  it("returns an explicit error instead of presenting a false empty collection", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fixture = createAwardReadClient({
      error: { code: "42501", message: "permission denied" },
    });

    const awards = await loadPlayerBadgeAwards(fixture.client, PLAYER_ID);

    expect(awards).toEqual({ status: "error", code: "award-load-failed" });
    expect(consoleError).toHaveBeenCalledWith(
      "Player badge awards load failed.",
      {
        operation: "load-player-badge-awards",
        code: "42501",
      }
    );

    consoleError.mockRestore();
  });
});
