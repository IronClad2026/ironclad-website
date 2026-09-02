import { describe, expect, expectTypeOf, it } from "vitest";
import {
  formatTournamentDivisionState,
  formatTournamentEventDivisionState,
  projectPublicTournamentDivisionStates,
  resolveTournamentDivisionStates,
  type TournamentDivisionStateEvidence,
} from "@/lib/tournament-division-state";
import type { TournamentCard } from "@/lib/tournaments";

const launchTime = "2026-09-01T00:00:00.000Z";

describe("tournament division state resolver", () => {
  it("enumerates every canonical division and treats row absence as Disabled", () => {
    const resolutions = resolveTournamentDivisionStates({
      tournamentId: "event-b",
      eventStatus: "registration_open",
      divisions: [evidence("Academy", { approvedCount: 3 })],
    });

    expect(resolutions.map((resolution) => resolution.canonicalName)).toEqual([
      "Academy",
      "Challenge",
      "Main",
    ]);
    expect(resolutions.map((resolution) => resolution.state)).toEqual([
      "filling",
      "disabled",
      "disabled",
    ]);
    expect(resolutions[1]).toMatchObject({
      displayName: "Challenge Bracket",
      bracketId: null,
      approvedCount: null,
      requiredCount: null,
      isReady: false,
      generatedBracketId: null,
      isCompetitionComplete: false,
    });
  });

  it("resolves a mixed event independently from sibling state", () => {
    const resolutions = resolveTournamentDivisionStates({
      tournamentId: "event-a",
      eventStatus: "in_progress",
      divisions: [
        evidence("Academy", {
          launchedAt: launchTime,
          generatedBracketId: "generated-academy",
          isCompetitionComplete: true,
          isReady: true,
        }),
        evidence("Challenge", {
          launchedAt: launchTime,
          generatedBracketId: "generated-challenge",
          isCompetitionComplete: false,
          isReady: true,
        }),
        evidence("Main", { approvedCount: 5 }),
      ],
    });

    expect(
      Object.fromEntries(
        resolutions.map((resolution) => [
          resolution.canonicalName,
          resolution.state,
        ])
      )
    ).toEqual({
      Academy: "completed",
      Challenge: "in_progress",
      Main: "filling",
    });
  });

  it("keeps a generated private draft in Ready until authoritative launch", () => {
    const [resolution] = resolveTournamentDivisionStates({
      tournamentId: "ready-event",
      eventStatus: "registration_open",
      divisions: [
        evidence("Academy", {
          approvedCount: 8,
          isReady: true,
          generatedBracketId: "private-draft",
        }),
      ],
    });

    expect(resolution).toMatchObject({
      state: "ready",
      launchedAt: null,
      generatedBracketId: "private-draft",
      isCompetitionComplete: false,
    });
    expect(formatTournamentDivisionState(resolution)).toBe(
      "Ready to Launch — 8/8"
    );
  });

  it("omits private generated bracket IDs from the public card projection", () => {
    const privateGeneratedBracketId = "private-generated-academy";
    const resolutions = resolveTournamentDivisionStates({
      tournamentId: "public-card-event",
      eventStatus: "in_progress",
      divisions: [
        evidence("Academy", {
          approvedCount: 8,
          isReady: true,
          launchedAt: launchTime,
          generatedBracketId: privateGeneratedBracketId,
        }),
      ],
    });
    const publicCardState: Pick<TournamentCard, "divisionStates"> = {
      divisionStates: projectPublicTournamentDivisionStates(resolutions),
    };

    expectTypeOf<
      "generatedBracketId" extends keyof TournamentCard["divisionStates"][number]
        ? true
        : false
    >().toEqualTypeOf<false>();

    expect(publicCardState.divisionStates[0]).not.toHaveProperty(
      "generatedBracketId"
    );
    expect(JSON.stringify(publicCardState)).not.toContain(
      privateGeneratedBracketId
    );
  });

  it("gives launch and completion precedence over a stale readiness result", () => {
    const [inProgress] = resolveTournamentDivisionStates({
      tournamentId: "launched-event",
      eventStatus: "in_progress",
      divisions: [
        evidence("Academy", {
          approvedCount: 8,
          isReady: false,
          launchedAt: launchTime,
          generatedBracketId: "generated-academy",
        }),
      ],
    });
    const [completed] = resolveTournamentDivisionStates({
      tournamentId: "completed-division-event",
      eventStatus: "in_progress",
      divisions: [
        evidence("Academy", {
          approvedCount: 8,
          isReady: false,
          launchedAt: launchTime,
          generatedBracketId: "generated-academy",
          isCompetitionComplete: true,
        }),
      ],
    });

    expect(inProgress.state).toBe("in_progress");
    expect(completed.state).toBe("completed");
  });

  it("does not let parent Completed force unresolved divisions to Completed", () => {
    const resolutions = resolveTournamentDivisionStates({
      tournamentId: "stale-parent-event",
      eventStatus: "completed",
      divisions: [
        evidence("Academy", {
          launchedAt: launchTime,
          generatedBracketId: "generated-academy",
          isCompetitionComplete: true,
        }),
        evidence("Challenge", {
          launchedAt: launchTime,
          generatedBracketId: "generated-challenge",
          isCompetitionComplete: false,
        }),
        evidence("Main", { approvedCount: 4 }),
      ],
    });

    expect(resolutions.map((resolution) => resolution.state)).toEqual([
      "completed",
      "in_progress",
      "filling",
    ]);
    expect(resolutions.every((resolution) => resolution.terminalOverlay === null)).toBe(
      true
    );
  });

  it("keeps Cancelled and Voided as event overlays without erasing base facts", () => {
    for (const terminalOverlay of ["cancelled", "voided"] as const) {
      const resolutions = resolveTournamentDivisionStates({
        tournamentId: `${terminalOverlay}-event`,
        eventStatus: terminalOverlay,
        divisions: [
          evidence("Academy", {
            launchedAt: launchTime,
            generatedBracketId: "generated-academy",
            isCompetitionComplete: true,
          }),
          evidence("Challenge", { approvedCount: 4 }),
        ],
      });

      expect(resolutions.map((resolution) => resolution.terminalOverlay)).toEqual(
        [terminalOverlay, terminalOverlay, terminalOverlay]
      );
      expect(resolutions.map((resolution) => resolution.state)).toEqual([
        "completed",
        "filling",
        "disabled",
      ]);
      expect(formatTournamentDivisionState(resolutions[0])).toBe(
        terminalOverlay === "cancelled" ? "Cancelled" : "Voided"
      );
      expect(formatTournamentDivisionState(resolutions[1])).toBe(
        terminalOverlay === "cancelled" ? "Cancelled" : "Voided"
      );
      expect(formatTournamentDivisionState(resolutions[2])).toBe("Disabled");
      expect(formatTournamentEventDivisionState(resolutions)).toBe(
        terminalOverlay === "cancelled" ? "Cancelled" : "Voided"
      );
    }
  });

  it("formats non-terminal mixed states in deterministic canonical order", () => {
    const resolutions = resolveTournamentDivisionStates({
      tournamentId: "summary-event",
      eventStatus: "in_progress",
      divisions: [
        evidence("Academy", {
          launchedAt: launchTime,
          generatedBracketId: "generated-academy",
          isCompetitionComplete: true,
        }),
        evidence("Challenge", {
          launchedAt: launchTime,
          generatedBracketId: "generated-challenge",
        }),
        evidence("Main", { approvedCount: 5 }),
      ],
    });

    expect(formatTournamentEventDivisionState([...resolutions].reverse())).toBe(
      "Academy Bracket: Completed · Challenge Bracket: In Progress · Main / Pro Bracket: Filling — 5/8"
    );
  });

  it("keeps prelaunch completion evidence non-authoritative", () => {
    const [resolution] = resolveTournamentDivisionStates({
      tournamentId: "prelaunch-completion",
      eventStatus: "registration_open",
      divisions: [
        evidence("Academy", {
          approvedCount: 8,
          isReady: true,
          generatedBracketId: "private-draft",
          isCompetitionComplete: true,
        }),
      ],
    });

    expect(resolution).toMatchObject({
      state: "ready",
      isCompetitionComplete: false,
    });
  });

  it("rejects impossible or incomplete competition evidence", () => {
    expect(() =>
      resolveTournamentDivisionStates({
        tournamentId: "missing-generated",
        eventStatus: "in_progress",
        divisions: [
          evidence("Academy", {
            launchedAt: launchTime,
            generatedBracketId: null,
          }),
        ],
      })
    ).toThrow("missing its generated bracket");

    expect(() =>
      resolveTournamentDivisionStates({
        tournamentId: "duplicate-division",
        eventStatus: "registration_open",
        divisions: [evidence("Academy"), evidence("Academy")],
      })
    ).toThrow("duplicate canonical divisions");
  });
});

function evidence(
  canonicalName: TournamentDivisionStateEvidence["canonicalName"],
  overrides: Partial<TournamentDivisionStateEvidence> = {}
): TournamentDivisionStateEvidence {
  return {
    canonicalName,
    bracketId: `bracket-${canonicalName.toLowerCase()}`,
    approvedCount: 0,
    requiredCount: 8,
    isReady: false,
    launchedAt: null,
    generatedBracketId: null,
    isCompetitionComplete: false,
    ...overrides,
  };
}
