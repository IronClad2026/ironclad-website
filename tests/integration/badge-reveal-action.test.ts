import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { acknowledgeBadgeReveal } from "@/app/dashboard/badge-reveal-actions";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const OWNED_AWARD_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_AWARD_ID = "33333333-3333-4333-8333-333333333333";

describe("badge reveal acknowledgement action", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "clerk-player-a" });
    revalidatePathMock.mockReset();
  });

  it("acknowledges an owned award using only server-resolved identity", async () => {
    const fixture = createActionClient();
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);

    await expect(acknowledgeBadgeReveal(OWNED_AWARD_ID)).resolves.toEqual({
      status: "success",
      code: "acknowledged",
    });
    expect(fixture.insertQuery.insert).toHaveBeenCalledWith({
      player_badge_award_id: OWNED_AWARD_ID,
      player_id: PLAYER_ID,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });

  it("cannot acknowledge another player's award", async () => {
    const fixture = createActionClient({ award: null });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);

    await expect(acknowledgeBadgeReveal(OTHER_AWARD_ID)).resolves.toMatchObject({
      status: "error",
      code: "award-not-owned",
    });
    expect(fixture.insertQuery.insert).not.toHaveBeenCalled();
  });

  it("rejects a valid but non-owned award identifier", async () => {
    const fixture = createActionClient({ award: null });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);

    await expect(acknowledgeBadgeReveal(OWNED_AWARD_ID)).resolves.toMatchObject({
      status: "error",
      code: "award-not-owned",
    });
    expect(fixture.revealLookupQuery.maybeSingle).not.toHaveBeenCalled();
  });

  it("treats duplicate acknowledgement as idempotent success", async () => {
    const fixture = createActionClient({
      existingReveal: { player_badge_award_id: OWNED_AWARD_ID },
    });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);

    await expect(acknowledgeBadgeReveal(OWNED_AWARD_ID)).resolves.toEqual({
      status: "success",
      code: "already-acknowledged",
    });
    expect(fixture.insertQuery.insert).not.toHaveBeenCalled();
  });

  it("treats a concurrent unique conflict as idempotent success", async () => {
    const fixture = createActionClient({ insertError: { code: "23505" } });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);

    await expect(acknowledgeBadgeReveal(OWNED_AWARD_ID)).resolves.toEqual({
      status: "success",
      code: "already-acknowledged",
    });
  });
});

function createActionClient({
  award = { id: OWNED_AWARD_ID, player_id: PLAYER_ID },
  existingReveal = null,
  insertError = null,
}: {
  award?: { id: string; player_id: string } | null;
  existingReveal?: { player_badge_award_id: string } | null;
  insertError?: { code: string } | null;
} = {}) {
  const playerQuery = readQuery({ data: { id: PLAYER_ID }, error: null });
  const awardQuery = readQuery({ data: award, error: null });
  const revealLookupQuery = readQuery({ data: existingReveal, error: null });
  const insertQuery = {
    insert: vi.fn(async () => ({ data: null, error: insertError })),
  };
  let revealCalls = 0;

  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === "players") return playerQuery;
        if (table === "player_badge_awards") return awardQuery;
        if (table === "player_badge_reveals") {
          revealCalls += 1;
          return revealCalls === 1 ? revealLookupQuery : insertQuery;
        }
        throw new Error(`Unexpected acknowledgement table: ${table}`);
      }),
    },
    insertQuery,
    revealLookupQuery,
  };
}

function readQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}
