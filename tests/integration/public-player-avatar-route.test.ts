import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import { GET } from "@/app/players/[playerId]/avatar/route";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "user_avatar_owner";

type AvatarPlayer = {
  avatar_url: string | null;
  clerk_user_id: string | null;
  public_profile_enabled: boolean;
};

function createAvatarClient({
  avatar = new Blob(["avatar-bytes"], { type: "image/png" }),
  avatarError = null,
  player,
  playerError = null,
}: {
  avatar?: Blob | null;
  avatarError?: { message: string } | null;
  player: AvatarPlayer | null;
  playerError?: { message: string } | null;
}) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: player,
      error: playerError,
    })),
  };
  const download = vi.fn(async () => ({
    data: avatar,
    error: avatarError,
  }));
  const storageFrom = vi.fn(() => ({ download }));
  const from = vi.fn(() => query);

  return {
    client: {
      from,
      storage: {
        from: storageFrom,
      },
    },
    download,
    from,
    query,
    storageFrom,
  };
}

async function requestAvatar(playerId = PLAYER_ID) {
  return GET(new Request(`http://localhost/players/${playerId}/avatar`), {
    params: Promise.resolve({ playerId }),
  });
}

function expectPrivateNoStore(response: Response) {
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
}

describe("public player avatar route", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
  });

  it("rejects invalid player IDs before service-role access", async () => {
    const response = await requestAvatar("not-a-uuid");

    expect(response.headers.get("Content-Type")).toContain("image/svg+xml");
    expectPrivateNoStore(response);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("serves an opted-in player's avatar anonymously without raw-path exposure", async () => {
    const supabase = createAvatarClient({
      player: {
        avatar_url: `/players/${PLAYER_ID}/avatar`,
        clerk_user_id: OWNER_ID,
        public_profile_enabled: true,
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);

    const response = await requestAvatar();

    expect(response.headers.get("Content-Type")).toBe("image/png");
    expectPrivateNoStore(response);
    expect(await response.text()).toBe("avatar-bytes");
    expect(authMock).not.toHaveBeenCalled();
    expect(supabase.download).toHaveBeenCalledOnce();
  });

  it("makes a private profile indistinguishable from a missing profile", async () => {
    const privateClient = createAvatarClient({
      player: {
        avatar_url: `/players/${PLAYER_ID}/avatar`,
        clerk_user_id: OWNER_ID,
        public_profile_enabled: false,
      },
    });
    createSupabaseAdminClientMock.mockReturnValueOnce(privateClient.client);
    authMock.mockResolvedValueOnce(anonymousIdentity);
    const privateResponse = await requestAvatar();

    const missingClient = createAvatarClient({ player: null });
    createSupabaseAdminClientMock.mockReturnValueOnce(missingClient.client);
    const missingResponse = await requestAvatar();

    expect(await privateResponse.text()).toBe(await missingResponse.text());
    expect(privateResponse.headers.get("Content-Type")).toBe(
      missingResponse.headers.get("Content-Type")
    );
    expectPrivateNoStore(privateResponse);
    expectPrivateNoStore(missingResponse);
    expect(privateClient.download).not.toHaveBeenCalled();
    expect(missingClient.download).not.toHaveBeenCalled();
  });

  it("does not serve a private avatar to another signed-in player", async () => {
    const supabase = createAvatarClient({
      player: {
        avatar_url: `/players/${PLAYER_ID}/avatar`,
        clerk_user_id: OWNER_ID,
        public_profile_enabled: false,
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    authMock.mockResolvedValue(playerIdentity);

    const response = await requestAvatar();

    expect(response.headers.get("Content-Type")).toContain("image/svg+xml");
    expectPrivateNoStore(response);
    expect(supabase.download).not.toHaveBeenCalled();
  });

  it.each([
    [
      "owner",
      {
        ...playerIdentity,
        userId: OWNER_ID,
      },
    ],
    ["admin", adminIdentity],
  ])("serves a private avatar to the %s", async (_name, identity) => {
    const supabase = createAvatarClient({
      player: {
        avatar_url: `/players/${PLAYER_ID}/avatar`,
        clerk_user_id: OWNER_ID,
        public_profile_enabled: false,
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(supabase.client);
    authMock.mockResolvedValue(identity);

    const response = await requestAvatar();

    expect(response.headers.get("Content-Type")).toBe("image/png");
    expectPrivateNoStore(response);
    expect(supabase.download).toHaveBeenCalledOnce();
  });
});
