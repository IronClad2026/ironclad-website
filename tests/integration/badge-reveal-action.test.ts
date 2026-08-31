import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const getRequestLocaleMock = vi.hoisted(() => vi.fn());
const loadDictionaryMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/i18n/loaders", () => ({
  loadDictionary: loadDictionaryMock,
}));
vi.mock("@/lib/i18n/request", () => ({
  getRequestLocale: getRequestLocaleMock,
}));
vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { acknowledgeBadgeReveal } from "@/app/dashboard/badge-reveal-actions";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const OWNED_AWARD_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_AWARD_ID = "33333333-3333-4333-8333-333333333333";
const LOCALIZED_GENERIC_ERROR =
  "Il riconoscimento del Badge non e stato salvato.";

describe("badge reveal acknowledgement action", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "clerk-player-a" });
    getRequestLocaleMock.mockResolvedValue("it");
    loadDictionaryMock.mockResolvedValue({
      reveal: { ackError: LOCALIZED_GENERIC_ERROR },
    });
  });

  it("acknowledges an owned award through the authenticated RLS client", async () => {
    const fixture = createActionClient();
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);

    await expect(acknowledgeBadgeReveal(OWNED_AWARD_ID)).resolves.toEqual({
      status: "success",
      code: "acknowledged",
    });

    expect(createAuthenticatedSupabaseClientMock).toHaveBeenCalledTimes(1);
    expect(fixture.playerQuery.eq).toHaveBeenCalledWith(
      "clerk_user_id",
      "clerk-player-a"
    );
    expect(fixture.playerQuery.is).toHaveBeenCalledWith(
      "account_closed_at",
      null
    );
    expect(fixture.awardQuery.eq.mock.calls).toEqual([
      ["id", OWNED_AWARD_ID],
      ["player_id", PLAYER_ID],
    ]);
    expect(fixture.insertQuery.insert).toHaveBeenCalledWith({
      player_badge_award_id: OWNED_AWARD_ID,
      player_id: PLAYER_ID,
    });
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/dashboard"],
      ["/dashboard/badges"],
    ]);
  });

  it("requires an authenticated Clerk identity before creating a client", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expect(acknowledgeBadgeReveal(OWNED_AWARD_ID)).resolves.toEqual({
      status: "error",
      code: "sign-in-required",
      message: LOCALIZED_GENERIC_ERROR,
    });

    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects malformed award identifiers before querying ownership", async () => {
    await expect(acknowledgeBadgeReveal("not-an-award-id")).resolves.toEqual({
      status: "error",
      code: "invalid-award",
      message: LOCALIZED_GENERIC_ERROR,
    });

    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("cannot acknowledge another player's award", async () => {
    const fixture = createActionClient({ award: null });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);

    await expect(acknowledgeBadgeReveal(OTHER_AWARD_ID)).resolves.toEqual({
      status: "error",
      code: "award-not-owned",
      message: LOCALIZED_GENERIC_ERROR,
    });

    expect(fixture.awardQuery.eq.mock.calls).toEqual([
      ["id", OTHER_AWARD_ID],
      ["player_id", PLAYER_ID],
    ]);
    expect(fixture.revealLookupQuery.maybeSingle).not.toHaveBeenCalled();
    expect(fixture.insertQuery.insert).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("treats an existing acknowledgement as idempotent success", async () => {
    const fixture = createActionClient({
      existingReveal: { player_badge_award_id: OWNED_AWARD_ID },
    });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);

    await expect(acknowledgeBadgeReveal(OWNED_AWARD_ID)).resolves.toEqual({
      status: "success",
      code: "already-acknowledged",
    });

    expect(fixture.insertQuery.insert).not.toHaveBeenCalled();
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/dashboard"],
      ["/dashboard/badges"],
    ]);
  });

  it("treats a concurrent unique conflict as idempotent success", async () => {
    const fixture = createActionClient({ insertError: { code: "23505" } });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);

    await expect(acknowledgeBadgeReveal(OWNED_AWARD_ID)).resolves.toEqual({
      status: "success",
      code: "already-acknowledged",
    });
  });

  it("returns localized generic copy without leaking a database failure", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const fixture = createActionClient({
      awardError: {
        code: "42501",
        message: "private database policy detail",
      },
    });
    createAuthenticatedSupabaseClientMock.mockResolvedValue(fixture.client);

    const result = await acknowledgeBadgeReveal(OWNED_AWARD_ID);

    expect(result).toEqual({
      status: "error",
      code: "lookup-failed",
      message: LOCALIZED_GENERIC_ERROR,
    });
    expect(JSON.stringify(result)).not.toContain("private database policy");
    expect(consoleError).toHaveBeenCalledWith(
      "Badge reveal acknowledgement failed.",
      { operation: "load-owned-award", code: "42501" }
    );
    expect(fixture.insertQuery.insert).not.toHaveBeenCalled();
  });
});

function createActionClient({
  award = { id: OWNED_AWARD_ID, player_id: PLAYER_ID },
  awardError = null,
  existingReveal = null,
  insertError = null,
}: {
  award?: { id: string; player_id: string } | null;
  awardError?: { code: string; message?: string } | null;
  existingReveal?: { player_badge_award_id: string } | null;
  insertError?: { code: string } | null;
} = {}) {
  const playerQuery = readQuery({ data: { id: PLAYER_ID }, error: null }, true);
  const awardQuery = readQuery({ data: award, error: awardError });
  const revealLookupQuery = readQuery({
    data: existingReveal,
    error: null,
  });
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
    playerQuery,
    awardQuery,
    insertQuery,
    revealLookupQuery,
  };
}

function readQuery(
  result: { data: unknown; error: unknown },
  supportsIs = false
) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);

  if (!supportsIs) {
    query.is.mockImplementation(() => {
      throw new Error("Unexpected is() filter on this query.");
    });
  }

  return query;
}
