import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const adminPage = source("app/admin/page.tsx");
const systemPage = source("app/admin/system/page.tsx");
const eloActions = source("app/admin/elo-verification-actions.ts");
const leaderboardActions = source("app/admin/leaderboard-actions.ts");

describe("Admin System & Recovery route contract", () => {
  it("moves the existing advanced presentations behind an Admin page guard", () => {
    expect(systemPage.indexOf("await auth()"))
      .toBeLessThan(systemPage.indexOf("await Promise.all"));
    expect(systemPage).toContain('role !== "admin"');
    expect(systemPage).toContain("AdminLeaderboardControls");
    expect(systemPage).toContain("AdminEloVerificationChecker");
    expect(systemPage).toContain("Leaderboard Recovery");
    expect(systemPage).toContain("Legacy Compatibility");
  });

  it("stops only the duplicate advanced and global bracket surfaces on /admin", () => {
    expect(adminPage).not.toContain("AdminBracketManagement");
    expect(adminPage).not.toContain("AdminLeaderboardControls");
    expect(adminPage).not.toContain("AdminEloVerificationChecker");
    expect(adminPage).not.toContain('.from("generated_brackets")');
    expect(adminPage).not.toContain("tournament_bracket_map_pool_entries");

    expect(adminPage).toContain("AdminRegistrationReviewRows");
    expect(adminPage).toContain("approveSelectedRegistrations");
    expect(adminPage).toContain('id="registration-review"');
    expect(adminPage).toContain("InAppNotificationCenter");
    expect(adminPage).toContain("bracketNoticeMessages");
    expect(adminPage).toContain("Open Tournament workspace");
  });

  it("revalidates the new authoritative presentation route after existing actions", () => {
    expect(revalidationPaths(eloActions)).toEqual([
      "/admin/system",
      "/admin/system",
    ]);
    expect(revalidationPaths(leaderboardActions)).toEqual([
      "/admin/system",
      "/admin/system",
    ]);
  });
});

function revalidationPaths(value: string) {
  return [...value.matchAll(/revalidatePath\("([^"]+)"\)/g)].map(
    (match) => match[1]
  );
}
