import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/TournamentsExperience.tsx"),
  "utf8"
).replace(/\r\n/g, "\n");

describe("terminal tournament read-only presentation", () => {
  it("renders factual terminal banners without private metadata", () => {
    expect(source).toContain("<TournamentTerminalBanner tournament={tournament} />");
    expect(source).toContain('role="status"');
    expect(source).toContain("Read-only historical record");
    expect(source).toContain(
      'getTournamentTerminalPublicMessage(tournament.statusValue)'
    );
    expect(source).not.toMatch(/terminalReason|terminatedByClerkUserId/);
  });

  it("suppresses terminal registration and administrator match controls", () => {
    expect(source).toContain(
      "terminalTournament ? (\n              <TournamentReadOnlyCard />"
    );
    expect(source).toContain("viewer.isAdmin && !terminalTournament");
    expect(source).toContain("readOnly={terminalTournament}");
    expect(source).toContain("isAdmin={readOnly ? false : viewer.isAdmin}");
    expect(source).toContain("!readOnly &&");
  });

  it("keeps factual result and replay presentation available read-only", () => {
    expect(source).toContain("Tournament Match History");
    expect(source).toContain(
      "Review factual scores and existing authorized replay access from this historical record."
    );
    expect(source).toContain("<MatchResultControls");
    expect(source).toContain("submissions={matchResultSubmissions.filter(");
    expect(source).toContain("reportGroups={matchResultReportGroups.filter(");
  });
});
