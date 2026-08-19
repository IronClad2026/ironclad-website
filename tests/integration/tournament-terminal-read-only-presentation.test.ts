import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";

const source = readFileSync(
  resolve(process.cwd(), "components/TournamentsExperience.tsx"),
  "utf8"
).replace(/\r\n/g, "\n");

describe("terminal tournament read-only presentation", () => {
  it("renders factual terminal banners without private metadata", () => {
    expect(source).toContain("<TournamentTerminalBanner tournament={tournament} />");
    expect(source).toContain('role="status"');
    expect(source).toContain('t("tournaments.terminal.historical")');
    expect(source).toContain('t("tournaments.terminal.cancelledMessage")');
    expect(source).toContain('t("tournaments.terminal.voidedMessage")');
    expect(competitionEnglish.tournaments.terminal.historical).toBe(
      "Read-only historical record"
    );
    expect(competitionEnglish.tournaments.terminal.voidedMessage).toContain(
      "factual Match history is retained"
    );
    expect(source).not.toMatch(/terminalReason|terminatedByClerkUserId/);
  });

  it("suppresses terminal registration and administrator mutations", () => {
    expect(source).toContain(
      "terminalTournament ? (\n              <TournamentReadOnlyCard />"
    );
    expect(source).toContain("viewer.isAdmin && selectedAdminMatch");
    expect(source).toContain("readOnly={terminalTournament}");
    expect(source).toContain("isAdmin={!readOnly && viewer.isAdmin}");
    expect(source).toContain("!readOnly && deadlineManaged");
    expect(source).toContain("!readOnly && (");
  });

  it("keeps factual result and replay presentation available read-only", () => {
    expect(source).toContain('t("tournaments.brackets.matchHistory")');
    expect(source).toContain(
      't("tournaments.brackets.matchWorkspaceDescription")'
    );
    expect(competitionEnglish.tournaments.brackets.matchHistory).toBe(
      "Tournament Match History"
    );
    expect(competitionEnglish.tournaments.brackets.matchWorkspaceDescription).toBe(
      "Review authorized Dice Roll-Off, score, and replay history from this Match record."
    );
    expect(source).toContain("<MatchResultControls");
    expect(source).toContain("submissions={matchResultSubmissions.filter(");
    expect(source).toContain("reportGroups={matchResultReportGroups.filter(");
  });
});
