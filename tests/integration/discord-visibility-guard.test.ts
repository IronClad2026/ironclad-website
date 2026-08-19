import { beforeEach, describe, expect, it, vi } from "vitest";
import { playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/notification-events", () => ({
  notifyAdminsOfMatchDispute: vi.fn(),
  notifyNoShowReporterOfResponse: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));

import { updateDiscordPublicEnabled } from "@/app/dashboard/actions";

type VisibilityProfile = {
  id: string;
  discord_username: string | null;
  discord_public_enabled: boolean;
};

function createVisibilityClient({
  profile,
  updateData,
  updateError = null,
}: {
  profile: VisibilityProfile | null;
  updateData?: { id: string; discord_public_enabled: boolean } | null;
  updateError?: unknown;
}) {
  const lookupMaybeSingle = vi.fn(async () => ({
    data: profile,
    error: null,
  }));
  const updateMaybeSingle = vi.fn(async () => ({
    data: updateData ?? null,
    error: updateError,
  }));
  const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
  const updateEq = vi.fn(() => ({
    error: updateError,
    select: updateSelect,
  }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const lookupEq = vi.fn(() => ({ maybeSingle: lookupMaybeSingle }));
  const select = vi.fn(() => ({ eq: lookupEq }));
  const from = vi.fn(() => ({ select, update }));

  return {
    client: { from },
    from,
    select,
    update,
    updateEq,
    updateSelect,
  };
}

describe("Discord public-visibility guard", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(playerIdentity);
  });

  it("rejects a non-boolean visibility value before creating a client", async () => {
    await expect(
      updateDiscordPublicEnabled("true" as unknown as boolean)
    ).resolves.toEqual({
      status: "error",
      code: "invalid-value",
      message: "Choose whether Discord contact should be public.",
      enabled: false,
    });

    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("refuses opt-in without a usable Discord username and self-heals the flag", async () => {
    const fixture = createVisibilityClient({
      profile: {
        id: "11111111-1111-4111-8111-111111111111",
        discord_username: "   ",
        discord_public_enabled: true,
      },
    });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);

    await expect(updateDiscordPublicEnabled(true)).resolves.toEqual({
      status: "error",
      code: "username-required",
      message:
        "Add an optional Discord username to your profile before making it public.",
      enabled: false,
    });

    expect(fixture.update).toHaveBeenCalledWith({
      discord_public_enabled: false,
    });
    expect(fixture.updateEq).toHaveBeenCalledWith(
      "clerk_user_id",
      playerIdentity.userId
    );
    expect(fixture.updateSelect).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/players");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/players/11111111-1111-4111-8111-111111111111"
    );
  });

  it("allows opt-in when a Discord username is present", async () => {
    const fixture = createVisibilityClient({
      profile: {
        id: "11111111-1111-4111-8111-111111111111",
        discord_username: "iron-tester",
        discord_public_enabled: false,
      },
      updateData: {
        id: "11111111-1111-4111-8111-111111111111",
        discord_public_enabled: true,
      },
    });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);

    await expect(updateDiscordPublicEnabled(true)).resolves.toEqual({
      status: "success",
      code: "enabled",
      message: "Discord contact is visible on your public profile.",
      enabled: true,
    });

    expect(fixture.update).toHaveBeenCalledWith({
      discord_public_enabled: true,
    });
    expect(fixture.updateSelect).toHaveBeenCalledOnce();
  });
});
