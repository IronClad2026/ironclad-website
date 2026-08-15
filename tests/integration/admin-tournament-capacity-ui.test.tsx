// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/admin/tournaments/actions", () => ({
  generateTournamentBracket: vi.fn(),
  retryTournamentStorageCleanup: vi.fn(),
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

import AdminTournamentsPage from "@/app/admin/tournaments/page";

type QueryResult = {
  data: unknown;
  error: null;
};

function query(result: QueryResult, singleResult = result) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    order: () => builder,
    in: () => builder,
    is: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(singleResult),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };

  return builder;
}

const deletionPreview = {
  registrations: 0,
  brackets: 0,
  generated_brackets: 0,
  rounds: 0,
  matches: 0,
  standings: 0,
  result_submissions: 0,
  storage_files: 0,
};

function createAdminClient(tournaments: unknown[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === "tournaments") {
        return query({ data: tournaments, error: null });
      }

      if (table === "leaderboard_seasons") {
        return query(
          { data: [], error: null },
          { data: null, error: null }
        );
      }

      return query({ data: [], error: null });
    }),
    rpc: vi.fn((name: string) =>
      Promise.resolve({
        data:
          name === "get_tournament_deletion_preview"
            ? deletionPreview
            : null,
        error: null,
      })
    ),
  };
}

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

const existingTournament = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "existing-eight-player-cup",
  title: "Existing Eight Player Cup",
  description: "A current 1v1 tournament.",
  banner_image_url: "",
  registration_open_at: null,
  registration_close_at: null,
  start_date: null,
  end_date: null,
  status: "upcoming",
  format: "1v1",
  prize_pool: "",
  rules_url: null,
  battlefy_url: null,
  registration_enabled: false,
  grand_final_at: null,
  rule_format: "format_a",
  result_confirmation_window_minutes: 30,
  terminal_at: null,
  terminal_reason: null,
  created_at: "2026-08-15T00:00:00.000Z",
  updated_at: "2026-08-15T00:00:00.000Z",
  tournament_brackets: [
    ["academy-bracket", "Academy", "Below 1100 ELO"],
    ["challenge-bracket", "Challenge", "1100-1399 ELO"],
    ["main-bracket", "Main", "1400+ ELO"],
  ].map(([id, name, eloRules]) => ({
    id,
    tournament_id: "11111111-1111-4111-8111-111111111111",
    name,
    elo_rules: eloRules,
    max_players: 8,
    launched_at: null,
    map_pool_published_at: null,
    created_at: "2026-08-15T00:00:00.000Z",
    updated_at: "2026-08-15T00:00:00.000Z",
  })),
};

describe("Admin tournament fixed capacity presentation", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(adminIdentity);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all new-tournament Division capacities as read-only eight", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createAdminClient([]));

    render(
      await AdminTournamentsPage({
        searchParams: Promise.resolve({}),
      })
    );

    expect(
      screen.getByRole("heading", { name: "New Tournament" })
    ).toBeVisible();
    expectFixedEightPlayerCapacity();
  });

  it("keeps all existing-tournament Division capacities read-only at eight while editing", async () => {
    createSupabaseAdminClientMock.mockReturnValue(
      createAdminClient([existingTournament])
    );

    render(
      await AdminTournamentsPage({
        searchParams: Promise.resolve({
          selected: existingTournament.id,
          edit: "1",
        }),
      })
    );

    expect(
      screen.getByRole("heading", { name: existingTournament.title })
    ).toBeVisible();
    expect(screen.getByText("Edit Tournament")).toBeVisible();
    expectFixedEightPlayerCapacity();
  });
});
