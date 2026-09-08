import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePollRpc, POLL_TEST_TOURNAMENT_ID } from "@/tests/fixtures/poll-recovery";
import { parsePollListProjection } from "@/lib/polls";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), admin: vi.fn(), public: vi.fn(), private: vi.fn(), token: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createNoStoreSupabaseClient: mocks.public }));
vi.mock("@/lib/supabase-server", () => ({ createAuthenticatedSupabaseClient: mocks.private }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.admin }));

import { loadCommunityPollsForRequest, loadTournamentPollsForRequest } from "@/lib/player-polls";

const TID = POLL_TEST_TOURNAMENT_ID;
const TID2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secret = "SYNTHETIC_SECRET_user_private_ballot_token";
const member = { userId: "user_test_poll_owner", sessionId: "sess_test_poll_owner", getToken: mocks.token };
let publicRpc: ReturnType<typeof vi.fn>;
let privateRpc: ReturnType<typeof vi.fn>;
let lookup: ReturnType<typeof vi.fn>;
let eq: ReturnType<typeof vi.fn>;

function rpcResult(data: unknown, error: unknown = null) {
  return { abortSignal: vi.fn(async () => ({ data, error })) };
}
function playerResult(data: unknown, error: unknown = null) {
  lookup.mockResolvedValue({ data, error });
}

describe("server poll read boundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.auth.mockResolvedValue(member);
    mocks.token.mockResolvedValue(secret);
    lookup = vi.fn();
    eq = vi.fn().mockReturnThis();
    mocks.admin.mockReturnValue({ from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(), eq, abortSignal: vi.fn().mockReturnThis(), maybeSingle: lookup,
    })) });
    playerResult({ account_closed_at: null });
    publicRpc = vi.fn(() => rpcResult({ polls: [makePollRpc("public")] }));
    privateRpc = vi.fn(() => rpcResult({ polls: [makePollRpc("viewer")] }));
    mocks.public.mockReturnValue({ rpc: publicRpc });
    mocks.private.mockResolvedValue({ rpc: privateRpc });
  });

  it("loads both full lists, deriving the private identity inside the boundary", async () => {
    const result = await loadTournamentPollsForRequest([TID]);
    expect(result.error).toBeNull();
    expect(result.snapshotsByTournament[TID]).toMatchObject({
      accountState: "active", public: { status: "loaded" }, private: { status: "loaded" },
      viewerContext: { userId: member.userId, sessionId: member.sessionId },
    });
    expect(eq).toHaveBeenCalledWith("clerk_user_id", member.userId);
    expect(privateRpc).toHaveBeenCalledWith("get_my_tournament_polls", { p_tournament_id: TID });
    expect(publicRpc).toHaveBeenCalledWith("get_public_tournament_decisions", { p_tournament_id: TID });
    expect(result.pollsByTournament[TID][0].ballotRevision).toBe(0);
  });

  it("anonymous requests load actual public data without admin/player/token lookups", async () => {
    mocks.auth.mockResolvedValue({ userId: null, sessionId: null });
    const result = await loadTournamentPollsForRequest([TID]);
    expect(result.error).toBeNull();
    expect(result.snapshotsByTournament[TID].private.status).toBe("not_applicable");
    expect(result.pollsByTournament[TID]).toEqual(parsePollListProjection({ polls: [makePollRpc("public")] }, "public")!.polls);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.private).not.toHaveBeenCalled();
  });

  it.each([["missing", null], ["closed", { account_closed_at: "2026-09-01T00:00:00Z" }]] as const)(
    "positively verifies %s without recreating accounts or suppressing a failed RPC",
    async (state, row) => {
      playerResult(row);
      const result = await loadTournamentPollsForRequest([TID]);
      expect(result.error).toBeNull();
      expect(result.snapshotsByTournament[TID]).toMatchObject({ accountState: state, private: { status: "not_applicable" } });
      expect(result.pollsByTournament[TID]).toHaveLength(1);
      expect(mocks.private).not.toHaveBeenCalled();
    }
  );

  it("an existing incomplete player remains active; completion is not an eligibility gate", async () => {
    playerResult({ account_closed_at: null, profile_completed: false });
    const result = await loadTournamentPollsForRequest([TID]);
    expect(result.snapshotsByTournament[TID].accountState).toBe("active");
    expect(privateRpc).toHaveBeenCalledOnce();
  });

  it.each([
    { data: null, error: { code: "42501", message: secret } },
    { data: {}, error: null },
    { data: { account_closed_at: secret }, error: null },
  ])("does not equate failed/malformed identity evidence with missing ($data)", async ({ data, error }) => {
    playerResult(data, error);
    const result = await loadTournamentPollsForRequest([TID]);
    expect(result.error).not.toBeNull();
    expect(result.snapshotsByTournament[TID]).toMatchObject({ accountState: "unavailable", private: { status: "unavailable" } });
    expect(result.pollsByTournament[TID]).toHaveLength(1);
    expect(mocks.private).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
  });

  it.each(["public", "private"] as const)("preserves the other successful half after %s rejection", async (source) => {
    (source === "public" ? publicRpc : privateRpc).mockReturnValue(rpcResult(null, { code: "42501", message: secret, details: secret, hint: secret }));
    const result = await loadTournamentPollsForRequest([TID]);
    expect(result.error).not.toBeNull();
    expect(result.pollsByTournament[TID]).toHaveLength(1);
    expect(result.snapshotsByTournament[TID][source].status).toBe("unavailable");
    expect(console.error).toHaveBeenCalledWith("Poll projection load failed.", expect.objectContaining({ stage: "rpc", source, category: "rejection", code: "42501" }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
  });

  it("treats successful empty/ineligible lists as complete, including separate tournaments", async () => {
    publicRpc.mockImplementation((_rpc, args) => rpcResult({ polls: args.p_tournament_id === TID ? [makePollRpc("public")] : [] }));
    privateRpc.mockReturnValue(rpcResult({ polls: [] }));
    const result = await loadTournamentPollsForRequest([TID, TID2, TID]);
    expect(result.error).toBeNull();
    expect(result.pollsByTournament[TID]).toHaveLength(1);
    expect(result.pollsByTournament[TID2]).toEqual([]);
    expect(privateRpc).toHaveBeenCalledTimes(2);
  });

  it("isolates malformed/cross-tournament projection failure without exposing arbitrary fields", async () => {
    publicRpc.mockReturnValue(rpcResult({ polls: [makePollRpc("public", { tournament_id: TID2, player_id: secret })] }));
    const result = await loadTournamentPollsForRequest([TID]);
    expect(result.snapshotsByTournament[TID].public.status).toBe("unavailable");
    expect(result.pollsByTournament[TID]).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith("Poll projection load failed.", expect.objectContaining({ stage: "projection", source: "public", category: "validation" }));
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it.each(["authentication", "player_lookup", "token", "client", "rpc"] as const)("categorizes %s failure without arbitrary errors", async (stage) => {
    if (stage === "authentication") mocks.auth.mockRejectedValue(new Error(secret));
    if (stage === "player_lookup") lookup.mockRejectedValue(new Error(secret));
    if (stage === "token") mocks.token.mockRejectedValue(new Error(secret));
    if (stage === "client") mocks.private.mockRejectedValue(new Error(secret));
    if (stage === "rpc") privateRpc.mockImplementation(() => { throw new Error(secret); });
    const result = await loadTournamentPollsForRequest([TID]);
    expect(result.error).not.toBeNull();
    expect(result.pollsByTournament[TID]).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith("Poll projection load failed.", expect.objectContaining({ stage }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
  });

  it("null token is unavailable, not anonymous or a legitimate empty success", async () => {
    mocks.token.mockResolvedValue(null);
    const result = await loadTournamentPollsForRequest([TID]);
    expect(result.snapshotsByTournament[TID].accountState).toBe("unavailable");
    expect(mocks.private).not.toHaveBeenCalled();
  });

  it("a hung token acquisition times out without blocking the independent public request", async () => {
    vi.useFakeTimers();
    try {
      mocks.token.mockImplementation(() => new Promise(() => undefined));
      const pending = loadTournamentPollsForRequest([TID]);
      await vi.advanceTimersByTimeAsync(0);
      expect(publicRpc).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(4_000);
      const result = await pending;
      expect(result.error).not.toBeNull();
      expect(result.pollsByTournament[TID]).toHaveLength(1);
      expect(result.snapshotsByTournament[TID].accountState).toBe("unavailable");
    } finally { vi.useRealTimers(); }
  });

  it("identifies the SDK's status-zero transport result without inspecting its private text", async () => {
    privateRpc.mockReturnValue({ abortSignal: vi.fn(async () => ({ data: null, error: { code: "", message: secret, details: secret }, status: 0 })) });
    await loadTournamentPollsForRequest([TID]);
    expect(console.error).toHaveBeenCalledWith("Poll projection load failed.", expect.objectContaining({ stage: "rpc", source: "private", category: "transport", code: "other" }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
  });

  it("community uses the same verified state and actual full member-list RPC", async () => {
    privateRpc.mockReturnValue(rpcResult({ polls: [makePollRpc("viewer", { purpose: "community_feedback", audience_kind: "active_players", tournament_id: null, authority: "advisory" })] }));
    const result = await loadCommunityPollsForRequest();
    expect(result.error).toBeNull();
    expect(result.polls).toHaveLength(1);
    expect(result.snapshot.public.status).toBe("not_applicable");
    expect(privateRpc).toHaveBeenCalledWith("get_my_community_polls", undefined);
    expect(mocks.public).not.toHaveBeenCalled();
  });
});
