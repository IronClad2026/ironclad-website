import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkCoh3ProfileOwnership,
  COH3_PROFILE_ALREADY_LINKED_MESSAGE,
  COH3_PROFILE_LINKED_ACCOUNT_MISMATCH_MESSAGE,
  isCoh3ProfileAlreadyLinkedError,
} from "@/lib/coh3-profile-ownership";

function createOwnershipClient(result: {
  data: unknown;
  error: { message: string } | null;
}) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  };
}

describe("checkCoh3ProfileOwnership", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("rejects a linked-account mismatch without calling Supabase", async () => {
    const client = createOwnershipClient({ data: null, error: null });

    await expect(
      checkCoh3ProfileOwnership({
        supabase: client as never,
        profileId: "222",
        playerId: "player-1",
        linkedProfileId: "111",
      })
    ).resolves.toEqual({
      ok: false,
      reason: "linked_account_mismatch",
      message: COH3_PROFILE_LINKED_ACCOUNT_MISMATCH_MESSAGE,
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { id: "other-player" },
    [{ id: "other-player" }],
  ])("rejects an existing owner returned as %#", async (data) => {
    const client = createOwnershipClient({ data, error: null });

    await expect(
      checkCoh3ProfileOwnership({
        supabase: client as never,
        profileId: "222",
        playerId: "player-1",
      })
    ).resolves.toEqual({
      ok: false,
      reason: "already_linked",
      message: COH3_PROFILE_ALREADY_LINKED_MESSAGE,
    });
    expect(client.rpc).toHaveBeenCalledWith("find_coh3_profile_owner", {
      p_profile_id: "222",
      p_exclude_player_id: "player-1",
    });
  });

  it("accepts a profile with no other owner", async () => {
    const client = createOwnershipClient({ data: [], error: null });

    await expect(
      checkCoh3ProfileOwnership({
        supabase: client as never,
        profileId: "222",
        playerId: "player-1",
        linkedProfileId: "222",
      })
    ).resolves.toEqual({ ok: true });
  });

  it("fails closed when the ownership lookup fails", async () => {
    const client = createOwnershipClient({
      data: null,
      error: { message: "unavailable" },
    });

    await expect(
      checkCoh3ProfileOwnership({
        supabase: client as never,
        profileId: "222",
        playerId: "player-1",
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: "lookup_failed",
    });
  });
});

describe("isCoh3ProfileAlreadyLinkedError", () => {
  it("recognizes PostgreSQL uniqueness errors and the domain error", () => {
    expect(isCoh3ProfileAlreadyLinkedError({ code: "23505" })).toBe(true);
    expect(
      isCoh3ProfileAlreadyLinkedError({
        message: "COH3Stats profile is already linked to another account",
      })
    ).toBe(true);
    expect(isCoh3ProfileAlreadyLinkedError({ code: "22000" })).toBe(false);
  });
});
