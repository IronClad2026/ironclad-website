import { describe, expect, it } from "vitest";
import {
  getPublicTournamentNavigation,
  getPublicTournamentRowsForRequest,
  getTournamentTerminalPublicMessage,
} from "@/lib/tournaments";

const rows = [
  { id: "completed", slug: "completed-cup", status: "completed" as const },
  { id: "cancelled", slug: "cancelled-cup", status: "cancelled" as const },
  { id: "voided", slug: "voided-cup", status: "voided" as const },
];

describe("public tournament terminal presentation", () => {
  it("keeps completed history in the default archive and excludes terminal rows", () => {
    expect(getPublicTournamentRowsForRequest(rows, null)).toEqual([rows[0]]);
    expect(
      getPublicTournamentNavigation(
        rows.map((row) => ({ ...row, statusValue: row.status }))
      )
    ).toEqual([{ ...rows[0], statusValue: "completed" }]);
  });

  it("includes only an explicitly deep-linked terminal tournament alongside normal history", () => {
    expect(
      getPublicTournamentRowsForRequest(rows, "cancelled-cup").map(
        (row) => row.id
      )
    ).toEqual(["completed", "cancelled"]);
    expect(
      getPublicTournamentRowsForRequest(rows, "voided").map((row) => row.id)
    ).toEqual(["completed", "voided"]);
    expect(getPublicTournamentRowsForRequest(rows, "missing")).toEqual([
      rows[0],
    ]);
  });

  it("uses factual terminal copy without a reason or administrator identity", () => {
    const cancelled = getTournamentTerminalPublicMessage("cancelled");
    const voided = getTournamentTerminalPublicMessage("voided");

    expect(cancelled).toBe(
      "This tournament was cancelled before an official competitive outcome."
    );
    expect(voided).toContain("factual match history is retained");
    expect(voided).toContain("no longer contributes to official standings");
    expect(`${cancelled} ${voided}`).not.toMatch(/reason|administrator/i);
  });
});
