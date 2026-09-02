// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/admin/tournaments/actions", () => ({
  generateTournamentBracket: vi.fn(),
}));
vi.mock("@/components/AdminTournamentMapPools", () => ({
  default: () => null,
}));
vi.mock("@/components/DeleteTournamentControl", () => ({
  default: () => null,
}));
vi.mock("@/components/TournamentBannerPicker", () => ({
  default: () => <input aria-label="Tournament Banner" />,
}));
vi.mock("@/components/TournamentFormDraft", () => ({
  default: () => null,
}));
vi.mock("@/components/TournamentFormShell", () => ({
  default: ({
    id,
    className,
    children,
  }: {
    id: string;
    className: string;
    children: ReactNode;
  }) => (
    <form id={id} className={className}>
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

import NewTournamentPage from "@/app/admin/tournaments/new/page";
import TournamentEditor, {
  type TournamentFormValues,
} from "@/components/admin/tournaments/TournamentEditor";

function expectFixedEightPlayerCapacity() {
  const capacityInputs = screen.getAllByLabelText(/Launch Capacity/);

  expect(capacityInputs).toHaveLength(3);
  expect(capacityInputs.map((input) => input.getAttribute("name"))).toEqual([
    "academyMaxPlayers",
    "challengeMaxPlayers",
    "mainMaxPlayers",
  ]);

  for (const input of capacityInputs) {
    expect(input).toBeVisible();
    expect(input).toHaveValue("8");
    expect(input).toHaveAttribute("readonly");
  }

  expect(
    screen.getAllByText(
      "Fixed at exactly eight players for the current 1v1 launch format."
    )
  ).toHaveLength(3);
}

const existingTournamentValues: TournamentFormValues = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "existing-eight-player-cup",
  title: "Existing Eight Player Cup",
  description: "A current 1v1 tournament.",
  bannerImageUrl: "",
  registrationOpenAt: "",
  registrationCloseAt: "",
  status: "upcoming",
  format: "1v1",
  ruleFormat: "format_a",
  resultConfirmationWindowMinutes: "30",
  prizePool: "",
  rulesUrl: "",
  battlefyUrl: "",
  academy: {
    id: "academy-bracket",
    launchedAt: null,
    enabled: true,
    eloRules: "Below 1100 ELO",
    maxPlayers: 8,
  },
  challenge: {
    id: "challenge-bracket",
    launchedAt: null,
    enabled: true,
    eloRules: "1100-1399 ELO",
    maxPlayers: 8,
  },
  main: {
    id: "main-bracket",
    launchedAt: null,
    enabled: true,
    eloRules: "1400+ ELO",
    maxPlayers: 8,
  },
};

describe("Admin tournament fixed capacity presentation", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(adminIdentity);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all new-tournament Division capacities as read-only eight", async () => {
    render(
      await NewTournamentPage({
        searchParams: Promise.resolve({}),
      })
    );

    expect(
      screen.getByRole("heading", { name: "New Tournament" })
    ).toBeVisible();
    expectFixedEightPlayerCapacity();
  });

  it("keeps all existing-tournament Division capacities read-only at eight while editing", async () => {
    render(
      <TournamentEditor
        values={existingTournamentValues}
        generatedByBracket={new Map()}
        approvedByBracket={new Map()}
        readinessByBracket={new Map()}
        isEditing
        terminal={null}
        underReview={null}
      />
    );

    expect(
      screen.getByRole("heading", { name: existingTournamentValues.title })
    ).toBeVisible();
    expect(screen.getByText("Edit Tournament")).toBeVisible();
    expectFixedEightPlayerCapacity();
  });
});
