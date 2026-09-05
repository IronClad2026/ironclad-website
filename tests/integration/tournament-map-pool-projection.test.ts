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
        divisionName: "Academy Bracket",
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

  it("orders raw division identities before converting them to public labels", () => {
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
      "Academy Bracket",
      "Challenge Bracket",
      "Main / Pro Bracket",
    ]);
  });

  it("orders maps by normalized display name with an ID tie-break", () => {
    const map = (id: string, displayName: string) => ({
      id,
      slug: id,
      displayName,
      sourceType: "official" as const,
      creatorName: null,
      gameMode: "1v1" as const,
      status: "active" as const,
      thumbnailPath: null,
      sourceReference: null,
      adminNote: null,
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
      createdByClerkUserId: null,
      updatedByClerkUserId: null,
    });

    const projected = projectPublishedTournamentMapPools([
      {
        id: "bracket-main",
        name: "Main",
        mapPoolPublishedAt: "2026-08-15T00:00:00.000Z",
        launchedAt: "2026-08-16T00:00:00.000Z",
        entries: [
          {
            addedAt: "2026-08-15T00:00:00.000Z",
            removedAt: null,
            map: map("map-zulu", "Zulu Crossing"),
          },
          {
            addedAt: "2026-08-15T00:00:00.000Z",
            removedAt: null,
            map: map("map-alpha-b", "  Alpha   Front  "),
          },
          {
            addedAt: "2026-08-15T00:00:00.000Z",
            removedAt: null,
            map: map("map-alpha-a", "alpha front"),
          },
        ],
      },
    ]);

    expect(projected[0]?.maps.map((entry) => entry.id)).toEqual([
      "map-alpha-a",
      "map-alpha-b",
      "map-zulu",
    ]);
  });
});
