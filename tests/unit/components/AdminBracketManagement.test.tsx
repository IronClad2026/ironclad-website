// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminBracketManagement, {
  type AdminBracketTournamentOption,
} from "@/components/AdminBracketManagement";

vi.mock("@/app/admin/tournaments/actions", () => ({
  launchTournamentDivision: vi.fn(),
  saveBracketAssignments: vi.fn(),
}));

function tournamentOption(
  overrides: Partial<AdminBracketTournamentOption["brackets"][number]> = {}
): AdminBracketTournamentOption {
  const participants = Array.from({ length: 8 }, (_, index) => ({
    id: `registration-${index + 1}`,
    name: `Player ${index + 1}`,
    country: "AU",
    elo: 1_000 + index,
  }));

  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    title: "IronClad Open",
    status: "registration_open",
    brackets: [
      {
        generatedBracketId: "223e4567-e89b-42d3-a456-426614174000",
        bracketId: "323e4567-e89b-42d3-a456-426614174000",
        bracketName: "Academy",
        format: "single_elimination",
        slotCount: 8,
        actualMatchCount: 7,
        expectedMatchCount: 7,
        assignments: Object.fromEntries(
          participants.map((participant, index) => [index + 1, participant.id])
        ),
        participants,
        approvedCount: 8,
        requiredCount: 8,
        isReady: true,
        launchedAt: null,
        mapPoolPublishedAt: "2026-08-15T00:00:00.000Z",
        currentMapCount: 5,
        ...overrides,
      },
    ],
  };
}

describe("administrator private bracket launch controls", () => {
  afterEach(cleanup);

  it("shows a responsive explicit launch action only for a complete private draft", () => {
    render(<AdminBracketManagement tournaments={[tournamentOption()]} />);

    expect(
      screen.getByText("8/8 approved — ready for private bracket preparation")
    ).toBeInTheDocument();
    expect(screen.getByText("Private draft — not published"))
      .toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit Private Seeding" })
    ).toBeInTheDocument();

    const launch = screen.getByRole("button", { name: "Launch Division" });
    expect(launch).toBeEnabled();
    expect(launch).toHaveClass("min-h-12", "w-full", "sm:w-auto");
  });

  it("keeps launch disabled until exact readiness and complete seeding", () => {
    render(
      <AdminBracketManagement
        tournaments={[
          tournamentOption({
            approvedCount: 7,
            isReady: false,
            assignments: { 1: "registration-1" },
          }),
        ]}
      />
    );

    expect(screen.getByText("7/8 approved — administrator review incomplete"))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Launch Division" }))
      .toBeDisabled();
  });

  it("keeps launch disabled until a five-map pool is published", () => {
    render(
      <AdminBracketManagement
        tournaments={[
          tournamentOption({
            mapPoolPublishedAt: null,
            currentMapCount: 0,
          }),
        ]}
      />
    );

    expect(screen.getByRole("button", { name: "Launch Division" }))
      .toBeDisabled();
    expect(screen.getByText(/publish at least five eligible 1v1 maps/i))
      .toBeInTheDocument();
  });

  it("displays immutable launch state and removes draft mutation controls", () => {
    render(
      <AdminBracketManagement
        tournaments={[
          tournamentOption({ launchedAt: "2026-08-06T08:30:00.000Z" }),
        ]}
      />
    );

    expect(screen.getByText(/Launched/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Launch Division" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Private Seeding" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Public Bracket" }))
      .toHaveAttribute("href", "/tournaments");
  });

  it.each(["cancelled", "voided"] as const)(
    "keeps an unlaunched sibling division read-only when the tournament is %s",
    (status) => {
      render(
        <AdminBracketManagement
          tournaments={[{ ...tournamentOption(), status }]}
        />
      );

      expect(screen.getByText("Terminal tournament — view only"))
        .toBeInTheDocument();
      expect(screen.getByText("Private draft — not published"))
        .toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Edit Private Seeding" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Launch Division" })
      ).not.toBeInTheDocument();
    }
  );
});
