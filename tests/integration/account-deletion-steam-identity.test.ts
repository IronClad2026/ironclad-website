import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const clerkClientMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import { deleteIronCladAccount } from "@/app/profile/delete-account-action";

function createAccountDeletionClient() {
  const registrationEq = vi.fn(async () => ({ error: null }));
  const registrationUpdate = vi.fn(() => ({ eq: registrationEq }));
  const playerEq = vi.fn(async () => ({ error: null }));
  const playerDelete = vi.fn(() => ({ eq: playerEq }));
  const remove = vi.fn(async () => ({ error: null }));
  const storageFrom = vi.fn(() => ({ remove }));
  const from = vi.fn((table: string) => {
    if (table === "registrations") {
      return { update: registrationUpdate };
    }

    if (table === "players") {
      return { delete: playerDelete };
    }

    throw new Error(`Unexpected account-deletion table: ${table}`);
  });

  return {
    client: {
      from,
      storage: {
        from: storageFrom,
      },
    },
    from,
    playerDelete,
    playerEq,
    remove,
    storageFrom,
  };
}

describe("Steam identity account-deletion regression", () => {
  beforeEach(() => {
    authMock.mockReset();
    clerkClientMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("rejects an anonymous caller before service-role access", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    const formData = new FormData();
    formData.set("confirmation", "DELETE");

    await expect(
      deleteIronCladAccount(
        { status: "idle", message: "" },
        formData
      )
    ).resolves.toMatchObject({ status: "error" });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("deletes the whole player row through the service role before deleting Clerk", async () => {
    const deletion = createAccountDeletionClient();
    const deleteUser = vi.fn(async () => undefined);
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(deletion.client);
    clerkClientMock.mockResolvedValue({
      users: {
        deleteUser,
      },
    });

    const formData = new FormData();
    formData.set("confirmation", "DELETE");

    await expect(
      deleteIronCladAccount(
        { status: "idle", message: "" },
        formData
      )
    ).resolves.toEqual({
      status: "success",
      message: "Your IronClad account has been deleted.",
    });

    expect(createSupabaseAdminClientMock).toHaveBeenCalledOnce();
    expect(deletion.from).toHaveBeenCalledWith("players");
    expect(deletion.playerDelete).toHaveBeenCalledOnce();
    expect(deletion.playerEq).toHaveBeenCalledWith(
      "clerk_user_id",
      playerIdentity.userId
    );
    expect(deletion.storageFrom).toHaveBeenCalledWith("player-avatars");
    expect(deletion.remove).toHaveBeenCalledWith([
      `${playerIdentity.userId}/avatar`,
    ]);
    expect(deleteUser).toHaveBeenCalledWith(playerIdentity.userId);
    expect(deletion.playerEq.mock.invocationCallOrder[0]).toBeLessThan(
      deleteUser.mock.invocationCallOrder[0]
    );
  });
});
