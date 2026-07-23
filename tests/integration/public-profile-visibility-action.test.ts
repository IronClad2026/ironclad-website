import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { updatePublicProfileEnabled } from "@/app/dashboard/public-profile-actions";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";

describe("public profile visibility action", () => {
  beforeEach(() => {
    authMock.mockReset();
    createAuthenticatedSupabaseClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("rejects anonymous callers before database access", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    await expect(updatePublicProfileEnabled(true)).resolves.toMatchObject({
      status: "error",
      enabled: false,
    });
    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("rejects non-boolean input before database access", async () => {
    authMock.mockResolvedValue(playerIdentity);

    await expect(
      updatePublicProfileEnabled("true")
    ).resolves.toMatchObject({
      status: "error",
      enabled: false,
    });
    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("updates only the authenticated player's public profile flag", async () => {
    const supabase = createSupabaseQueryMock({
      data: {
        id: PLAYER_ID,
        public_profile_enabled: true,
      },
    });
    authMock.mockResolvedValue(playerIdentity);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(supabase.client);

    await expect(updatePublicProfileEnabled(true)).resolves.toEqual({
      status: "success",
      message: "Your player profile is now public.",
      enabled: true,
    });

    expect(supabase.from).toHaveBeenCalledWith("players");
    expect(supabase.calls).toContainEqual({
      method: "update",
      args: [{ public_profile_enabled: true }],
    });
    expect(supabase.calls).toContainEqual({
      method: "eq",
      args: ["clerk_user_id", playerIdentity.userId],
    });
    expect(
      JSON.stringify(
        supabase.calls.find((call) => call.method === "update")?.args[0]
      )
    ).not.toContain("discord");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/players");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/players/${PLAYER_ID}`);
  });

  it("fails closed when the authenticated player profile does not exist", async () => {
    const supabase = createSupabaseQueryMock({ data: null });
    authMock.mockResolvedValue(playerIdentity);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(supabase.client);

    await expect(updatePublicProfileEnabled(false)).resolves.toMatchObject({
      status: "error",
      enabled: false,
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
