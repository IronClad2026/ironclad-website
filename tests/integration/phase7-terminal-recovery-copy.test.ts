import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import accountDashboardEnglish from "@/lib/i18n/dictionaries/en/account-dashboard";

const deleteAccountSource = readFileSync(
  resolve(process.cwd(), "components/DeleteAccountSection.tsx"),
  "utf8"
).replace(/\r\n/g, "\n");
const leaderboardControlsSource = readFileSync(
  resolve(process.cwd(), "components/AdminLeaderboardControls.tsx"),
  "utf8"
);
const dashboardSource = readFileSync(
  resolve(process.cwd(), "app/dashboard/page.tsx"),
  "utf8"
);

describe("Phase 7 terminal recovery copy", () => {
  it("explains competition-history-safe account closure truthfully", () => {
    expect(deleteAccountSource).toContain('t("deleteAccount.description")');
    expect(deleteAccountSource).toContain('t("deleteAccount.warning")');
    expect(deleteAccountSource).toContain('t("deleteAccount.typeDelete")');

    const { description, warning, typeDelete } =
      accountDashboardEnglish.deleteAccount;
    expect(description).toContain("live IronClad sign-in and profile identity");
    expect(description).toContain("Private account links are removed or neutralized");
    expect(description).toContain("champion history");
    expect(description).toContain("Former Competitor");
    expect(`${description} ${warning}`).toMatch(
      /referenced private Replay proof .* remain/i
    );
    expect(warning).toContain("Otherwise, your player record will be removed");
    expect(typeDelete).toBe("Type DELETE to confirm");
    expect(`${description} ${warning}`).not.toContain(
      "Permanently remove your Clerk account, player profile, and avatar"
    );
  });

  it("labels manual leaderboard recalculation as recovery-only", () => {
    expect(leaderboardControlsSource).toContain("Recovery only.");
    expect(leaderboardControlsSource).toContain(
      "Normal completed-tournament scoring runs"
    );
    expect(leaderboardControlsSource).toContain(
      "after a verified failure or an approved correction"
    );
    expect(leaderboardControlsSource).toContain(
      "does not resolve a season marked under review"
    );
    expect(leaderboardControlsSource).toContain(
      "Recovery: Recalculate Current Season"
    );
    expect(leaderboardControlsSource).toContain(
      "Recovery: Recalculate All-Time Ranking"
    );
    expect(leaderboardControlsSource).toContain(
      "Recovery: Recalculate Selected Tournament"
    );
  });

  it("includes tournament lifecycle events in dashboard notification wording", () => {
    expect(dashboardSource).toContain(
      't("dashboard.notificationCenter.description")'
    );
    expect(dashboardSource).toContain('t("dashboard.notificationCenter.empty")');
    expect(accountDashboardEnglish.dashboard.notificationCenter.description).toBe(
      "All account and Tournament updates, including Registrations, waitlist movement, and Match-result decisions."
    );
    expect(accountDashboardEnglish.dashboard.notificationCenter.empty).toBe(
      "Tournament, Registration, and Match updates will appear here."
    );
  });
});
