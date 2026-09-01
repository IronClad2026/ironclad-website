import { describe, expect, it, vi } from "vitest";

import { loadPlayerBadgeRevealDashboardState } from "@/lib/badges/reveals";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
type BadgeRevealReadClient = Parameters<
  typeof loadPlayerBadgeRevealDashboardState
>[0];

describe("badge reveal read state", () => {
  it("returns unrevealed awards and excludes acknowledged awards", async () => {
    const fixture = createRevealReadClient({
      awards: [
        awardRow("00000000-0000-4000-8000-000000000001", "first-victory", "2026-08-02T10:00:00.000Z"),
        awardRow("00000000-0000-4000-8000-000000000002", "elite-champion", "2026-08-03T10:00:00.000Z"),
      ],
      reveals: [
        {
          player_badge_award_id:
            "00000000-0000-4000-8000-000000000002",
        },
      ],
    });

    const state = await loadPlayerBadgeRevealDashboardState(
      fixture.client,
      PLAYER_ID
    );

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error("Expected reveal state.");
    expect(state.pendingReveals.map((item) => item.id)).toEqual([
      "00000000-0000-4000-8000-000000000001",
    ]);
    expect(state.pendingReveals[0]).toMatchObject({
      item: {
        definition: {
          slug: "first-victory",
          name: "First Victory",
          rarity: "common",
          unlockMeaning: expect.any(String),
          assets: { artwork: "/assets/badges/3.png" },
        },
        award: { isUnrevealed: true },
      },
      queuedAt: "2026-08-02T10:00:00.000Z",
    });
  });

  it("orders pending reveals oldest first with an award-ID tie break", async () => {
    const fixture = createRevealReadClient({
      awards: [
        awardRow("00000000-0000-4000-8000-000000000003", "elite-champion", "2026-08-03T10:00:00.000Z"),
        awardRow("00000000-0000-4000-8000-000000000002", "first-victory", "2026-08-03T10:00:00.000Z"),
        awardRow("00000000-0000-4000-8000-000000000001", "ironclad-recruit", "2026-08-01T10:00:00.000Z"),
      ],
    });

    const state = await loadPlayerBadgeRevealDashboardState(
      fixture.client,
      PLAYER_ID
    );

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error("Expected reveal state.");
    expect(state.pendingReveals.map((item) => item.id)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ]);
  });

  it("fails closed when reveal state cannot be loaded", async () => {
    const fixture = createRevealReadClient({
      awards: [
        awardRow("00000000-0000-4000-8000-000000000001", "first-victory", "2026-08-02T10:00:00.000Z"),
      ],
      revealError: { code: "42P01" },
    });

    const state = await loadPlayerBadgeRevealDashboardState(
      fixture.client,
      PLAYER_ID
    );

    expect(state).toEqual({
      status: "error",
      code: "reveal-load-failed",
    });
  });
});

function awardRow(id: string, badge_slug: string, unlocked_at: string) {
  return {
    id,
    badge_slug,
    unlocked_at,
    original_unlocked_at: unlocked_at,
    source_metadata: {},
  };
}

function createRevealReadClient({
  awards,
  reveals = [],
  revealError = null,
}: {
  awards: Array<Record<string, unknown>>;
  reveals?: Array<Record<string, unknown>>;
  revealError?: { code: string } | null;
}) {
  const awardsQuery = chainQuery();
  awardsQuery.order.mockResolvedValue({ data: awards, error: null });

  const revealsQuery = chainQuery();
  revealsQuery.eq.mockResolvedValue({ data: reveals, error: revealError });

  const from = vi.fn((table: string) => {
      if (table === "player_badge_awards") return awardsQuery;
      if (table === "player_badge_reveals") return revealsQuery;
      throw new Error(`Unexpected badge reveal table: ${table}`);
    });

  return {
    client: { from } as unknown as BadgeRevealReadClient,
    from,
  };
}

function chainQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}
