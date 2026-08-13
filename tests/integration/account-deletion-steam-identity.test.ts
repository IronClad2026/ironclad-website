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

function createAccountDeletionClient({
  avatarError = null,
  closureData = { outcome: "deleted" },
  closureError = null,
}: {
  avatarError?: { message: string } | null;
  closureData?: unknown;
  closureError?: { message: string } | null;
} = {}) {
  const remove = vi.fn(async () => ({ error: avatarError }));
  const storageFrom = vi.fn(() => ({ remove }));
  const rpc = vi.fn(async () => ({ data: closureData, error: closureError }));

  return {
    client: {
      rpc,
      storage: {
        from: storageFrom,
      },
    },
    remove,
    rpc,
    storageFrom,
  };
}

function deletionFormData(confirmation = "DELETE") {
  const formData = new FormData();
  formData.set("confirmation", confirmation);
  return formData;
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

    await expect(
      deleteIronCladAccount(
        { status: "idle", message: "" },
        deletionFormData()
      )
    ).resolves.toMatchObject({ status: "error" });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid confirmation before service-role access", async () => {
    authMock.mockResolvedValue(playerIdentity);

    await expect(
      deleteIronCladAccount(
        { status: "idle", message: "" },
        deletionFormData("delete")
      )
    ).resolves.toMatchObject({ status: "error" });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("stops before database and Clerk closure when avatar cleanup fails", async () => {
    const deletion = createAccountDeletionClient({
      avatarError: { message: "Storage unavailable" },
    });
    const deleteUser = vi.fn(async () => undefined);
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(deletion.client);
    clerkClientMock.mockResolvedValue({ users: { deleteUser } });

    await expect(
      deleteIronCladAccount(
        { status: "idle", message: "" },
        deletionFormData()
      )
    ).resolves.toMatchObject({ status: "error" });

    expect(deletion.rpc).not.toHaveBeenCalled();
    expect(clerkClientMock).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it.each(["deleted", "pseudonymized", "not_found"] as const)(
    "closes a %s database identity between avatar cleanup and Clerk deletion",
    async (outcome) => {
      const deletion = createAccountDeletionClient({
        closureData: { outcome },
      });
      const deleteUser = vi.fn(async () => undefined);
      authMock.mockResolvedValue(playerIdentity);
      createSupabaseAdminClientMock.mockReturnValue(deletion.client);
      clerkClientMock.mockResolvedValue({
        users: {
          deleteUser,
        },
      });

      await expect(
        deleteIronCladAccount(
          { status: "idle", message: "" },
          deletionFormData()
        )
      ).resolves.toEqual({
        status: "success",
        message: "Your IronClad account has been deleted.",
      });

      expect(createSupabaseAdminClientMock).toHaveBeenCalledOnce();
      expect(deletion.storageFrom).toHaveBeenCalledWith("player-avatars");
      expect(deletion.remove).toHaveBeenCalledWith([
        `${playerIdentity.userId}/avatar`,
      ]);
      expect(deletion.rpc).toHaveBeenCalledWith(
        "close_ironclad_player_account",
        {
          p_clerk_user_id: playerIdentity.userId,
        }
      );
      expect(deleteUser).toHaveBeenCalledWith(playerIdentity.userId);
      expect(deletion.remove.mock.invocationCallOrder[0]).toBeLessThan(
        deletion.rpc.mock.invocationCallOrder[0]
      );
      expect(deletion.rpc.mock.invocationCallOrder[0]).toBeLessThan(
        deleteUser.mock.invocationCallOrder[0]
      );
    }
  );

  it("keeps Clerk intact when database closure fails", async () => {
    const deletion = createAccountDeletionClient({
      closureError: { message: "Database unavailable" },
    });
    const deleteUser = vi.fn(async () => undefined);
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(deletion.client);
    clerkClientMock.mockResolvedValue({ users: { deleteUser } });

    await expect(
      deleteIronCladAccount(
        { status: "idle", message: "" },
        deletionFormData()
      )
    ).resolves.toMatchObject({ status: "error" });

    expect(deletion.rpc).toHaveBeenCalledOnce();
    expect(clerkClientMock).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("rejects an unexpected closure result before deleting Clerk", async () => {
    const deletion = createAccountDeletionClient({
      closureData: { outcome: "unexpected" },
    });
    const deleteUser = vi.fn(async () => undefined);
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(deletion.client);
    clerkClientMock.mockResolvedValue({ users: { deleteUser } });

    await expect(
      deleteIronCladAccount(
        { status: "idle", message: "" },
        deletionFormData()
      )
    ).resolves.toMatchObject({ status: "error" });

    expect(clerkClientMock).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("reports a partial failure after the database identity is safely closed", async () => {
    const deletion = createAccountDeletionClient();
    const deleteUser = vi.fn(async () => {
      throw new Error("Clerk unavailable");
    });
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(deletion.client);
    clerkClientMock.mockResolvedValue({
      users: {
        deleteUser,
      },
    });

    await expect(
      deleteIronCladAccount(
        { status: "idle", message: "" },
        deletionFormData()
      )
    ).resolves.toEqual({
      status: "error",
      message:
        "Your IronClad identity was closed, but Clerk account deletion failed. Contact an administrator.",
    });

    expect(deletion.rpc).toHaveBeenCalledOnce();
    expect(deleteUser).toHaveBeenCalledWith(playerIdentity.userId);
  });
});
