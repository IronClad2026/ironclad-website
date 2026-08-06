import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  anonymousIdentity,
  playerIdentity,
} from "@/tests/fixtures/auth";
import {
  createMatchResultFormData,
  createReplayFile,
  TEN_MEBIBYTES,
} from "@/tests/fixtures/replays";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const createInAppNotificationMock = vi.hoisted(() => vi.fn());
const createInAppNotificationsMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

vi.mock("@/lib/notifications", () => ({
  createInAppNotification: createInAppNotificationMock,
  createInAppNotifications: createInAppNotificationsMock,
}));

vi.mock("@/lib/notification-events", () => ({
  notifyAdminsOfMatchDispute: vi.fn(),
  notifyNoShowReporterOfResponse: vi.fn(),
  notifyPlayersOfLegacyMatchResultReview: vi.fn(),
  notifyPlayersOfReportGroupReview: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { submitMatchResult } from "@/app/tournaments/match-actions";

const idleState = {
  status: "idle" as const,
  message: "",
};

function createQuery(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(),
  };
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function createMatchClient({
  listError = null,
}: {
  listError?: { code: string; message: string } | null;
} = {}) {
  const match = {
    id: "match-1",
    generated_bracket_id: "generated-bracket-1",
    match_number: 1,
    series_best_of: 3,
    player_one_registration_id: "registration-player-one",
    player_two_registration_id: "registration-player-two",
    player_one: { player_name: "Player One" },
    player_two: { player_name: "Player Two" },
    bracket_rounds: { name: "Final" },
    generated_brackets: {
      tournament_brackets: {
        tournament_id: "tournament-1",
        launched_at: "2026-08-06T03:00:00.000Z",
        tournaments: {
          id: "tournament-1",
          title: "Test Tournament",
        },
      },
    },
  };
  const matchQuery = createQuery({ data: match, error: null });
  const registrationQuery = createQuery({
    data: { id: "registration-player-one" },
    error: null,
  });
  const upload = vi.fn(async (path: string) => ({
    data: { path },
    error: null,
  }));
  const list = vi.fn(
    async (_folder: string, options: { search: string }) => ({
      data: listError ? [] : [{ name: options.search }],
      error: listError,
    })
  );
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const createSignedUrl = vi.fn(() => {
    throw new Error("Signed proof URLs must never be created.");
  });
  const storageBucket = { createSignedUrl, list, remove, upload };
  const from = vi.fn((table: string) => {
    if (table === "tournament_matches") {
      return matchQuery;
    }

    if (table === "registrations") {
      return registrationQuery;
    }

    throw new Error(`Unexpected mocked table: ${table}`);
  });
  const rpc = vi.fn(async () => ({
    data: {
      report_group_id: "report-group-1",
      submission_number: 1,
    },
    error: null,
  }));

  return {
    client: {
      from,
      rpc,
      storage: {
        from: vi.fn(() => storageBucket),
      },
    },
    from,
    list,
    remove,
    rpc,
    upload,
  };
}

describe("replay validation through submitMatchResult", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    createInAppNotificationMock.mockReset();
    createInAppNotificationsMock.mockReset();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("requires authentication", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    await expect(
      submitMatchResult(idleState, createMatchResultFormData())
    ).resolves.toEqual({
      status: "error",
      message: "Sign in before submitting a match result.",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("requires at least one replay", async () => {
    authMock.mockResolvedValue(playerIdentity);

    await expect(
      submitMatchResult(idleState, createMatchResultFormData())
    ).resolves.toMatchObject({
      status: "error",
      message: "Upload the match replay files before submitting.",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      createReplayFile({ name: "proof.txt" }),
      "Replay proof must use a .rec file.",
    ],
    [
      createReplayFile({ size: TEN_MEBIBYTES + 1 }),
      "Replay files must be 10 MB or smaller.",
    ],
  ])("rejects an invalid replay before service access", async (replay, message) => {
    authMock.mockResolvedValue(playerIdentity);

    await expect(
      submitMatchResult(
        idleState,
        createMatchResultFormData({ replays: [replay] })
      )
    ).resolves.toMatchObject({ status: "error", message });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("requires one replay per completed game", async () => {
    const matchClient = createMatchClient();
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(matchClient.client);

    await expect(
      submitMatchResult(
        idleState,
        createMatchResultFormData({
          replays: [createReplayFile({ name: "game-one.REC" })],
        })
      )
    ).resolves.toMatchObject({
      status: "error",
      message: "This score requires exactly 2 replay files.",
    });
    expect(matchClient.upload).not.toHaveBeenCalled();
  });

  it("rejects duplicate replay contents before upload", async () => {
    const matchClient = createMatchClient();
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(matchClient.client);

    await expect(
      submitMatchResult(
        idleState,
        createMatchResultFormData({
          replays: [
            createReplayFile({ contents: "duplicate", name: "game-one.rec" }),
            createReplayFile({ contents: "duplicate", name: "game-two.rec" }),
          ],
        })
      )
    ).resolves.toMatchObject({
      status: "error",
      message:
        "Each game requires a unique replay file. Remove duplicate replay uploads before submitting.",
    });
    expect(matchClient.upload).not.toHaveBeenCalled();
  });

  it("accepts case-insensitive .rec files and reaches the mocked RPC boundary", async () => {
    const matchClient = createMatchClient();
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(matchClient.client);
    createInAppNotificationMock.mockResolvedValue(true);

    const result = await submitMatchResult(
      idleState,
      createMatchResultFormData({
        replays: [
          createReplayFile({
            contents: "game-one",
            name: "user_test_player-original-one.REC",
          }),
          createReplayFile({
            contents: "game-two",
            name: "user_test_player-original-two.rec",
          }),
        ],
      })
    );

    expect(result).toMatchObject({
      status: "success",
    });

    const uploadedPaths = matchClient.upload.mock.calls.map(
      ([path]) => path as string
    );
    expect(uploadedPaths).toHaveLength(2);
    expect(uploadedPaths[0]).toMatch(
      /^match-1\/[0-9a-f-]{36}\/game-1-[0-9a-f-]{36}\.rec$/
    );
    expect(uploadedPaths[1]).toMatch(
      /^match-1\/[0-9a-f-]{36}\/game-2-[0-9a-f-]{36}\.rec$/
    );
    expect(uploadedPaths[0].split("/")[1]).toBe(
      uploadedPaths[1].split("/")[1]
    );
    expect(uploadedPaths.join(" ")).not.toContain(playerIdentity.userId);
    expect(uploadedPaths.join(" ")).not.toContain("original");

    expect(matchClient.upload).toHaveBeenCalledTimes(2);
    expect(matchClient.list).toHaveBeenCalledTimes(2);
    expect(matchClient.rpc).toHaveBeenCalledWith(
      "submit_match_series_result_report",
      expect.objectContaining({
        p_replay_content_hashes: [
          expect.stringMatching(/^[0-9a-f]{64}$/),
          expect.stringMatching(/^[0-9a-f]{64}$/),
        ],
        p_replay_storage_paths: uploadedPaths,
      })
    );
  });

  it("does not expose an identity-bearing proof path when verification fails", async () => {
    const secretPath =
      "match-1/user_secret_clerk/game-1-private-object.rec";
    const matchClient = createMatchClient({
      listError: {
        code: "storage_failure",
        message: `Object missing at ${secretPath}`,
      },
    });
    const consoleError = vi.mocked(console.error);
    authMock.mockResolvedValue(playerIdentity);
    createSupabaseAdminClientMock.mockReturnValue(matchClient.client);

    const result = await submitMatchResult(
      idleState,
      createMatchResultFormData({
        replays: [
          createReplayFile({ contents: "game-one", name: "game-one.rec" }),
          createReplayFile({ contents: "game-two", name: "game-two.rec" }),
        ],
      })
    );

    const visibleOutput = JSON.stringify({
      result,
      logs: consoleError.mock.calls,
    });
    expect(result).toEqual({
      status: "error",
      message: "The match result could not be submitted. Please try again.",
    });
    expect(matchClient.rpc).not.toHaveBeenCalled();
    expect(matchClient.remove).toHaveBeenCalledOnce();
    expect(visibleOutput).not.toContain(secretPath);
    expect(visibleOutput).not.toContain("user_secret_clerk");
  });
});
