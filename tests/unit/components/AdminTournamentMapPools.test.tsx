// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminTournamentMapPools from "@/components/AdminTournamentMapPools";
import type { Coh3MapRow } from "@/lib/coh3-maps";

vi.mock("@/app/admin/tournaments/map-pool-actions", () => ({
  correctTournamentMapPool: vi.fn(),
  publishTournamentMapPools: vi.fn(),
}));

const catalogue: Coh3MapRow[] = Array.from({ length: 6 }, (_, index) => ({
  id: `map-${index + 1}`,
  slug: `official-map-${index + 1}`,
  displayName: `Official Map ${index + 1}`,
  sourceType: "official",
  creatorName: index === 0 ? "Community Cartographer" : null,
  gameMode: "1v1",
  status: index === 5 ? "retired" : "active",
  thumbnailPath: null,
  sourceReference: null,
  adminNote: null,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  createdByClerkUserId: null,
  updatedByClerkUserId: null,
}));

const brackets = [
  {
    id: "bracket-academy",
    name: "Academy",
    launchedAt: null,
    notHeldAt: null,
    mapPoolPublishedAt: "2026-08-15T00:00:00.000Z",
    currentMapIds: catalogue.slice(0, 5).map((map) => map.id),
  },
  {
    id: "bracket-challenge",
    name: "Challenge",
    launchedAt: null,
    notHeldAt: null,
    mapPoolPublishedAt: null,
    currentMapIds: [],
  },
  {
    id: "bracket-main",
    name: "Main",
    launchedAt: null,
    notHeldAt: null,
    mapPoolPublishedAt: null,
    currentMapIds: [],
  },
];

describe("AdminTournamentMapPools", () => {
  afterEach(cleanup);

  it("shows Division publication state, eligibility, and atomic same-pool action", () => {
    render(
      <AdminTournamentMapPools
        tournamentId="tournament-1"
        tournamentTitle="IronClad Open"
        terminal={false}
        brackets={brackets}
        catalogue={catalogue}
      />
    );

    expect(screen.getAllByText("Academy Bracket")).toHaveLength(2);
    expect(screen.getByText(/Published \/ 5 maps/)).toBeInTheDocument();
    expect(screen.getByText("Main / Pro Bracket")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Republish This Division" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "Use This Pool For All Divisions",
      })
    ).toBeEnabled();
    expect(screen.getByText("Retired")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Official Map 6/ }))
      .toBeDisabled();
  });

  it("requires audited correction controls after launch and is read-only when terminal", () => {
    const launchedBrackets = [
      {
        ...brackets[0],
        launchedAt: "2026-08-16T00:00:00.000Z",
      },
    ];
    const { rerender } = render(
      <AdminTournamentMapPools
        tournamentId="tournament-1"
        tournamentTitle="IronClad Open"
        terminal={false}
        brackets={launchedBrackets}
        catalogue={catalogue}
      />
    );

    expect(screen.getByText("Launched / Frozen")).toBeInTheDocument();
    expect(screen.getByLabelText("Reason")).toBeRequired();
    expect(screen.getByLabelText("Short explanation")).toBeRequired();
    expect(
      screen.getByRole("button", {
        name: "Apply Audited Post-Launch Correction",
      })
    ).toBeEnabled();

    rerender(
      <AdminTournamentMapPools
        tournamentId="tournament-1"
        tournamentTitle="IronClad Open"
        terminal
        brackets={launchedBrackets}
        catalogue={catalogue}
      />
    );
    expect(
      screen.getByText(/This tournament is read-only/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Apply Audited Post-Launch Correction",
      })
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").every((input) => input.hasAttribute("disabled")))
      .toBe(true);
  });

  it("does not bootstrap a correction for a legacy launched unpublished Division", () => {
    render(
      <AdminTournamentMapPools
        tournamentId="tournament-legacy"
        tournamentTitle="Legacy IronClad Open"
        terminal={false}
        brackets={[
          {
            ...brackets[0],
            launchedAt: "2026-08-16T00:00:00.000Z",
            mapPoolPublishedAt: null,
          },
        ]}
        catalogue={catalogue}
      />
    );

    expect(screen.getByText(/launched before map-pool publication/))
      .toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Apply Audited Post-Launch Correction",
      })
    ).not.toBeInTheDocument();
  });

  it("retains a Not Held Division Map Pool as read-only history", () => {
    render(
      <AdminTournamentMapPools
        tournamentId="tournament-not-held"
        tournamentTitle="IronClad Not Held"
        terminal={false}
        brackets={[
          {
            ...brackets[0],
            notHeldAt: "2026-09-03T01:00:00.000Z",
          },
        ]}
        catalogue={catalogue}
      />
    );

    expect(screen.getByText("Not Held / Frozen")).toBeVisible();
    expect(screen.getByText(/retained as read-only history/i)).toBeVisible();
    expect(screen.getAllByRole("checkbox").every((input) => input.hasAttribute("disabled")))
      .toBe(true);
    expect(
      screen.queryByRole("button", { name: /Publish This Division/ })
    ).not.toBeInTheDocument();
  });
});
