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
  extendTournamentMatchDeadline,
  holdTournamentMatchDeadline,
  releaseTournamentMatchDeadline,
  type MatchDeadlineActionState,
} from "@/app/admin/tournaments/deadline-actions";

const initialState: MatchDeadlineActionState = {
  status: "idle",
  message: "",
};
const matchId = "33333333-3333-4333-8333-333333333333";

function deadlineFormData({
  extensionMinutes,
  reason,
}: {
  extensionMinutes?: string;
  reason?: string;
} = {}) {
  const formData = new FormData();
  formData.set("matchId", matchId);
  if (extensionMinutes !== undefined) {
    formData.set("extensionMinutes", extensionMinutes);
  }
  if (reason !== undefined) formData.set("reason", reason);
  return formData;
}

describe("administrator matchup deadline actions", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it.each([
    [
      "extension",
      extendTournamentMatchDeadline,
      deadlineFormData({ extensionMinutes: "720", reason: "Travel issue" }),
    ],
    [
      "hold",
      holdTournamentMatchDeadline,
      deadlineFormData({ reason: "Platform incident" }),
    ],
    ["release", releaseTournamentMatchDeadline, deadlineFormData()],
  ])(
    "rejects a non-administrator %s before privileged access",
    async (_name, action, formData) => {
      authMock.mockResolvedValue(playerIdentity);

      await expect(action(initialState, formData)).resolves.toEqual({
        status: "error",
        message: "Administrator access is required.",
      });
      expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    }
  );

  it("validates the match, extension bounds, and reason before privileged access", async () => {
    authMock.mockResolvedValue(adminIdentity);

    const invalidMatch = deadlineFormData({
      extensionMinutes: "60",
      reason: "Valid reason",
    });
    invalidMatch.set("matchId", "not-a-match-id");

    await expect(
      extendTournamentMatchDeadline(initialState, invalidMatch)
    ).resolves.toMatchObject({ status: "error" });
    await expect(
      extendTournamentMatchDeadline(
        initialState,
        deadlineFormData({ extensionMinutes: "0", reason: "Valid reason" })
      )
    ).resolves.toMatchObject({ status: "error" });
    await expect(
      extendTournamentMatchDeadline(
        initialState,
        deadlineFormData({ extensionMinutes: "2881", reason: "Valid reason" })
      )
    ).resolves.toMatchObject({ status: "error" });
    await expect(
      extendTournamentMatchDeadline(
        initialState,
        deadlineFormData({ extensionMinutes: "30", reason: "" })
      )
    ).resolves.toEqual({
      status: "error",
      message: "An administrator reason is required.",
    });
    await expect(
      holdTournamentMatchDeadline(
        initialState,
        deadlineFormData({ reason: "x".repeat(2_001) })
      )
    ).resolves.toEqual({
      status: "error",
      message: "The administrator reason must be 2,000 characters or fewer.",
    });

    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("delegates one valid extension to the scoped database mutation", async () => {
    const rpc = vi.fn(async () => ({
      data: { match_id: matchId },
      error: null,
    }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      extendTournamentMatchDeadline(
        initialState,
        deadlineFormData({ extensionMinutes: "720", reason: " Travel " })
      )
    ).resolves.toEqual({
      status: "success",
      message: "The match deadline was extended.",
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "extend_tournament_match_deadline",
      {
        p_match_id: matchId,
        p_extension_minutes: 720,
        p_reason: "Travel",
        p_actor_clerk_user_id: adminIdentity.userId,
      }
    );
    expect(revalidatePathMock.mock.calls.map(([path]) => path)).toEqual([
      "/admin",
      "/dashboard",
      "/tournaments",
    ]);
  });

  it("delegates hold and release without exposing an actor identifier in state", async () => {
    const rpc = vi.fn(async () => ({
      data: { match_id: matchId },
      error: null,
    }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    const holdResult = await holdTournamentMatchDeadline(
      initialState,
      deadlineFormData({ reason: "Platform outage" })
    );
    const releaseResult = await releaseTournamentMatchDeadline(
      initialState,
      deadlineFormData()
    );

    expect(rpc).toHaveBeenNthCalledWith(1, "hold_tournament_match_deadline", {
      p_match_id: matchId,
      p_reason: "Platform outage",
      p_actor_clerk_user_id: adminIdentity.userId,
    });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "release_tournament_match_deadline",
      {
        p_match_id: matchId,
        p_actor_clerk_user_id: adminIdentity.userId,
      }
    );
    expect(JSON.stringify([holdResult, releaseResult])).not.toContain(
      adminIdentity.userId
    );
  });

  it("maps database denials without logging private reasons", async () => {
    const consoleError = vi.mocked(console.error);
    const privateError = "expired matchup: private player circumstances";
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "P0001", message: privateError },
    }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(
      extendTournamentMatchDeadline(
        initialState,
        deadlineFormData({ extensionMinutes: "60", reason: "Private reason" })
      )
    ).resolves.toEqual({
      status: "error",
      message: "The match deadline has passed and can no longer be changed.",
    });

    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(privateError);
    expect(consoleError).toHaveBeenCalledWith(
      "Tournament match deadline operation failed.",
      { operation: "extend", code: "P0001" }
    );
  });
});
