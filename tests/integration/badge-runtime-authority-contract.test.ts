import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "lib/badges/authority.ts"),
  "utf8"
);

describe("Badge runtime authority contract", () => {
  it("is server-only and persists awards idempotently", () => {
    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).toContain('.from("player_badge_awards")');
    expect(source).toContain("ignoreDuplicates: true");
    expect(source).toContain('onConflict: "player_id,badge_slug"');
    expect(source).toContain('.select("id, badge_slug")');
    expect(source).not.toContain("standard_reveal_seen_at:");
    expect(source).not.toContain("premium_reveal_seen_at:");
  });

  it("creates a notification only after a new award row is returned", () => {
    const persistStart = source.indexOf("async function persistBadgeAward");
    const persistEnd = source.indexOf(
      "function isIronCladRecruitQualified",
      persistStart
    );
    const persist = source.slice(persistStart, persistEnd);

    expect(persist).toContain("if (!createdAward)");
    expect(persist.indexOf("if (!createdAward)")).toBeLessThan(
      persist.indexOf("createBadgeUnlockedNotification")
    );
    expect(persist).toContain('input.evaluationMode !== "backfill"');
  });

  it("excludes closed accounts from global and explicit backfill targets", () => {
    const loaderStart = source.indexOf("async function loadBackfillPlayerIds");
    const loaderEnd = source.indexOf("async function", loaderStart + 20);
    const loader = source.slice(loaderStart, loaderEnd);

    expect(loader).toContain('.is("account_closed_at", null)');
    expect(loader).toContain("query.in(\"id\", uniqueRequestedIds)");
    expect(loader.indexOf('.is("account_closed_at", null)')).toBeLessThan(
      loader.indexOf('query.in("id", uniqueRequestedIds)')
    );
  });
});
