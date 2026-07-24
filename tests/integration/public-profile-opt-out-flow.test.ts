import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const createNoStoreSupabaseClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
);

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient:
    createAuthenticatedSupabaseClientMock,
}));

vi.mock("@/lib/supabase", () => ({
  createNoStoreSupabaseClient: createNoStoreSupabaseClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

import { updatePublicProfileEnabled } from "@/app/dashboard/public-profile-actions";
import PublicPlayerProfilePage from "@/app/players/[playerId]/page";
import {
  getPublicPlayerById,
  getPublicPlayers,
} from "@/lib/public-players";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";

const publicRow = {
  id: PLAYER_ID,
  display_name: "Visibility Tester",
  player_name: "OptOutCommander",
  country: "Australia",
  region: "Oceania",
  current_elo: 1450,
  public_profile_enabled: true,
  discord_public_enabled: false,
  discord_username: null,
  has_avatar: false,
  avatar_url: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

type QueryResult = {
  data: unknown;
  error: null;
};

type Query = PromiseLike<QueryResult> & {
  eq: (column: string, value: unknown) => Query;
  maybeSingle: () => Promise<QueryResult>;
  order: (column: string, options: unknown) => Query;
  select: (columns: string) => Query;
  update: (values: Record<string, unknown>) => Query;
};

function createVisibilityDatabase() {
  let publicProfileEnabled = false;

  const createQuery = (
    table: string,
    scope: "authenticated" | "public"
  ): Query => {
    const filters = new Map<string, unknown>();
    let updateValues: Record<string, unknown> | null = null;

    const resolve = (single: boolean): QueryResult => {
      if (scope === "authenticated" && table === "players") {
        if (updateValues) {
          const ownsRow =
            filters.get("clerk_user_id") === playerIdentity.userId;

          if (!ownsRow) {
            return { data: null, error: null };
          }

          publicProfileEnabled =
            updateValues.public_profile_enabled === true;
          return {
            data: {
              id: PLAYER_ID,
              public_profile_enabled: publicProfileEnabled,
            },
            error: null,
          };
        }

        return {
          data: {
            id: PLAYER_ID,
            public_profile_enabled: publicProfileEnabled,
          },
          error: null,
        };
      }

      if (scope === "public" && table === "public_player_profiles") {
        const matchesVisibility =
          filters.get("public_profile_enabled") === true &&
          publicProfileEnabled;
        const matchesId =
          !filters.has("id") || filters.get("id") === PLAYER_ID;
        const row =
          matchesVisibility && matchesId
            ? {
                ...publicRow,
                public_profile_enabled: publicProfileEnabled,
              }
            : null;

        return {
          data: single ? row : row ? [row] : [],
          error: null,
        };
      }

      throw new Error(`Unexpected ${scope} query for ${table}.`);
    };

    const query = {} as Query;
    query.eq = (column, value) => {
      filters.set(column, value);
      return query;
    };
    query.maybeSingle = () => Promise.resolve(resolve(true));
    query.order = () => query;
    query.select = () => query;
    query.update = (values) => {
      updateValues = values;
      return query;
    };
    query.then = (resolvePromise, rejectPromise) =>
      Promise.resolve(resolve(false)).then(resolvePromise, rejectPromise);

    return query;
  };

  return {
    authenticatedClient: {
      from: vi.fn((table: string) =>
        createQuery(table, "authenticated")
      ),
    },
    publicClient: {
      from: vi.fn((table: string) => createQuery(table, "public")),
    },
  };
}

describe("public profile opt-out flow", () => {
  beforeEach(() => {
    authMock.mockReset();
    createAuthenticatedSupabaseClientMock.mockReset();
    createNoStoreSupabaseClientMock.mockReset();
    revalidatePathMock.mockReset();
    notFoundMock.mockClear();
  });

  it("removes an opted-out player from every signed-out public read", async () => {
    const database = createVisibilityDatabase();
    authMock.mockResolvedValue(playerIdentity);
    createAuthenticatedSupabaseClientMock.mockResolvedValue(
      database.authenticatedClient
    );
    createNoStoreSupabaseClientMock.mockReturnValue(database.publicClient);

    await expect(updatePublicProfileEnabled(true)).resolves.toMatchObject({
      status: "success",
      enabled: true,
    });
    await expect(getPublicPlayers()).resolves.toMatchObject([
      {
        id: PLAYER_ID,
        publicProfileEnabled: true,
      },
    ]);

    await expect(updatePublicProfileEnabled(false)).resolves.toMatchObject({
      status: "success",
      enabled: false,
    });

    authMock.mockResolvedValue(anonymousIdentity);

    await expect(getPublicPlayers()).resolves.toEqual([]);
    await expect(getPublicPlayerById(PLAYER_ID)).resolves.toBeNull();
    await expect(
      PublicPlayerProfilePage({
        params: Promise.resolve({ playerId: PLAYER_ID }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(getPublicPlayers()).resolves.toEqual([]);

    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(createNoStoreSupabaseClientMock).toHaveBeenCalledTimes(5);
  });
});
