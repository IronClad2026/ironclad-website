import { describe, expect, it } from "vitest";
import { projectPublishedTournamentMapPools } from "@/lib/tournament-map-pools";

describe("published tournament map-pool projection", () => {
  it("returns published current entries and strips private catalogue fields", () => {
    const projected = projectPublishedTournamentMapPools([
      {
        id: "bracket-academy",
        name: "Academy",
        mapPoolPublishedAt: "2026-08-15T00:00:00.000Z",
        launchedAt: null,
        entries: [
          {
            addedAt: "2026-08-15T00:00:00.000Z",
            removedAt: null,
            map: {
              id: "map-current",
              slug: "current-map",
              displayName: "Current Map",
              sourceType: "official",
              creatorName: null,
              gameMode: "1v1",
              status: "active",
              thumbnailPath: null,
              sourceReference: null,
              adminNote: "private",
              createdAt: "2026-08-15T00:00:00.000Z",
              updatedAt: "2026-08-15T00:00:00.000Z",
              createdByClerkUserId: "admin_private",
              updatedByClerkUserId: "admin_private",
            },
          },
          {
            addedAt: "2026-08-14T00:00:00.000Z",
            removedAt: "2026-08-15T00:00:00.000Z",
            map: {
              id: "map-removed",
              slug: "removed-map",
              displayName: "Removed Map",
              sourceType: "official",
              creatorName: null,
              gameMode: "1v1",
              status: "retired",
              thumbnailPath: null,
              sourceReference: null,
              adminNote: null,
              createdAt: "2026-08-14T00:00:00.000Z",
              updatedAt: "2026-08-15T00:00:00.000Z",
              createdByClerkUserId: null,
              updatedByClerkUserId: null,
            },
          },
        ],
      },
      {
        id: "bracket-challenge",
        name: "Challenge",
        mapPoolPublishedAt: null,
        launchedAt: null,
        entries: [],
      },
    ]);

    expect(projected).toEqual([
      {
        bracketId: "bracket-academy",
        divisionName: "Academy",
        publishedAt: "2026-08-15T00:00:00.000Z",
        launchedAt: null,
        maps: [
          {
            id: "map-current",
            slug: "current-map",
            displayName: "Current Map",
            sourceType: "official",
            creatorName: null,
            gameMode: "1v1",
            status: "active",
            thumbnailPath: null,
            sourceReference: null,
          },
        ],
      },
    ]);
    expect(JSON.stringify(projected)).not.toContain("private");
    expect(JSON.stringify(projected)).not.toContain("map-removed");
  });

  it("orders published pools Academy, Challenge, then Main / Pro", () => {
    const projected = projectPublishedTournamentMapPools(
      ["Main", "Academy", "Challenge"].map((name) => ({
        id: `bracket-${name.toLowerCase()}`,
        name,
        mapPoolPublishedAt: "2026-08-15T00:00:00.000Z",
        launchedAt: null,
        entries: [],
      }))
    );

    expect(projected.map((pool) => pool.divisionName)).toEqual([
      "Academy",
      "Challenge",
      "Main",
    ]);
  });
});
