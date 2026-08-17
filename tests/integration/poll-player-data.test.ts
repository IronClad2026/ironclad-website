import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PollViewerProjection } from "@/lib/polls";

const createNoStoreSupabaseClientMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const parsePollListProjectionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  createNoStoreSupabaseClient: createNoStoreSupabaseClientMock,
}));
vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));
vi.mock("@/lib/polls", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/polls")>();
  return {
    ...actual,
    parsePollListProjection: parsePollListProjectionMock,
  };
});

import { loadTournamentPollsForRequest } from "@/lib/player-polls";

const TOURNAMENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PUBLIC_DECISION = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "final_decision_published",
  question: "Published Tournament Decision",
} as PollViewerProjection;

describe("player Poll data loading", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    parsePollListProjectionMock.mockImplementation((value, scope) => {
      if (scope === "public" && value === "public-projection") {
        return { polls: [PUBLIC_DECISION] };
      }
      return null;
    });
    createNoStoreSupabaseClientMock.mockReturnValue({
      rpc: vi.fn(async () => ({ data: "public-projection", error: null })),
    });
    createAuthenticatedSupabaseClientMock.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: "No current player identity" },
      })),
    });
  });

  it("retains public final decisions when an authenticated private projection fails", async () => {
    const result = await loadTournamentPollsForRequest([TOURNAMENT_ID], true);

    expect(result).toEqual({
      pollsByTournament: { [TOURNAMENT_ID]: [PUBLIC_DECISION] },
      error: "Some Tournament Decisions could not be loaded.",
    });
    expect(createAuthenticatedSupabaseClientMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/player identity/i);
  });

  it("retains public final decisions when an authenticated private request throws", async () => {
    createAuthenticatedSupabaseClientMock.mockResolvedValue({
      rpc: vi.fn(async () => {
        throw new Error("private network detail");
      }),
    });

    const result = await loadTournamentPollsForRequest([TOURNAMENT_ID], true);

    expect(result.pollsByTournament[TOURNAMENT_ID]).toEqual([PUBLIC_DECISION]);
    expect(result.error).toBe("Some Tournament Decisions could not be loaded.");
    expect(JSON.stringify(result)).not.toMatch(/network detail/i);
  });
});
