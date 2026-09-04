import { describe, expect, it } from "vitest";
import {
  buildReplayDownloadFilename,
  sanitizeFilenameSegment,
} from "@/lib/replay-download-filename";

describe("contextual replay download filenames", () => {
  it("builds a deterministic per-game casting filename", () => {
    expect(
      buildReplayDownloadFilename({
        tournamentTitle: "IronClad Invitational",
        divisionName: "Academy",
        roundName: "Round 1",
        matchNumber: 3,
        gameNumber: 2,
        playerOneName: "Commander One",
        playerTwoName: "Commander Two",
      })
    ).toBe(
      "IronClad_IronClad-Invitational_Academy_Round-1_Match-3_Game-2_Commander-One-vs-Commander-Two.rec"
    );
  });

  it("distinguishes legacy Series Replays from modern games", () => {
    expect(
      buildReplayDownloadFilename({
        tournamentTitle: "Legacy Cup",
        divisionName: "Challenge",
        roundName: "Final",
        matchNumber: 7,
        gameNumber: 1,
        playerOneName: "Alpha",
        playerTwoName: "Bravo",
        seriesReplay: true,
      })
    ).toContain("_Match-7_Series-Replay_Alpha-vs-Bravo.rec");
  });

  it("removes traversal, control, Unicode mark, and header syntax", () => {
    const filename = buildReplayDownloadFilename({
      tournamentTitle: "../ Open <Final> : 2026",
      divisionName: "Main/Pro \\ Division",
      roundName: "Semi-final / Upper",
      matchNumber: 12,
      gameNumber: 1,
      playerOneName: "Alpha\r\nContent-Disposition: inline",
      playerTwoName: "Bravó / ..",
    });

    expect(filename).toBe(
      "IronClad_Open-Final-2026_Main-Pro-Division_Semi-final-Upper_Match-12_Game-1_Alpha-Content-Disposition-in-vs-Bravo.rec"
    );
    expect(filename).not.toMatch(/[\\/\r\n";]/);
  });

  it("uses bounded safe fallbacks for missing or oversized context", () => {
    const filename = buildReplayDownloadFilename({
      tournamentTitle: "x".repeat(500),
      divisionName: null,
      roundName: "",
      matchNumber: -1,
      gameNumber: Number.NaN,
      playerOneName: "***",
      playerTwoName: undefined,
    });

    expect(filename.length).toBeLessThanOrEqual(180);
    expect(filename).toMatch(
      /^IronClad_x+_Division_Round_Match_Game-Replay_Player-1-vs-Player-2\.rec$/
    );
  });

  it("normalizes a single segment without preserving path syntax", () => {
    expect(sanitizeFilenameSegment("  A/B\\C..D  ", "Fallback", 20)).toBe(
      "A-B-C-D"
    );
  });
});
