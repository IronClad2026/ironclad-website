import { describe, expect, it } from "vitest";
import {
  getDivisionForElo, getDivisionDisplayName, getRelicCalculationVersion,
  requireDivisionModelVersion, resolveDivisionId, type DivisionModelVersion,
  getDivisionModelForCalculationVersion,
} from "@/lib/division-model";
import { getTournamentBracketConfigs } from "@/lib/tournaments";
import { resolveTournamentDivisionStates, getTournamentEventSection } from "@/lib/tournament-division-state";

describe("immutable division models", () => {
  it.each([[0, "Academy"], [1099, "Academy"], [1100, "Challenge"], [1399, "Challenge"], [1400, "Main"], [1699, "Main"], [1700, "Pro"]] as const)("classifies future ELO %i as %s", (elo, expected) => {
    expect(getDivisionForElo(elo, "four_division_v1")).toBe(expected);
  });

  it.each([1400, 1699, 1700, 2200])("retains legacy top-tier eligibility at %i", (elo) => {
    expect(getDivisionForElo(elo, "legacy_three_v1")).toBe("Main / Pro");
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid ELO %s", (elo) => {
    expect(getDivisionForElo(elo, "four_division_v1")).toBeNull();
  });

  it("keeps accounting scopes and classifier versions distinct", () => {
    expect(resolveDivisionId("legacy_three_v1", "Main")).toBe("main");
    expect(resolveDivisionId("four_division_v1", "Main")).toBe("main_progression");
    expect(resolveDivisionId("four_division_v1", "Pro")).toBe("pro");
    expect(getDivisionDisplayName("legacy_three_v1", "Main")).toBe("Main / Pro");
    expect(getDivisionDisplayName("four_division_v1", "Main")).toBe("Main");
    expect(getRelicCalculationVersion("legacy_three_v1")).toBe("relic-highest-1v1-v1");
    expect(getRelicCalculationVersion("four_division_v1")).toBe("relic-highest-1v1-v2");
  });

  it("classifies saved genuine snapshots only by their original contract", () => {
    expect(getDivisionModelForCalculationVersion("relic-highest-1v1-v1")).toBe("legacy_three_v1");
    expect(getDivisionModelForCalculationVersion("relic-highest-1v1-v2")).toBe("four_division_v1");
    for (const version of ["unrecognized-v3", "staging-synthetic-v1", "staging-synthetic-v2", "staging-synthetic-academy-v1", "phase4-staging-fixture-v1"]) {
      expect(getDivisionModelForCalculationVersion(version)).toBeNull();
    }
  });

  it("fails closed for unknown model/name pairs", () => {
    expect(resolveDivisionId("legacy_three_v1", "Pro")).toBeNull();
    expect(resolveDivisionId("four_division_v1", "overall")).toBeNull();
    expect(resolveDivisionId("unknown" as DivisionModelVersion, "Main")).toBeNull();
    expect(getDivisionForElo(1900, "unknown" as DivisionModelVersion)).toBeNull();
    expect(() => requireDivisionModelVersion("unknown")).toThrow();
    expect(() => requireDivisionModelVersion(null)).toThrow();
  });

  it("resolves the correct disabled state count without adding Pro to history", () => {
    const legacy = resolveTournamentDivisionStates({ tournamentId: "old", eventStatus: "upcoming", divisionModelVersion: "legacy_three_v1", divisions: [] });
    const future = resolveTournamentDivisionStates({ tournamentId: "new", eventStatus: "upcoming", divisionModelVersion: "four_division_v1", divisions: [] });
    expect(legacy.map((row) => row.canonicalName)).toEqual(["Academy", "Challenge", "Main"]);
    expect(future.map((row) => row.canonicalName)).toEqual(["Academy", "Challenge", "Main", "Pro"]);
    expect(getTournamentEventSection(legacy)).toBe("resolved");
    expect(getTournamentEventSection(future)).toBe("resolved");
    expect(getTournamentBracketConfigs("four_division_v1").map((row) => row.defaultMaxPlayers)).toEqual([8, 8, 8, 8]);
    expect(() => getTournamentEventSection([...legacy, future[3]])).toThrow();
  });

  it("keeps a future event open when Main completes while Pro is still filling", () => {
    const resolutions = resolveTournamentDivisionStates({
      tournamentId: "future", divisionModelVersion: "four_division_v1", eventStatus: "in_progress",
      divisions: [
        { canonicalName: "Main", bracketId: "main", approvedCount: 8, requiredCount: 8, isReady: true, launchedAt: "2026-09-29T00:00:00Z", generatedBracketId: "generated-main", isCompetitionComplete: true },
        { canonicalName: "Pro", bracketId: "pro", approvedCount: 3, requiredCount: 8, isReady: false, launchedAt: null, generatedBracketId: null, isCompetitionComplete: false },
      ],
    });
    expect(resolutions.find((row) => row.canonicalName === "Main")?.state).toBe("completed");
    expect(resolutions.find((row) => row.canonicalName === "Pro")?.state).toBe("filling");
    expect(getTournamentEventSection(resolutions)).toBe("open");
  });
});
