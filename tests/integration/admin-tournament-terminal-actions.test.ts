import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminIdentity, playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import {
  cancelTournamentAction,
  voidTournamentAction,
  type TournamentTerminalActionState,
} from "@/app/admin/tournaments/actions";

const initialState: TournamentTerminalActionState = {
  status: "idle",
  message: "",
};
const tournamentId = "123e4567-e89b-42d3-a456-426614174000";

function terminalFormData({
  id = tournamentId,
  reason = "Tournament cannot continue",
}: {
  id?: string;
  reason?: string;
} = {}) {
  const formData = new FormData();
  formData.set("tournamentId", id);
  formData.set("reason", reason);
  return formData;
}

describe("administrator tournament terminal actions", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it.each([
    ["cancel", cancelTournamentAction],
    ["void", voidTournamentAction],
  ])(
    "rejects a non-administrator %s before privileged access",
    async (_operation, action) => {
      authMock.mockResolvedValue(playerIdentity);

      await expect(
        action(initialState, terminalFormData())
      ).resolves.toEqual({
        status: "error",
        message: "Administrator access is required.",
      });
      expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    }
  );

  it("validates the tournament ID and non-empty reason before privileged access", async () => {
    authMock.mockResolvedValue(adminIdentity);

    await expect(
      cancelTournamentAction(
        initialState,
        terminalFormData({ id: "not-a-tournament-id" })
      )
    ).resolves.toEqual({
      status: "error",
      message: "Select a valid tournament.",
    });
    await expect(
      voidTournamentAction(
        initialState,
        terminalFormData({ reason: "   " })
      )
    ).resolves.toEqual({
      status: "error",
      message: "An administrator reason is required.",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "cancel",
      cancelTournamentAction,
      "cancel_tournament",
      "cancelled",
      "The tournament was cancelled.",
    ],
    [
      "void",
      voidTournamentAction,
      "void_tournament",
      "voided",
      "The tournament was voided.",
    ],
  ])(
    "delegates a valid %s to the scoped database mutation",
    async (_operation, action, rpcName, outcome, successMessage) => {
      const rpc = vi.fn(async () => ({
        data: { outcome, tournament_id: tournamentId },
        error: null,
      }));
      authMock.mockResolvedValue(adminIdentity);
      createSupabaseAdminClientMock.mockReturnValue({ rpc });

      await expect(
        action(
          initialState,
          terminalFormData({ reason: "  Tournament cannot continue  " })
        )
      ).resolves.toEqual({
        status: "success",
        message: successMessage,
      });
      expect(rpc).toHaveBeenCalledExactlyOnceWith(rpcName, {
        p_tournament_id: tournamentId,
        p_reason: "Tournament cannot continue",
        p_actor_clerk_user_id: adminIdentity.userId,
      });
      expect(revalidatePathMock.mock.calls).toEqual([
        ["/admin/tournaments", "page"],
        ["/tournaments"],
        ["/rankings"],
      ]);
    }
  );

  it.each([
    [
      "under_review",
      "The finalized Main season is now under review; the tournament was not voided.",
    ],
    [
      "already_under_review",
      "The finalized Main season is already under review; the tournament was not voided.",
    ],
  ])("maps the safe %s result", async (outcome, message) => {
    const rpc = vi.fn(async () => ({ data: { outcome }, error: null }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      voidTournamentAction(initialState, terminalFormData())
    ).resolves.toEqual({ status: "success", message });
  });

  it("rejects an unknown database outcome instead of claiming success", async () => {
    const rpc = vi.fn(async () => ({
      data: { outcome: "unexpected_state" },
      error: null,
    }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      cancelTournamentAction(initialState, terminalFormData())
    ).resolves.toEqual({
      status: "error",
      message: "The tournament could not be cancelled. Refresh and try again.",
    });
  });

  it("maps an administrator-adjustment block without logging its private reason", async () => {
    const privateMessage =
      "Tournament has an admin adjustment: private adjudication details";
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "P0001", message: privateMessage },
    }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      voidTournamentAction(initialState, terminalFormData())
    ).resolves.toEqual({
      status: "error",
      message:
        "Resolve the tournament-linked administrator leaderboard adjustment before voiding this tournament.",
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      privateMessage
    );
    expect(console.error).toHaveBeenCalledWith(
      "Tournament terminal operation failed.",
      { operation: "void", code: "P0001" }
    );
  });
});
