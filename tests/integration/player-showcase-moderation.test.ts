import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), admin: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { getShowcaseForModeration, moderatePlayerShowcase } from "@/lib/player-showcase/moderation";

const playerId = "930daaa0-e658-4476-9c47-36ded9651ba4";
beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: "user_admin", sessionClaims: { metadata: { role: "admin" } } });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { code: "saved", showcase: { revision: 3, current_thought: "hello", featured_badge_award_id: null } }, error: null });
});

describe("Showcase service moderation boundary", () => {
  it.each([null, { role: "admin" }, { metadata: { role: "player" } }])("denies untrusted role claims %j before constructing service client", async (sessionClaims) => {
    mocks.auth.mockResolvedValue({ userId: "user_player", sessionClaims });
    expect(await moderatePlayerShowcase({ playerId, revision: 2, hidden: true })).toMatchObject({ status: "error", code: "forbidden" });
    expect(await getShowcaseForModeration(playerId)).toMatchObject({ status: "error", code: "forbidden" });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("attributes moderator from session and only invokes the narrow RPC", async () => {
    expect(await moderatePlayerShowcase({ playerId, revision: 2, hidden: true, actor: "spoofed" })).toMatchObject({ status: "success", code: "moderationSaved" });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("moderate_player_showcase_thought", {
      p_player_id: playerId, p_hidden: true, p_actor_clerk_user_id: "user_admin", p_expected_revision: 2,
    });
    expect(mocks.revalidate.mock.calls.map(([path]) => path)).toEqual(["/dashboard/showcase", `/players/${playerId}`]);
  });
  it("validates scope, revision and mode before service access", async () => {
    for (const input of [
      { playerId: "invalid", revision: 2, hidden: true },
      { playerId, revision: -1, hidden: true }, { playerId, revision: 2, hidden: "false" },
    ]) expect((await moderatePlayerShowcase(input)).status).toBe("error");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not return a closed or missing player's personal Showcase", async () => {
    const query = createSupabaseQueryMock({ data: null });
    mocks.admin.mockReturnValue(query.client);
    expect(await getShowcaseForModeration(playerId)).toMatchObject({ status: "error", code: "profileRequired" });
    expect(query.from).toHaveBeenCalledExactlyOnceWith("players");
    expect(query.calls).toContainEqual({ method: "is", args: ["account_closed_at", null] });
    expect(query.calls).toContainEqual({ method: "eq", args: ["id", playerId] });
  });
  it("fails safely on RPC errors and stale revisions", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private diagnostics" } });
    expect(await moderatePlayerShowcase({ playerId, revision: 2, hidden: true })).toEqual({ status: "error", code: "saveFailed" });
    mocks.rpc.mockResolvedValueOnce({ data: { code: "conflict" }, error: null });
    expect(await moderatePlayerShowcase({ playerId, revision: 2, hidden: true })).toEqual({ status: "error", code: "conflict" });
  });
});
