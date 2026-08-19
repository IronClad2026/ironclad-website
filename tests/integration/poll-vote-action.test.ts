import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));

import { castPollBallot } from "@/app/polls/actions";

const POLL_ID = "11111111-1111-4111-8111-111111111111";
const OPTION_A_ID = "22222222-2222-4222-8222-222222222222";
const OPTION_B_ID = "33333333-3333-4333-8333-333333333333";

describe("castPollBallot", () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ userId: "user_feature_c_player" });
    createAuthenticatedSupabaseClientMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("requires Clerk authentication before creating an authenticated client", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expect(
      castPollBallot({
        pollId: POLL_ID,
        expectedRevision: 0,
        selectedOptionIds: [OPTION_A_ID],
      })
    ).resolves.toEqual({
      ok: false,
      code: "auth_required",
      error: "Sign in before voting in this Poll.",
    });
    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      pollId: "not-a-uuid",
      expectedRevision: 0,
      selectedOptionIds: [OPTION_A_ID],
    },
    {
      pollId: POLL_ID,
      expectedRevision: -1,
      selectedOptionIds: [OPTION_A_ID],
    },
    {
      pollId: POLL_ID,
      expectedRevision: 0,
      selectedOptionIds: [],
    },
    {
      pollId: POLL_ID,
      expectedRevision: 0,
      selectedOptionIds: Array.from({ length: 6 }, (_, index) =>
        `${index + 2}1111111-1111-4111-8111-111111111111`
      ),
    },
    {
      pollId: POLL_ID,
      expectedRevision: 0,
      selectedOptionIds: [OPTION_A_ID, OPTION_A_ID],
    },
    {
      pollId: POLL_ID,
      expectedRevision: 0,
      selectedOptionIds: [OPTION_A_ID],
      playerId: "44444444-4444-4444-8444-444444444444",
    },
  ])("rejects an invalid or identity-bearing request before Supabase", async (input) => {
    await expect(
      castPollBallot(input as Parameters<typeof castPollBallot>[0])
    ).resolves.toEqual({
      ok: false,
      code: "invalid_request",
      error: "The Poll ballot request is invalid.",
    });
    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("sends only the poll, revision, and distinct selected option IDs", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        poll_id: POLL_ID,
        ballot_revision: 4,
        selected_option_ids: [OPTION_A_ID, OPTION_B_ID],
        first_voted_at: "2026-08-18T01:00:00.000Z",
        ballot_updated_at: "2026-08-18T01:02:00.000Z",
        idempotent: false,
      },
      error: null,
    }));
    createAuthenticatedSupabaseClientMock.mockResolvedValue({ rpc });

    await expect(
      castPollBallot({
        pollId: POLL_ID,
        expectedRevision: 3,
        selectedOptionIds: [OPTION_A_ID, OPTION_B_ID],
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        pollId: POLL_ID,
        ballotRevision: 4,
        selectedOptionIds: [OPTION_A_ID, OPTION_B_ID],
        firstVotedAt: "2026-08-18T01:00:00.000Z",
        ballotUpdatedAt: "2026-08-18T01:02:00.000Z",
        idempotent: false,
      },
    });
    expect(rpc).toHaveBeenCalledWith("cast_poll_ballot", {
      p_poll_id: POLL_ID,
      p_expected_revision: 3,
      p_option_ids: [OPTION_A_ID, OPTION_B_ID],
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(
      /clerk|player_id|eligible_voter|registration|result_total|timestamp/i
    );
  });

  it("fails closed when the RPC returns malformed or private output", async () => {
    createAuthenticatedSupabaseClientMock.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: {
          poll_id: POLL_ID,
          ballot_revision: 1,
          selected_option_ids: [OPTION_A_ID],
          first_voted_at: "2026-08-18T01:00:00.000Z",
          ballot_updated_at: "2026-08-18T01:00:00.000Z",
          idempotent: false,
          player_id: "private-player-id",
        },
        error: null,
      })),
    });

    await expect(
      castPollBallot({
        pollId: POLL_ID,
        expectedRevision: 0,
        selectedOptionIds: [OPTION_A_ID],
      })
    ).resolves.toEqual({
      ok: false,
      code: "save_failed",
      error: "Your ballot could not be saved. Refresh the Poll and try again.",
    });
  });

  it("returns a generic conflict-safe error without leaking database detail", async () => {
    createAuthenticatedSupabaseClientMock.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: "private eligibility row and stale revision detail" },
      })),
    });

    const result = await castPollBallot({
      pollId: POLL_ID,
      expectedRevision: 0,
      selectedOptionIds: [OPTION_A_ID],
    });

    expect(result).toEqual({
      ok: false,
      code: "save_failed",
      error: "Your ballot could not be saved. Refresh the Poll and try again.",
    });
    expect(JSON.stringify(result)).not.toMatch(/eligibility|stale revision/i);
  });
});
