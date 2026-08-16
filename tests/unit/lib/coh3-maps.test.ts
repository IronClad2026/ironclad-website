import { describe, expect, it } from "vitest";
import {
  isEligibleOneVersusOnePoolMap,
  parseCoh3MapInput,
  projectPublicCoh3Map,
  type Coh3MapRow,
} from "@/lib/coh3-maps";

const officialMap: Coh3MapRow = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  slug: "road-to-tunis",
  displayName: "Road to Tunis",
  sourceType: "official",
  creatorName: "Community Cartographer",
  gameMode: "1v1",
  status: "active",
  thumbnailPath: null,
  sourceReference: "https://example.invalid/official-source",
  adminNote: "Private verification note",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  createdByClerkUserId: "admin_private",
  updatedByClerkUserId: "admin_private",
};

describe("CoH3 map catalogue domain", () => {
  it("records official-client distribution independently of authorship", () => {
    expect(officialMap.sourceType).toBe("official");
    expect(officialMap.creatorName).toBe("Community Cartographer");
  });

  it("validates modes, statuses, attribution, and a nullable thumbnail", () => {
    expect(
      parseCoh3MapInput({
        slug: "community-crossing",
        displayName: "  Community Crossing  ",
        sourceType: "community",
        creatorName: "Map Author",
        gameMode: "1v1",
        status: "temporarily_disabled",
        thumbnailPath: null,
        sourceReference: "https://example.invalid/workshop-map",
        adminNote: "Curated by IronClad",
      })
    ).toEqual({
      ok: true,
      value: {
        slug: "community-crossing",
        displayName: "Community Crossing",
        sourceType: "community",
        creatorName: "Map Author",
        gameMode: "1v1",
        status: "temporarily_disabled",
        thumbnailPath: null,
        sourceReference: "https://example.invalid/workshop-map",
        adminNote: "Curated by IronClad",
      },
    });

    expect(
      parseCoh3MapInput({
        slug: "invalid-map",
        displayName: "Invalid Map",
        sourceType: "official",
        creatorName: null,
        gameMode: "2v2",
        status: "active",
        thumbnailPath: null,
        sourceReference: null,
        adminNote: null,
      })
    ).toEqual({ ok: false, error: "Feature A supports 1v1 maps only." });

    expect(
      parseCoh3MapInput({
        slug: "Invalid Map Key",
        displayName: "Invalid Map",
        sourceType: "official",
        creatorName: null,
        gameMode: "1v1",
        status: "active",
        thumbnailPath: null,
        sourceReference: null,
        adminNote: null,
      })
    ).toEqual({
      ok: false,
      error: "Map keys must use lowercase letters, numbers, and single hyphens.",
    });
  });

  it("allows only active 1v1 maps into a new tournament pool", () => {
    expect(isEligibleOneVersusOnePoolMap(officialMap)).toBe(true);
    expect(
      isEligibleOneVersusOnePoolMap({
        ...officialMap,
        gameMode: "2v2",
      })
    ).toBe(false);
    expect(
      isEligibleOneVersusOnePoolMap({
        ...officialMap,
        status: "retired",
      })
    ).toBe(false);
  });

  it("projects an exact public shape without notes or actor identifiers", () => {
    expect(projectPublicCoh3Map(officialMap)).toEqual({
      id: officialMap.id,
      slug: "road-to-tunis",
      displayName: "Road to Tunis",
      sourceType: "official",
      creatorName: "Community Cartographer",
      gameMode: "1v1",
      status: "active",
      thumbnailPath: null,
      sourceReference: "https://example.invalid/official-source",
    });
    expect(projectPublicCoh3Map(officialMap)).not.toHaveProperty("adminNote");
    expect(projectPublicCoh3Map(officialMap)).not.toHaveProperty(
      "createdByClerkUserId"
    );
    expect(projectPublicCoh3Map(officialMap)).not.toHaveProperty(
      "updatedByClerkUserId"
    );
  });
});
