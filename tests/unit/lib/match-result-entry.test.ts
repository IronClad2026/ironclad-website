import { describe, expect, it } from "vitest";
import {
  changeMatchOutcome,
  changeMatchScore,
  getConfirmationTiming,
  getGameWinnerState,
  getPerspectiveScores,
  mapPerspectiveResult,
} from "@/lib/match-result-entry";

const match = {
  seriesBestOf: 3,
  playerOneRegistrationId: "one",
  playerTwoRegistrationId: "two",
};

describe("viewer-relative match results", () => {
  it.each([
    ["one", "won", "2-1", 2, 1, "one"],
    ["two", "won", "2-1", 1, 2, "two"],
    ["one", "lost", "1-2", 1, 2, "two"],
    ["two", "lost", "1-2", 2, 1, "one"],
  ] as const)(
    "maps %s %s %s to absolute registrations",
    (viewer, outcome, score, one, two, winner) => {
      expect(mapPerspectiveResult(match, viewer, outcome, score)).toEqual({
        playerOneScore: one,
        playerTwoScore: two,
        winnerRegistrationId: winner,
      });
    }
  );
  it.each([1, 3, 5])(
    "exposes only legal best-of-%i outcomes for both perspectives",
    (bestOf) => {
      for (const outcome of ["won", "lost"] as const) {
        const options = getPerspectiveScores(bestOf, outcome);
        const wins = Math.floor(bestOf / 2) + 1;
        expect(options).toHaveLength(wins);
        for (const option of options) {
          expect(
            outcome === "won" ? option.viewerScore : option.opponentScore
          ).toBe(wins);
          expect(
            Math.min(option.viewerScore, option.opponentScore)
          ).toBeLessThan(wins);
        }
      }
    }
  );
  it("cannot accept unrelated viewers, unsupported scores, or an independent winner", () => {
    expect(mapPerspectiveResult(match, "other", "won", "2-1")).toBeNull();
    expect(mapPerspectiveResult(match, "one", "won", "1-2")).toBeNull();
    expect(mapPerspectiveResult(match, "one", "won", "3-1")).toBeNull();
    expect(getPerspectiveScores(4, "won")).toEqual([]);
    expect(changeMatchOutcome("lost")).toEqual({
      outcome: "lost",
      score: "",
      games: [],
    });
  });
  it("retains chronological replay slots and discards stale rows and all explicit winners when the score changes", () => {
    const draft = {
      outcome: "won" as const,
      score: "2-1",
      games: [1, 2, 3].map((replay) => ({ replay, winner: "one" })),
    };
    const next = changeMatchScore(draft, 3, "2-0");
    expect(next.games).toEqual([
      { replay: 1, winner: "" },
      { replay: 2, winner: "" },
    ]);
    expect(changeMatchScore(next, 3, "2-1").games[2]).toEqual({
      replay: null,
      winner: "",
    });
  });
});

describe("Game winner inference", () => {
  it.each([1, 3, 5])(
    "checks every legal score and every complete sequence for BO%i",
    (bestOf) => {
      const identity = { ...match, seriesBestOf: bestOf };
      for (const viewer of ["one", "two"])
        for (const outcome of ["won", "lost"] as const) {
          for (const score of getPerspectiveScores(bestOf, outcome)) {
            const result = mapPerspectiveResult(
              identity,
              viewer,
              outcome,
              score.value
            )!;
            const count = result.playerOneScore + result.playerTwoScore;
            const initial = getGameWinnerState(identity, result, []);
            expect(initial.winners).toHaveLength(count);
            expect(initial.winners.at(-1)).toBe(result.winnerRegistrationId);
            if (Math.min(result.playerOneScore, result.playerTwoScore) === 0) {
              expect(initial.winners).toEqual(
                Array(count).fill(result.winnerRegistrationId)
              );
              expect(initial.complete).toBe(true);
            } else expect(initial.winners.slice(0, -1)).toContain("");
            for (let bits = 0; bits < 2 ** count; bits++) {
              const sequence = Array.from({ length: count }, (_, i) =>
                bits & (1 << i) ? "one" : "two"
              );
              const wins = Math.floor(bestOf / 2) + 1;
              let one = 0,
                two = 0,
                earlyWin = false;
              sequence.forEach((winner, i) => {
                if (winner === "one") one++;
                else two++;
                if (i < count - 1 && (one === wins || two === wins))
                  earlyWin = true;
              });
              const valid =
                !earlyWin &&
                one === result.playerOneScore &&
                two === result.playerTwoScore &&
                sequence.at(-1) === result.winnerRegistrationId;
              expect(
                getGameWinnerState(identity, result, sequence).complete
              ).toBe(valid);
            }
          }
        }
    }
  );
  it("infers the last ambiguous winner without persisting the inference as user input", () => {
    const result = mapPerspectiveResult(match, "one", "won", "2-1")!;
    expect(getGameWinnerState(match, result, ["two"]).winners).toEqual([
      "two",
      "one",
      "one",
    ]);
    expect(getGameWinnerState(match, result, ["one"]).winners).toEqual([
      "one",
      "two",
      "one",
    ]);
    expect(getGameWinnerState(match, result, ["one", "one"]).valid).toBe(false);
    expect(getGameWinnerState(match, result, ["other"]).valid).toBe(false);
  });
});

it("uses the immutable 14:30 deadline and 14:00 submission snapshot, independent of future settings", () => {
  expect(
    getConfirmationTiming("2026-09-04T14:30:00Z", "2026-09-04T14:00:00Z")
  ).toEqual({
    deadline: Date.parse("2026-09-04T14:30:00Z"),
    windowMinutes: 30,
  });
  expect(getConfirmationTiming("bad", null)).toEqual({
    deadline: null,
    windowMinutes: null,
  });
});
