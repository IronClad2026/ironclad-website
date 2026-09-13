import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const authMock = vi.hoisted(() => vi.fn());
const authenticatedClientMock = vi.hoisted(() => vi.fn());
const legalMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: authenticatedClientMock,
}));
vi.mock("@/lib/supabase", () => ({
  createNoStoreSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/account-legal-mutation-guard", () => ({
  requireCurrentAccountLegalAcceptance: legalMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));

import { saveCurrentThought, saveFeaturedBadge } from "@/app/dashboard/showcase/actions";

const PLAYER = "11111111-1111-4111-8111-111111111111";
const AWARD = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

function savedReply(thought: string | null = "GGs", award: string | null = null) {
  return {
    code: "saved",
    showcase: { revision: 4, current_thought: thought, featured_badge_award_id: award },
  };
}

function makeClient({
  player = { id: PLAYER },
  playerError = null,
  ownerData = { player_id: PLAYER, current_thought: null, featured_badge_award_id: null, thought_hidden_at: null, revision: 3 },
  ownerError = null,
  award = { id: AWARD, badge_slug: "ironclad-recruit" },
  rpcData = savedReply(),
  rpcError = null,
}: {
  player?: unknown;
  playerError?: { message: string } | null;
  ownerData?: unknown;
  ownerError?: { message: string } | null;
  award?: unknown;
  rpcData?: unknown;
  rpcError?: { message: string } | null;
} = {}) {
  const playerQuery = createSupabaseQueryMock({ data: player, error: playerError });
  // Authenticated players reads have no SELECT grant on account_closed_at.
  playerQuery.query.is = () => { throw new Error("permission denied: private players column"); };
  const awardQuery = createSupabaseQueryMock({ data: award });
  const from = vi.fn((table: string) => {
    if (table === "players") return playerQuery.query;
    if (table === "player_badge_awards") return awardQuery.query;
    throw new Error("Unexpected table: " + table);
  });
  const saveRpc = vi.fn().mockResolvedValue({ data: rpcData, error: rpcError });
  const rpc = vi.fn((name: string, parameters?: unknown) => name === "get_my_player_showcase"
    ? Promise.resolve({ data: ownerData, error: ownerError }) : saveRpc(name, parameters));
  const client = { from, rpc };
  authenticatedClientMock.mockResolvedValue(client);
  return { client, saveRpc, playerQuery, awardQuery };
}

describe("Player Showcase authenticated actions", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "clerk-owner" });
    legalMock.mockResolvedValue(undefined);
  });

  it("rejects both anonymous mutation endpoints before creating a database client", async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(saveCurrentThought({ currentThought: "GGs", revision: 3 })).resolves.toEqual({
      status: "error", code: "signInRequired",
    });
    await expect(saveFeaturedBadge({ awardId: AWARD, revision: 3 })).resolves.toEqual({
      status: "error", code: "signInRequired",
    });
    expect(authenticatedClientMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("derives ownership from Clerk and forwards only normalized thought and revision", async () => {
    const fixture = makeClient();
    const forgedInput = {
      currentThought: "  GGs\n", revision: 3, playerId: OTHER, clerk_user_id: "other",
    };
    await expect(saveCurrentThought(forgedInput)).resolves.toEqual({
      status: "success", code: "thoughtSaved", revision: 4,
      currentThought: "GGs", featuredBadgeAwardId: null,
    });
    expect(fixture.playerQuery.calls).toEqual(expect.arrayContaining([
      { method: "eq", args: ["clerk_user_id", "clerk-owner"] },
      { method: "eq", args: ["id", PLAYER] },
      { method: "select", args: ["id"] },
    ]));
    expect(fixture.saveRpc).toHaveBeenCalledExactlyOnceWith(
      "save_my_player_showcase_thought",
      { p_current_thought: "GGs", p_expected_revision: 3 }
    );
    expect(fixture.client.rpc).toHaveBeenNthCalledWith(1, "get_my_player_showcase");
    expect(legalMock).toHaveBeenCalledTimes(1);
    expect(revalidateMock.mock.calls).toEqual([
      ["/dashboard/showcase"], [`/players/${PLAYER}`],
    ]);
  });

  it.each([
    [{ currentThought: "x".repeat(161), revision: 3 }, "thoughtTooLong"],
    [{ currentThought: "\u0000unsafe", revision: 3 }, "thoughtInvalid"],
    [{ currentThought: 123, revision: 3 }, "thoughtInvalid"],
    [{ currentThought: "GGs", revision: -1 }, "conflict"],
    [{ currentThought: "GGs", revision: 0.5 }, "conflict"],
    [null, "conflict"],
  ])("rejects invalid thought payload %j without writing", async (input, code) => {
    const fixture = makeClient();
    await expect(saveCurrentThought(input as never)).resolves.toEqual({ status: "error", code });
    expect(fixture.saveRpc).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("allows clearing thought and badge without publishing under outdated agreements", async () => {
    const fixture = makeClient({ rpcData: savedReply(null) });
    legalMock.mockRejectedValue({ reason: "required" });
    await expect(saveCurrentThought({ currentThought: "  ", revision: 3 })).resolves.toMatchObject({
      status: "success", code: "thoughtSaved", currentThought: null,
    });
    await expect(saveFeaturedBadge({ awardId: null, revision: 3 })).resolves.toMatchObject({
      status: "success", code: "badgeSaved", featuredBadgeAwardId: null,
    });
    expect(legalMock).not.toHaveBeenCalled();
    expect(fixture.awardQuery.calls).toEqual([]);
  });

  it.each(["required", "unavailable"])("blocks publishing when agreements are %s", async (reason) => {
    const fixture = makeClient();
    legalMock.mockRejectedValue({ reason });
    await expect(saveCurrentThought({ currentThought: "GGs", revision: 3 })).resolves.toEqual({
      status: "error", code: reason === "required" ? "legalRequired" : "unavailable",
    });
    expect(fixture.saveRpc).not.toHaveBeenCalled();
  });

  it("fails closed when the owned open profile is missing", async () => {
    const fixture = makeClient({ player: null });
    await expect(saveFeaturedBadge({ awardId: AWARD, revision: 3 })).resolves.toEqual({
      status: "error", code: "profileRequired",
    });
    expect(fixture.saveRpc).not.toHaveBeenCalled();
  });

  it("treats a null owner RPC as a missing or closed account without reading players", async () => {
    const fixture = makeClient({ ownerData: null });
    await expect(saveCurrentThought({ currentThought: "GGs", revision: 3 })).resolves.toEqual({
      status: "error", code: "profileRequired",
    });
    expect(fixture.client.from).not.toHaveBeenCalled();
    expect(fixture.saveRpc).not.toHaveBeenCalled();
  });

  it.each([
    { player_id: OTHER }, { player_id: "clerk-owner" }, { revision: "3" },
    { current_thought: 123 }, { featured_badge_award_id: "bad" }, { thought_hidden_at: undefined },
  ])("rejects wrong-owner or malformed owner RPC data %j before writing", async (change) => {
    const fixture = makeClient({ ownerData: {
      player_id: PLAYER, revision: 3, current_thought: null,
      featured_badge_award_id: null, thought_hidden_at: null, ...change,
    } });
    await expect(saveFeaturedBadge({ awardId: AWARD, revision: 3 })).resolves.toEqual({
      status: "error", code: "unavailable",
    });
    expect(fixture.saveRpc).not.toHaveBeenCalled();
    expect(fixture.awardQuery.calls).toEqual([]);
    expect(legalMock).not.toHaveBeenCalled();
  });

  it("fails closed on an owner RPC read error", async () => {
    const fixture = makeClient({ ownerError: { message: "PRIVATE_DATABASE_DETAIL" } });
    await expect(saveCurrentThought({ currentThought: "GGs", revision: 3 })).resolves.toEqual({
      status: "error", code: "unavailable",
    });
    expect(fixture.client.from).not.toHaveBeenCalled();
    expect(fixture.saveRpc).not.toHaveBeenCalled();
  });
  it("validates exact award ownership and canonical catalogue membership before featuring", async () => {
    const fixture = makeClient({ rpcData: savedReply("GGs", AWARD) });
    await expect(saveFeaturedBadge({ awardId: AWARD, revision: 3 })).resolves.toMatchObject({
      status: "success", code: "badgeSaved", featuredBadgeAwardId: AWARD,
    });
    expect(fixture.awardQuery.calls).toEqual(expect.arrayContaining([
      { method: "eq", args: ["id", AWARD] },
      { method: "eq", args: ["player_id", PLAYER] },
    ]));
    expect(fixture.saveRpc).toHaveBeenCalledExactlyOnceWith(
      "save_my_player_showcase_badge", { p_award_id: AWARD, p_expected_revision: 3 }
    );
    expect(fixture.client.from.mock.calls.map(([table]) => table)).toEqual([
      "players", "player_badge_awards",
    ]);
  });

  it.each([null, { id: AWARD, badge_slug: "made-up-badge" }])(
    "rejects foreign, missing or noncanonical awards",
    async (award) => {
      const fixture = makeClient({ award });
      await expect(saveFeaturedBadge({ awardId: OTHER, revision: 3 })).resolves.toEqual({
        status: "error", code: "awardNotOwned",
      });
      expect(fixture.saveRpc).not.toHaveBeenCalled();
    }
  );

  it("rejects a forged non-UUID award before reading awards", async () => {
    const fixture = makeClient();
    await expect(saveFeaturedBadge({ awardId: "elite-champion", revision: 3 })).resolves.toEqual({
      status: "error", code: "invalidAward",
    });
    expect(fixture.awardQuery.calls).toEqual([]);
    expect(fixture.saveRpc).not.toHaveBeenCalled();
  });

  it.each([
    ["conflict", "conflict"],
    ["feature-disabled", "unavailable"],
    ["invalid-badge", "awardNotOwned"],
    ["profile-required", "profileRequired"],
    ["legal-required", "legalRequired"],
  ])("handles database race or denial %s without revalidating", async (dbCode, code) => {
    makeClient({ rpcData: { code: dbCode } });
    await expect(saveFeaturedBadge({ awardId: AWARD, revision: 3 })).resolves.toEqual({
      status: "error", code,
    });
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("returns an allowlisted latest baseline on revision conflict without auto-saving", async () => {
    const fixture = makeClient({ rpcData: {
      code: "conflict",
      showcase: {
        revision: 8, current_thought: "Saved in another session", featured_badge_award_id: AWARD,
        thought_hidden_at: "2026-09-01T12:00:00Z", thought_hidden_by: "PRIVATE_ADMIN_ID",
      },
    } });
    await expect(saveCurrentThought({ currentThought: "My unsaved draft", revision: 3 })).resolves.toEqual({
      status: "error", code: "conflict", revision: 8,
      currentThought: "Saved in another session", featuredBadgeAwardId: AWARD, thoughtHidden: true,
    });
    expect(fixture.saveRpc).toHaveBeenCalledTimes(1);
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("retains a plain conflict when the latest baseline contains invalid fields", async () => {
    makeClient({ rpcData: {
      code: "conflict",
      showcase: { revision: 8, current_thought: 123, featured_badge_award_id: null },
    } });
    await expect(saveCurrentThought({ currentThought: "My draft", revision: 3 })).resolves.toEqual({
      status: "error", code: "conflict",
    });
  });

  it.each(["constructor", "toString", "unknown-result"])(
    "does not treat an unknown database code %s as a localized result",
    async (code) => {
      makeClient({ rpcData: { code } });
      await expect(saveCurrentThought({ currentThought: "GGs", revision: 3 })).resolves.toEqual({
        status: "error", code: "saveFailed",
      });
    }
  );

  it("returns generic errors without database details or private fields", async () => {
    makeClient({ rpcError: { message: "PRIVATE_DATABASE_DETAIL" } });
    const result = await saveCurrentThought({ currentThought: "GGs", revision: 3 });
    expect(result).toEqual({ status: "error", code: "saveFailed" });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_DATABASE_DETAIL");
  });

  it("rejects an invalid success envelope without exposing its contents", async () => {
    makeClient({ rpcData: {
      code: "saved",
      showcase: { revision: "4", current_thought: "GGs", featured_badge_award_id: null,
        clerk_user_id: "PRIVATE_CLERK_ID" },
    } });
    await expect(saveCurrentThought({ currentThought: "GGs", revision: 3 })).resolves.toEqual({
      status: "error", code: "saveFailed",
    });
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
