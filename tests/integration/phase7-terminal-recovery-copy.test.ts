import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const deleteAccountSource = readFileSync(
  resolve(process.cwd(), "components/DeleteAccountSection.tsx"),
  "utf8"
);
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
    expect(deleteAccountSource).toContain(
      "live IronClad sign-in and profile identity"
    );
    expect(deleteAccountSource).toContain(
      "Private account links are\n            removed or neutralized"
    );
    expect(deleteAccountSource).toContain(
      "leaderboard,\n            and champion history"
    );
    expect(deleteAccountSource).toContain("Former Competitor");
    expect(deleteAccountSource).toContain(
      "referenced private replay proof will remain"
    );
    expect(deleteAccountSource).toContain(
      "Otherwise, your\n              player record will be removed"
    );
    expect(deleteAccountSource).toContain("Type DELETE to confirm");
    expect(deleteAccountSource).not.toContain(
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
      "Recent IronClad updates for tournaments, registrations, waitlist movement, and match result decisions."
    );
    expect(dashboardSource).toContain(
      "Tournament, registration, and match updates will appear here."
    );
  });
});
