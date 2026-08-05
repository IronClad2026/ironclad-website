import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import {
  getOwnActiveTournamentEloSnapshots,
  getPublicActiveTournamentEloSnapshots,
} from "@/lib/active-tournament-elo-snapshots";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const CLERK_USER_ID = "user_snapshot_owner";
const activeRows = [
  {
    submitted_elo: 999,
    elo_verified_elo: "1475",
    elo_verified_division: "Main / Pro",
    registration_status: "approved",
    tournament: { title: "IronClad August Open", status: "in_progress" },
    current_elo: 1900,
    clerk_user_id: CLERK_USER_ID,
    steam_id64: "76561198012345678",
    id: "22222222-2222-4222-8222-222222222222",
  },
  {
    submitted_elo: 1225,
    elo_verified_elo: null,
    elo_verified_division: null,
    registration_status: "pending",
    tournament: {
      title: "IronClad Legacy Cup",
      status: "registration_open",
    },
  },
  {
    submitted_elo: null,
    elo_verified_elo: null,
    elo_verified_division: null,
    registration_status: "waitlisted",
    tournament: { title: "IronClad Academy", status: "upcoming" },
  },
  {
    submitted_elo: 1200,
    elo_verified_elo: "malformed",
    elo_verified_division: "Challenge",
    registration_status: "manual_review",
    tournament: {
      title: "IronClad Malformed Snapshot",
      status: "registration_open",
    },
  },
  {
    submitted_elo: 1300,
    elo_verified_elo: 1300,
    elo_verified_division: "Challenge",
    registration_status: "approved",
    tournament: { title: "Completed Cup", status: "completed" },
  },
  {
    submitted_elo: 1300,
    elo_verified_elo: 1300,
    elo_verified_division: "Challenge",
    registration_status: "approved",
    tournament: { title: "Cancelled Cup", status: "cancelled" },
  },
  {
    submitted_elo: 1300,
    elo_verified_elo: 1300,
    elo_verified_division: "Challenge",
    registration_status: "rejected",
    tournament: { title: "Rejected Cup", status: "in_progress" },
  },
];

describe("active tournament ELO snapshot loading", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
  });

  it("loads an owner's active snapshots through the authenticated boundary", async () => {
    const supabase = createSupabaseQueryMock({ data: activeRows });

    const snapshots = await getOwnActiveTournamentEloSnapshots(
      supabase.client as never,
      CLERK_USER_ID
    );

    expect(supabase.from).toHaveBeenCalledWith("registrations");
    expect(supabase.calls).toContainEqual({
      method: "select",
      args: [
        "submitted_elo, elo_verified_elo, elo_verified_division, registration_status, tournament:tournaments!inner(title, status)",
      ],
    });
    expect(supabase.calls).toContainEqual({
      method: "eq",
      args: ["clerk_user_id", CLERK_USER_ID],
    });
    expectActiveFilters(supabase.calls);
    expect(snapshots).toEqual([
      {
        tournamentTitle: "IronClad Academy",
        elo: null,
        division: null,
      },
      {
        tournamentTitle: "IronClad August Open",
        elo: 1475,
        division: "Main / Pro",
      },
      {
        tournamentTitle: "IronClad Legacy Cup",
        elo: 1225,
        division: null,
      },
      {
        tournamentTitle: "IronClad Malformed Snapshot",
        elo: null,
        division: "Challenge",
      },
    ]);
    expect(JSON.stringify(snapshots)).not.toContain("1900");
    expect(JSON.stringify(snapshots)).not.toContain(CLERK_USER_ID);
    expect(JSON.stringify(snapshots)).not.toContain("76561198012345678");
    expect(JSON.stringify(snapshots)).not.toContain(PLAYER_ID);
    expect(JSON.stringify(snapshots)).not.toContain(
      "22222222-2222-4222-8222-222222222222"
    );
    expect(JSON.stringify(snapshots)).not.toContain("1200");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("uses a scoped admin query only after public visibility was confirmed", async () => {
    const publicRow = {
      ...activeRows[0],
      profile: { public_profile_enabled: true },
    };
    const supabase = createSupabaseQueryMock({ data: [publicRow] });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(
      getPublicActiveTournamentEloSnapshots(PLAYER_ID)
    ).resolves.toEqual([
      {
        tournamentTitle: "IronClad August Open",
        elo: 1475,
        division: "Main / Pro",
      },
    ]);
    expect(supabase.calls).toContainEqual({
      method: "eq",
      args: ["profile_id", PLAYER_ID],
    });
    expect(supabase.calls).toContainEqual({
      method: "eq",
      args: ["profile.public_profile_enabled", true],
    });
    expect(supabase.calls).toContainEqual({
      method: "select",
      args: [
        "submitted_elo, elo_verified_elo, elo_verified_division, registration_status, tournament:tournaments!inner(title, status), profile:players!registrations_profile_id_fkey!inner(public_profile_enabled)",
      ],
    });
    expectActiveFilters(supabase.calls);
  });

  it("rejects a stale opted-out row inside the scoped admin query", async () => {
    const supabase = createSupabaseQueryMock({
      data: [
        {
          ...activeRows[0],
          profile: { public_profile_enabled: false },
        },
      ],
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    await expect(
      getPublicActiveTournamentEloSnapshots(PLAYER_ID)
    ).resolves.toEqual([]);
    expect(supabase.calls).toContainEqual({
      method: "eq",
      args: ["profile.public_profile_enabled", true],
    });
  });

  it("does not create an admin client for an invalid public player ID", async () => {
    await expect(
      getPublicActiveTournamentEloSnapshots("not-a-uuid")
    ).resolves.toEqual([]);

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("fails closed when the snapshot query fails", async () => {
    const supabase = createSupabaseQueryMock({
      error: { message: "private database detail" },
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      getOwnActiveTournamentEloSnapshots(
        supabase.client as never,
        CLERK_USER_ID
      )
    ).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      "Active tournament ELO snapshot load failed."
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "private database detail"
    );

    consoleError.mockRestore();
  });
});

function expectActiveFilters(
  calls: Array<{ method: string; args: unknown[] }>
) {
  expect(calls).toContainEqual({
    method: "in",
    args: [
      "registration_status",
      ["pending", "manual_review", "approved", "waitlisted"],
    ],
  });
  expect(calls).toContainEqual({
    method: "in",
    args: [
      "tournament.status",
      ["upcoming", "registration_open", "in_progress"],
    ],
  });
}
