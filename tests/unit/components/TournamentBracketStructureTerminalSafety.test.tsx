// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/tournaments/actions", () => ({
  generateTournamentBracket: vi.fn(),
}));

import TournamentBracketStructureControls from "@/components/admin/tournaments/TournamentBracketStructureControls";
import {
  EMPTY_TOURNAMENT_VALUES,
  type TournamentGeneratedBracketSummary,
} from "@/components/admin/tournaments/TournamentEditor";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const bracketId = "22222222-2222-4222-8222-222222222222";

function renderTerminalStructure(generated: boolean) {
  const generatedByBracket = new Map<
    string,
    TournamentGeneratedBracketSummary
  >();

  if (generated) {
    generatedByBracket.set(bracketId, {
      id: "33333333-3333-4333-8333-333333333333",
      tournament_bracket_id: bracketId,
      format: "single_elimination",
      slot_count: 8,
      generated_at: "2026-08-27T00:00:00.000Z",
    });
  }

  render(
    <TournamentBracketStructureControls
      divisionStates={[
        {
          tournamentId,
          canonicalName: "Academy",
          displayName: "Academy Bracket",
          bracketId,
          state: "ready",
          terminalOverlay: "cancelled",
          approvedCount: 8,
          requiredCount: 8,
          isReady: true,
          launchedAt: null,
          generatedBracketId: generated
            ? "33333333-3333-4333-8333-333333333333"
            : null,
          isCompetitionComplete: false,
        },
        {
          tournamentId,
          canonicalName: "Challenge",
          displayName: "Challenge Bracket",
          bracketId: null,
          state: "disabled",
          terminalOverlay: "cancelled",
          approvedCount: null,
          requiredCount: null,
          isReady: false,
          launchedAt: null,
          generatedBracketId: null,
          isCompetitionComplete: false,
        },
        {
          tournamentId,
          canonicalName: "Main",
          displayName: "Main / Pro Bracket",
          bracketId: null,
          state: "disabled",
          terminalOverlay: "cancelled",
          approvedCount: null,
          requiredCount: null,
          isReady: false,
          launchedAt: null,
          generatedBracketId: null,
          isCompetitionComplete: false,
        },
      ]}
      generatedByBracket={generatedByBracket}
      readOnly
      values={{
        ...EMPTY_TOURNAMENT_VALUES,
        id: tournamentId,
        title: "Terminal Tournament",
        status: "cancelled",
        academy: {
          ...EMPTY_TOURNAMENT_VALUES.academy,
          id: bracketId,
          enabled: true,
        },
        challenge: { ...EMPTY_TOURNAMENT_VALUES.challenge },
        main: { ...EMPTY_TOURNAMENT_VALUES.main },
      }}
    />
  );
}

describe("TournamentBracketStructureControls terminal safety", () => {
  afterEach(() => cleanup());

  it.each([
    [false, "8/8 approved — not generated"],
    [true, "8/8 approved — Single Elimination private structure ready"],
  ] as const)(
    "locks the %s generation state while preserving its history",
    (generated, historyText) => {
      renderTerminalStructure(generated);

      expect(
        screen.getByText(
          "Terminal Tournament — private bracket structure is retained as read-only history."
        )
      ).toBeVisible();
      expect(
        screen.getByRole("heading", { name: "Academy Bracket" })
      ).toBeVisible();
      expect(screen.getByText(historyText)).toBeVisible();
      expect(screen.getByText("Cancelled")).toBeVisible();

      expect(
        screen.getByRole("button", {
          name: "Terminal Tournament — View Only",
        })
      ).toBeDisabled();
      expect(
        screen.queryByRole("button", {
          name: /^(?:Generate|Regenerate) Private Structure$/,
        })
      ).not.toBeInTheDocument();
    }
  );
});
