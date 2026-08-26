// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/app/admin/tournaments/actions", () => ({
  generateTournamentBracket: vi.fn(),
}));

vi.mock("@/components/TournamentBannerPicker", () => ({
  default: ({ readOnly }: { readOnly: boolean }) => (
    <input aria-label="Tournament Banner" readOnly={readOnly} />
  ),
}));

vi.mock("@/components/TournamentFormDraft", () => ({
  default: () => null,
}));

vi.mock("@/components/TournamentFormShell", () => ({
  default: ({
    children,
    className,
    id,
  }: {
    children: ReactNode;
    className: string;
    id: string;
  }) => (
    <form className={className} id={id}>
      {children}
    </form>
  ),
  TournamentSubmitButton: ({ label }: { label: string }) => (
    <button type="submit">{label}</button>
  ),
}));

vi.mock("@/components/TournamentRecoveryControl", () => ({
  default: () => null,
}));

import TournamentEditor, {
  EMPTY_TOURNAMENT_VALUES,
  type TournamentFormValues,
} from "@/components/admin/tournaments/TournamentEditor";

const tournamentId = "11111111-1111-4111-8111-111111111111";
const bracketId = "22222222-2222-4222-8222-222222222222";

function terminalValues(status: "cancelled" | "voided"): TournamentFormValues {
  return {
    ...EMPTY_TOURNAMENT_VALUES,
    id: tournamentId,
    title: `${status} Tournament`,
    description: "Retained terminal Tournament history.",
    status,
    academy: {
      ...EMPTY_TOURNAMENT_VALUES.academy,
      id: bracketId,
      enabled: true,
    },
    challenge: { ...EMPTY_TOURNAMENT_VALUES.challenge },
    main: { ...EMPTY_TOURNAMENT_VALUES.main },
  };
}

describe("TournamentEditor terminal safety", () => {
  afterEach(() => cleanup());

  it.each([
    ["cancelled", "Cancelled — terminal history"],
    ["voided", "Voided — terminal history"],
  ] as const)(
    "renders %s as exact terminal history without save or generation controls",
    (status, statusLabel) => {
      render(
        <TournamentEditor
          values={terminalValues(status)}
          generatedByBracket={new Map()}
          approvedByBracket={new Map([[bracketId, 8]])}
          readinessByBracket={
            new Map([
              [
                bracketId,
                {
                  bracketId,
                  approvedCount: 8,
                  requiredCount: 8,
                  isReady: true,
                  launchedAt: null,
                },
              ],
            ])
          }
          isEditing={false}
          terminal={{ status, at: null, reason: null }}
          underReview={null}
          showRecoveryControls={false}
        />
      );

      const statusField = screen.getByRole("combobox", { name: "Status" });
      expect(statusField).toBeDisabled();
      expect(statusField).toHaveValue(status);
      expect(
        screen.getByRole("option", { name: statusLabel })
      ).toBeInTheDocument();

      expect(
        screen.queryByRole("button", { name: "Save Tournament Changes" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: /(?:Generate|Regenerate) Private Structure/,
        })
      ).not.toBeInTheDocument();
      expect(
        document.querySelector('form[id^="generate-bracket-"]')
      ).toBeNull();
    }
  );
});
