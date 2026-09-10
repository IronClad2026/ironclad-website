import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const authMock = vi.hoisted(() => vi.fn());
const publicClientMock = vi.hoisted(() => vi.fn());
const authenticatedClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase", () => ({
  createNoStoreSupabaseClient: publicClientMock,
}));
vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: authenticatedClientMock,
}));

import {
  getMyPlayerShowcase,
  getPlayerShowcaseEnabled,
  getPublicPlayerShowcase,
} from "@/lib/player-showcase/read";

const PLAYER = "11111111-1111-4111-8111-111111111111";
const AWARD = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const DATE = "2026-09-01T12:00:00Z";

function makePublicClient({
  enabled = true,
  data = null,
  error = null,
}: {
  enabled?: unknown;
  data?: unknown;
  error?: { message: string } | null;
} = {}) {
  const query = createSupabaseQueryMock({ data, error });
  const rpc = vi.fn().mockResolvedValue({ data: enabled, error: null });
  const from = vi.fn(() => query.query);
  publicClientMock.mockReturnValue({ from, rpc });
  return { query, from, rpc };
}

function makeEditorClient({
  player = { id: PLAYER, public_profile_enabled: true },
  state = {
    player_id: PLAYER,
    current_thought: "GGs",
    featured_badge_award_id: AWARD,
    thought_hidden_at: null,
    revision: 3,
  },
  awards = [{
    id: AWARD,
    badge_slug: "ironclad-recruit",
    unlocked_at: DATE,
    original_unlocked_at: null,
  }],
  awardError = null,
}: {
  player?: unknown;
  state?: unknown;
  awards?: unknown;
  awardError?: { message: string } | null;
} = {}) {
  const playerQuery = createSupabaseQueryMock({ data: player });
  // Match the live authenticated column boundary instead of allowing private filters.
  playerQuery.query.is = () => { throw new Error("permission denied: private players column"); };
  const awardQuery = createSupabaseQueryMock({ data: awards, error: awardError });
  const from = vi.fn((table: string) => {
    if (table === "players") return playerQuery.query;
    if (table === "player_badge_awards") return awardQuery.query;
    throw new Error("Unexpected private table: " + table);
  });
  const rpc = vi.fn().mockResolvedValue({ data: state, error: null });
  authenticatedClientMock.mockResolvedValue({ from, rpc });
  return { from, rpc, playerQuery, awardQuery };
}

describe("Player Showcase public projection", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "clerk-owner" });
  });

  it("returns only allowlisted public fields from the scoped public projection", async () => {
    const fixture = makePublicClient({ data: {
      player_id: PLAYER,
      current_thought: "<script>alert(1)</script>",
      featured_badge_slug: "ironclad-recruit",
      featured_badge_unlocked_at: DATE,
      clerk_user_id: "PRIVATE_CLERK_ID",
      featured_badge_award_id: AWARD,
      source_metadata: { registrationId: "PRIVATE_REGISTRATION" },
      thought_hidden_by: "PRIVATE_ADMIN_ID",
    } });

    const result = await getPublicPlayerShowcase(PLAYER);
    expect(result).toEqual({
      currentThought: "<script>alert(1)</script>",
      featuredBadge: { slug: "ironclad-recruit", unlockedAt: DATE },
    });
    expect(fixture.from).toHaveBeenCalledExactlyOnceWith("public_player_showcases");
    expect(fixture.query.calls).toEqual(expect.arrayContaining([
      { method: "select", args: [
        "player_id, current_thought, featured_badge_slug, featured_badge_unlocked_at",
      ] },
      { method: "eq", args: ["player_id", PLAYER] },
    ]));
    expect(JSON.stringify(result)).not.toContain("PRIVATE_");
    expect(JSON.stringify(result)).not.toContain(AWARD);
    expect(authMock).not.toHaveBeenCalled();
    expect(authenticatedClientMock).not.toHaveBeenCalled();
  });

  it("does not query public assets for malformed player identifiers", async () => {
    await expect(getPublicPlayerShowcase("clerk-owner")).resolves.toBeNull();
    expect(publicClientMock).not.toHaveBeenCalled();
  });

  it.each([false, null, "true"])("fails closed when the flag is not true (%j)", async (enabled) => {
    const fixture = makePublicClient({ enabled });
    await expect(getPublicPlayerShowcase(PLAYER)).resolves.toBeNull();
    expect(fixture.from).not.toHaveBeenCalled();
  });

  it("reads the enable flag afresh so disabling the feature takes effect", async () => {
    const fixture = makePublicClient();
    fixture.rpc.mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    await expect(getPlayerShowcaseEnabled()).resolves.toBe(true);
    await expect(getPlayerShowcaseEnabled()).resolves.toBe(false);
  });

  it("does not synthesize content when the database projection withholds a player", async () => {
    makePublicClient({ data: null });
    await expect(getPublicPlayerShowcase(PLAYER)).resolves.toEqual({
      currentThought: null, featuredBadge: null,
    });
  });

  it("drops malformed thought and unknown badge presentation independently", async () => {
    makePublicClient({ data: {
      player_id: PLAYER, current_thought: "x".repeat(161),
      featured_badge_slug: "unearned-made-up-badge", featured_badge_unlocked_at: DATE,
    } });
    await expect(getPublicPlayerShowcase(PLAYER)).resolves.toEqual({
      currentThought: null, featuredBadge: null,
    });
  });

  it("keeps a known badge without inventing an invalid unlock date", async () => {
    makePublicClient({ data: {
      player_id: PLAYER, current_thought: null,
      featured_badge_slug: "ironclad-recruit", featured_badge_unlocked_at: "not-a-date",
    } });
    await expect(getPublicPlayerShowcase(PLAYER)).resolves.toEqual({
      currentThought: null, featuredBadge: { slug: "ironclad-recruit", unlockedAt: null },
    });
  });

  it("isolates missing migrations and query failures from the existing profile", async () => {
    makePublicClient({ error: { message: "PRIVATE_DATABASE_ERROR" } });
    await expect(getPublicPlayerShowcase(PLAYER)).resolves.toBeNull();
    publicClientMock.mockImplementation(() => { throw new Error("UNAVAILABLE"); });
    await expect(getPublicPlayerShowcase(PLAYER)).resolves.toBeNull();
  });
});

describe("Player Showcase private editor projection", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "clerk-owner" });
    makePublicClient();
  });

  it("requires authentication before loading private profile or awards", async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(getMyPlayerShowcase()).resolves.toEqual({
      status: "error", code: "signInRequired",
    });
    expect(authenticatedClientMock).not.toHaveBeenCalled();
    expect(publicClientMock).not.toHaveBeenCalled();
  });

  it("uses active-owner RPC identity and granted player columns while stripping private evidence", async () => {
    const fixture = makeEditorClient({ awards: [{
      id: AWARD, badge_slug: "ironclad-recruit", unlocked_at: DATE,
      original_unlocked_at: "2026-08-01T12:00:00Z",
      source_metadata: { private: "PRIVATE_EVIDENCE" },
      standard_reveal_seen_at: "PRIVATE_REVEAL",
    }] });
    const result = await getMyPlayerShowcase();
    expect(result).toEqual({
      status: "success",
      state: {
        playerId: PLAYER, currentThought: "GGs", featuredBadgeAwardId: AWARD,
        thoughtHidden: false, revision: 3, publicProfileEnabled: true,
        awards: [{ awardId: AWARD, slug: "ironclad-recruit", unlockedAt: "2026-08-01T12:00:00Z" }],
      },
    });
    expect(fixture.playerQuery.calls).toEqual(expect.arrayContaining([
      { method: "eq", args: ["clerk_user_id", "clerk-owner"] },
      { method: "eq", args: ["id", PLAYER] },
      { method: "select", args: ["id, public_profile_enabled"] },
    ]));
    expect(fixture.awardQuery.calls).toEqual(expect.arrayContaining([
      { method: "eq", args: ["player_id", PLAYER] },
      { method: "select", args: ["id, badge_slug, unlocked_at, original_unlocked_at"] },
    ]));
    expect(fixture.rpc).toHaveBeenCalledExactlyOnceWith("get_my_player_showcase");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_");
  });

  it("keeps owner editing available while their public profile is disabled", async () => {
    makeEditorClient({ player: { id: PLAYER, public_profile_enabled: false } });
    await expect(getMyPlayerShowcase()).resolves.toMatchObject({
      status: "success", state: { publicProfileEnabled: false, currentThought: "GGs" },
    });
  });

  it("rejects a mismatched private RPC player before reading awards", async () => {
    const fixture = makeEditorClient({ state: {
      player_id: OTHER, current_thought: "Private other player", revision: 3,
      featured_badge_award_id: null, thought_hidden_at: null,
    } });
    await expect(getMyPlayerShowcase()).resolves.toEqual({
      status: "error", code: "unavailable",
    });
    expect(fixture.playerQuery.calls).toEqual(expect.arrayContaining([
      { method: "eq", args: ["clerk_user_id", "clerk-owner"] },
      { method: "eq", args: ["id", OTHER] },
    ]));
    expect(fixture.awardQuery.calls).toEqual([]);
  });

  it("uses a null owner RPC for missing or closed accounts without table reads", async () => {
    const fixture = makeEditorClient({ state: null });
    await expect(getMyPlayerShowcase()).resolves.toEqual({ status: "error", code: "profileRequired" });
    expect(fixture.from).not.toHaveBeenCalled();
  });

  it.each([
    { player_id: "clerk-owner" }, { revision: "3" }, { revision: -1 },
    { current_thought: undefined }, { featured_badge_award_id: "bad" }, { thought_hidden_at: undefined },
  ])("rejects malformed owner DTO %j before table reads", async (change) => {
    const fixture = makeEditorClient({ state: {
      player_id: PLAYER, current_thought: null, featured_badge_award_id: null,
      thought_hidden_at: null, revision: 3, ...change,
    } });
    await expect(getMyPlayerShowcase()).resolves.toEqual({ status: "error", code: "unavailable" });
    expect(fixture.from).not.toHaveBeenCalled();
  });

  it("does not turn an award read failure into an empty or editable collection", async () => {
    makeEditorClient({ awardError: { message: "PRIVATE_READ_FAILURE" } });
    await expect(getMyPlayerShowcase()).resolves.toEqual({
      status: "error", code: "unavailable",
    });
  });

  it("omits noncanonical choices but preserves the stored selection for removal and moderation state", async () => {
    makeEditorClient({
      state: {
        player_id: PLAYER, current_thought: "GGs", featured_badge_award_id: AWARD,
        thought_hidden_at: DATE, revision: 3,
      },
      awards: [{ id: AWARD, badge_slug: "removed-catalogue-entry", unlocked_at: DATE }],
    });
    await expect(getMyPlayerShowcase()).resolves.toMatchObject({
      status: "success",
      state: { awards: [], featuredBadgeAwardId: AWARD, thoughtHidden: true },
    });
  });
});
