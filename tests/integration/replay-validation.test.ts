import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { anonymousIdentity, playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const createInAppNotificationMock = vi.hoisted(() => vi.fn());
const createInAppNotificationsMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
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
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import {
  cleanupPreparedReplayUploads,
  finalizeMatchResult,
  prepareMatchReplayUploads,
} from "@/app/tournaments/match-actions";

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_MATCH_ID = "22222222-2222-4222-8222-222222222222";
const TOURNAMENT_ID = "33333333-3333-4333-8333-333333333333";
const PLAYER_ONE_REGISTRATION_ID =
  "44444444-4444-4444-8444-444444444444";
const PLAYER_TWO_REGISTRATION_ID =
  "55555555-5555-4555-8555-555555555555";
const MAX_REPLAY_BYTES = 10 * 1024 * 1024;

type MockError = { code?: string; message: string };
type MockOptions = {
  activeReport?: boolean;
  legacyReport?: boolean;
  launched?: boolean;
  matchStatus?: string;
  ownedRegistrationId?: string | null;
  referenceError?: MockError | null;
  referencedPaths?: string[];
  rpcError?: MockError | null;
  seriesBestOf?: number;
  tournamentStatus?: string;
};

function validPreparationInput(overrides: Record<string, unknown> = {}) {
  return {
    matchId: MATCH_ID,
    playerOneScore: 2,
    playerTwoScore: 0,
    winnerRegistrationId: PLAYER_ONE_REGISTRATION_ID,
    replayFiles: [
      { name: "first.REC", size: 128 },
      { name: "second.rec", size: 256 },
    ],
    ...overrides,
  };
}

function validFinalizationInput(paths: string[]) {
  return {
    matchId: MATCH_ID,
    playerOneScore: 2,
    playerTwoScore: 0,
    winnerRegistrationId: PLAYER_ONE_REGISTRATION_ID,
    notes: "gg",
    replayPaths: paths,
  };
}

function createReplayClient(options: MockOptions = {}) {
  const state = {
    activeReport: options.activeReport ?? false,
    legacyReport: options.legacyReport ?? false,
    launched: options.launched ?? true,
    matchStatus: options.matchStatus ?? "in_progress",
    ownedRegistrationId:
      options.ownedRegistrationId === undefined
        ? PLAYER_ONE_REGISTRATION_ID
        : options.ownedRegistrationId,
    referenceError: options.referenceError ?? null,
    referencedPaths: new Set(options.referencedPaths ?? []),
    rpcError: options.rpcError ?? null,
    seriesBestOf: options.seriesBestOf ?? 3,
    tournamentStatus: options.tournamentStatus ?? "in_progress",
  };
  const payloads = new Map<string, Uint8Array[]>();
  const removedPaths: string[][] = [];
  const queryCalls: Array<{
    table: string;
    selected: string;
    filters: Array<[string, string, unknown]>;
  }> = [];

  const from = vi.fn((table: string) => createQuery(table));
  const createSignedUploadUrl = vi.fn(async (path: string) => ({
    data: {
      path,
      token: `native-token-for-${path.split("/").at(-1)}`,
      signedUrl: `https://private.invalid/${path}?token=must-not-leak`,
    },
    error: null,
  }));
  const download = vi.fn((path: string) => ({
    asStream: async () => {
      const chunks = payloads.get(path);
      return chunks
        ? { data: streamFromChunks(chunks), error: null }
        : {
            data: null,
            error: { code: "404", message: "private object missing" },
          };
    },
  }));
  const remove = vi.fn(async (paths: string[]) => {
    removedPaths.push([...paths]);
    for (const path of paths) payloads.delete(path);
    return { data: paths.map((name) => ({ name })), error: null };
  });
  const storageBucket = { createSignedUploadUrl, download, remove };
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    if (state.rpcError) return { data: null, error: state.rpcError };

    const replayPaths = args.p_replay_storage_paths as string[];
    replayPaths.forEach((path) => state.referencedPaths.add(path));
    return {
      data: {
        report_group_id: "66666666-6666-4666-8666-666666666666",
        submission_number: 3,
        confirmation_deadline_at: "2026-08-13T10:00:00.000Z",
      },
      error: null,
    };
  });
  const client = {
    from,
    rpc,
    storage: { from: vi.fn(() => storageBucket) },
  };

  function createQuery(table: string) {
    let selected = "";
    const filters: Array<[string, string, unknown]> = [];
    const query = {
      select(value: string) {
        selected = value;
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push(["eq", column, value]);
        return query;
      },
      in(column: string, value: unknown) {
        filters.push(["in", column, value]);
        return query;
      },
      is(column: string, value: unknown) {
        filters.push(["is", column, value]);
        return query;
      },
      limit(value: number) {
        filters.push(["limit", "", value]);
        return query;
      },
      async maybeSingle() {
        queryCalls.push({ table, selected, filters: [...filters] });
        if (table === "tournament_matches") {
          return { data: matchRow(state), error: null };
        }
        if (table === "registrations") {
          return {
            data: state.ownedRegistrationId
              ? { id: state.ownedRegistrationId }
              : null,
            error: null,
          };
        }
        if (table === "match_result_report_groups") {
          return {
            data: state.activeReport ? { id: "active-report" } : null,
            error: null,
          };
        }
        if (table === "match_result_submissions") {
          return {
            data: state.legacyReport ? { id: "legacy-report" } : null,
            error: null,
          };
        }
        throw new Error(`Unexpected maybeSingle table: ${table}`);
      },
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ) {
        queryCalls.push({ table, selected, filters: [...filters] });
        const result = resolveMany(table, selected, filters);
        return Promise.resolve(result).then(onfulfilled, onrejected);
      },
    };
    return query;
  }

  function resolveMany(
    table: string,
    selected: string,
    filters: Array<[string, string, unknown]>
  ) {
    if (
      (table === "match_result_submissions" ||
        table === "match_result_report_groups") &&
      selected === "replay_storage_path"
    ) {
      if (state.referenceError) {
        return { data: null, error: state.referenceError };
      }
      const requested =
        (filters.find(
          ([method, column]) =>
            method === "in" && column === "replay_storage_path"
        )?.[2] as string[] | undefined) ?? [];
      return {
        data: requested
          .filter((path) => state.referencedPaths.has(path))
          .map((replay_storage_path) => ({ replay_storage_path })),
        error: null,
      };
    }
    throw new Error(`Unexpected query resolution: ${table}.${selected}`);
  }

  return {
    client,
    createSignedUploadUrl,
    download,
    payloads,
    queryCalls,
    remove,
    removedPaths,
    rpc,
    state,
  };
}

function matchRow(state: {
  launched: boolean;
  matchStatus: string;
  seriesBestOf: number;
  tournamentStatus: string;
}) {
  return {
    id: MATCH_ID,
    match_number: 7,
    series_best_of: state.seriesBestOf,
    status: state.matchStatus,
    official_result_submission_id: null,
    player_one_registration_id: PLAYER_ONE_REGISTRATION_ID,
    player_two_registration_id: PLAYER_TWO_REGISTRATION_ID,
    player_one: { player_name: "Player One" },
    player_two: { player_name: "Player Two" },
    bracket_rounds: { name: "Final" },
    generated_brackets: {
      tournament_brackets: {
        tournament_id: TOURNAMENT_ID,
        launched_at: state.launched ? "2026-08-13T00:00:00.000Z" : null,
        tournaments: {
          id: TOURNAMENT_ID,
          title: "Direct Upload Cup",
          status: state.tournamentStatus,
        },
      },
    },
  };
}

function streamFromChunks(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function recursivelyContainsTransportBody(value: unknown): boolean {
  if (value instanceof File || value instanceof FormData) return true;
  if (Array.isArray(value)) return value.some(recursivelyContainsTransportBody);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(recursivelyContainsTransportBody);
  }
  return false;
}

describe("replay direct-upload actions and trusted finalization", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    createInAppNotificationMock.mockReset();
    createInAppNotificationsMock.mockReset();
    revalidatePathMock.mockReset();
    authMock.mockResolvedValue(playerIdentity);
    createInAppNotificationMock.mockResolvedValue(true);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("requires authentication independently for prepare, finalize, and cleanup", async () => {
    authMock.mockResolvedValue(anonymousIdentity);
    const path = `${MATCH_ID}/77777777-7777-4777-8777-777777777777/game-1-88888888-8888-4888-8888-888888888888.rec`;

    await expect(
      prepareMatchReplayUploads(validPreparationInput())
    ).resolves.toMatchObject({ status: "error", message: expect.stringContaining("Sign in") });
    await expect(
      finalizeMatchResult(validFinalizationInput([path, path.replace("game-1", "game-2")]))
    ).resolves.toMatchObject({ status: "error", message: expect.stringContaining("Sign in") });
    await expect(
      cleanupPreparedReplayUploads({ matchId: MATCH_ID, replayPaths: [path] })
    ).resolves.toMatchObject({ status: "error", message: expect.stringContaining("Sign in") });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ ownedRegistrationId: null }, "only submit results"],
    [{ launched: false }, "no longer available"],
    [{ tournamentStatus: "cancelled" }, "closed"],
    [{ tournamentStatus: "voided" }, "closed"],
  ] satisfies Array<[MockOptions, string]>) (
    "refuses unauthorized, unlaunched, and terminal preparation: %o",
    async (options, message) => {
      const replayClient = createReplayClient(options);
      createSupabaseAdminClientMock.mockReturnValue(replayClient.client);

      await expect(
        prepareMatchReplayUploads(validPreparationInput())
      ).resolves.toMatchObject({ status: "error", message: expect.stringContaining(message) });
      expect(replayClient.createSignedUploadUrl).not.toHaveBeenCalled();
    }
  );

  it.each([
    [
      { replayFiles: [{ name: "proof.txt", size: 10 }] },
      ".rec",
    ],
    [
      { replayFiles: [{ name: "proof.rec", size: 0 }] },
      "cannot be empty",
    ],
    [
      { replayFiles: [{ name: "proof.rec", size: MAX_REPLAY_BYTES + 1 }] },
      "10 MiB",
    ],
    [
      { replayFiles: [{ name: "proof.rec", size: 10 }] },
      "exactly 2 replay files",
    ],
    [{ playerOneScore: 1, playerTwoScore: 1 }, "non-tied"],
    [{ winnerRegistrationId: OTHER_MATCH_ID }, "participants"],
  ])("rejects invalid preparation metadata %#", async (override, message) => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);

    await expect(
      prepareMatchReplayUploads(validPreparationInput(override))
    ).resolves.toMatchObject({ status: "error", message: expect.stringContaining(message) });
    expect(replayClient.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("accepts exactly 10 MiB metadata and returns only opaque path capabilities", async () => {
    const replayClient = createReplayClient({ seriesBestOf: 1 });
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const input = validPreparationInput({
      playerOneScore: 1,
      replayFiles: [
        {
          name: `original-${playerIdentity.userId}-steam-private.REC`,
          size: MAX_REPLAY_BYTES,
        },
      ],
    });

    const result = await prepareMatchReplayUploads(input);
    expect(result).toMatchObject({ status: "success", bucket: "match-proofs" });
    if (result.status !== "success") throw new Error("Preparation failed");

    expect(result.uploads).toHaveLength(1);
    expect(result.uploads[0]).toEqual({
      gameNumber: 1,
      path: expect.stringMatching(
        new RegExp(`^${MATCH_ID}/[0-9a-f-]{36}/game-1-[0-9a-f-]{36}\\.rec$`)
      ),
      token: expect.any(String),
    });
    const visible = JSON.stringify(result);
    expect(visible).not.toContain("signedUrl");
    expect(visible).not.toContain(playerIdentity.userId);
    expect(visible).not.toContain("original");
    expect(visible).not.toContain("steam-private");
    expect(replayClient.createSignedUploadUrl).toHaveBeenCalledWith(
      result.uploads[0].path,
      { upsert: false }
    );
    expect(recursivelyContainsTransportBody(input)).toBe(false);
  });

  it("rejects a replay File body at the preparation Server Action boundary", async () => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const input = validPreparationInput({
      replayFiles: [
        new File(["game-one"], "game-one.rec"),
        new File(["game-two"], "game-two.rec"),
      ],
    });

    const result = await prepareMatchReplayUploads(input);

    expect(result).toMatchObject({
      status: "error",
      message: expect.stringContaining("directly to private Storage"),
    });
    expect(replayClient.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("uses one attempt root, contiguous games, and distinct server paths", async () => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const result = await prepareMatchReplayUploads(validPreparationInput());
    if (result.status !== "success") throw new Error("Preparation failed");

    expect(result.uploads.map((upload) => upload.gameNumber)).toEqual([1, 2]);
    expect(new Set(result.uploads.map((upload) => upload.path)).size).toBe(2);
    expect(
      new Set(result.uploads.map((upload) => upload.path.split("/")[1])).size
    ).toBe(1);
  });

  it("streams stored bytes, derives trusted SHA-256, and reuses the existing RPC", async () => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    const firstBytes = new TextEncoder().encode("stored-game-one");
    const secondBytes = new TextEncoder().encode("stored-game-two");
    replayClient.payloads.set(prepared.uploads[0].path, [firstBytes]);
    replayClient.payloads.set(prepared.uploads[1].path, [secondBytes]);

    const input = validFinalizationInput(
      prepared.uploads.map((upload) => upload.path)
    );
    const result = await finalizeMatchResult(input);

    expect(result).toMatchObject({ status: "success" });
    expect(replayClient.download).toHaveBeenCalledTimes(2);
    expect(replayClient.rpc).toHaveBeenCalledWith(
      "submit_match_series_result_report",
      expect.objectContaining({
        p_match_id: MATCH_ID,
        p_replay_storage_paths: input.replayPaths,
        p_replay_content_hashes: [
          createHash("sha256").update(firstBytes).digest("hex"),
          createHash("sha256").update(secondBytes).digest("hex"),
        ],
      })
    );
    expect(recursivelyContainsTransportBody(input)).toBe(false);
    expect(replayClient.remove).not.toHaveBeenCalled();
  });

  it("rechecks ownership and exact replay count before downloading stored proof", async () => {
    const ownershipClient = createReplayClient({ ownedRegistrationId: null });
    createSupabaseAdminClientMock.mockReturnValue(ownershipClient.client);
    const attemptId = "77777777-7777-4777-8777-777777777777";
    const firstPath = `${MATCH_ID}/${attemptId}/game-1-88888888-8888-4888-8888-888888888888.rec`;
    const secondPath = `${MATCH_ID}/${attemptId}/game-2-99999999-9999-4999-8999-999999999999.rec`;

    const ownershipResult = await finalizeMatchResult(
      validFinalizationInput([firstPath, secondPath])
    );
    expect(ownershipResult).toMatchObject({
      status: "error",
      message: expect.stringContaining("only submit results"),
    });
    expect(ownershipClient.download).not.toHaveBeenCalled();
    expect(ownershipClient.remove).not.toHaveBeenCalled();

    const countClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(countClient.client);
    countClient.payloads.set(firstPath, [new TextEncoder().encode("proof")]);
    const countResult = await finalizeMatchResult(
      validFinalizationInput([firstPath])
    );
    expect(countResult).toMatchObject({
      status: "error",
      message: expect.stringContaining("exactly 2 replay files"),
    });
    expect(countClient.download).not.toHaveBeenCalled();
    expect(countClient.remove).toHaveBeenCalledWith([firstPath]);
  });

  it("accepts an exact 10 MiB stored replay and hashes it one object at a time", async () => {
    const replayClient = createReplayClient({ seriesBestOf: 1 });
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(
      validPreparationInput({
        playerOneScore: 1,
        replayFiles: [{ name: "boundary.rec", size: MAX_REPLAY_BYTES }],
      })
    );
    if (prepared.status !== "success") throw new Error("Preparation failed");
    const chunks = [
      new Uint8Array(5 * 1024 * 1024).fill(17),
      new Uint8Array(5 * 1024 * 1024).fill(23),
    ];
    replayClient.payloads.set(prepared.uploads[0].path, chunks);

    const result = await finalizeMatchResult({
      ...validFinalizationInput([prepared.uploads[0].path]),
      playerOneScore: 1,
    });

    expect(result.status).toBe("success");
    const trustedHash = createHash("sha256");
    chunks.forEach((chunk) => trustedHash.update(chunk));
    expect(replayClient.rpc).toHaveBeenCalledWith(
      "submit_match_series_result_report",
      expect.objectContaining({
        p_replay_content_hashes: [trustedHash.digest("hex")],
      })
    );
  });

  it.each([
    ["missing", undefined],
    ["empty", [new Uint8Array(0)]],
    [
      "oversized",
      [new Uint8Array(6 * 1024 * 1024), new Uint8Array(5 * 1024 * 1024)],
    ],
  ])("rejects a %s stored object and cleans the unreferenced attempt", async (_case, chunks) => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    if (chunks) replayClient.payloads.set(prepared.uploads[0].path, chunks);
    replayClient.payloads.set(
      prepared.uploads[1].path,
      [new TextEncoder().encode("valid")]
    );

    const result = await finalizeMatchResult(
      validFinalizationInput(prepared.uploads.map((upload) => upload.path))
    );

    expect(result.status).toBe("error");
    expect(replayClient.rpc).not.toHaveBeenCalled();
    expect(replayClient.remove).toHaveBeenCalledWith(
      prepared.uploads.map((upload) => upload.path)
    );
  });

  it("rejects duplicate payloads on distinct paths using trusted stored hashes", async () => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    const duplicate = new TextEncoder().encode("same-stored-payload");
    prepared.uploads.forEach((upload) =>
      replayClient.payloads.set(upload.path, [duplicate])
    );

    const result = await finalizeMatchResult(
      validFinalizationInput(prepared.uploads.map((upload) => upload.path))
    );

    expect(result).toMatchObject({
      status: "error",
      message: expect.stringContaining("unique replay"),
    });
    expect(replayClient.rpc).not.toHaveBeenCalled();
    expect(replayClient.remove).toHaveBeenCalledOnce();
  });

  it("rejects malformed, wrong-match, and mixed-attempt paths without unsafe deletion", async () => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    const [first, second] = prepared.uploads.map((upload) => upload.path);
    const cases = [
      [first.replace(MATCH_ID, OTHER_MATCH_ID), second],
      [first, second.replace(second.split("/")[1], "99999999-9999-4999-8999-999999999999")],
      [first, second.replace("game-2", "game-5")],
      [`${MATCH_ID}/../private.rec`, second],
    ];

    for (const replayPaths of cases) {
      const result = await finalizeMatchResult(
        validFinalizationInput(replayPaths)
      );
      expect(result.status).toBe("error");
    }
    expect(replayClient.download).not.toHaveBeenCalled();
    expect(replayClient.remove).not.toHaveBeenCalled();
  });

  it("cleans uploaded proof when a terminal transition or RPC failure wins before commit", async () => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    prepared.uploads.forEach((upload, index) =>
      replayClient.payloads.set(
        upload.path,
        [new TextEncoder().encode(`game-${index}`)]
      )
    );
    replayClient.state.tournamentStatus = "voided";

    const terminalResult = await finalizeMatchResult(
      validFinalizationInput(prepared.uploads.map((upload) => upload.path))
    );
    expect(terminalResult).toMatchObject({
      status: "error",
      message: expect.stringContaining("closed"),
    });
    expect(replayClient.remove).toHaveBeenCalledOnce();

    const rpcFailureClient = createReplayClient({
      rpcError: { code: "55000", message: "database refused report" },
    });
    createSupabaseAdminClientMock.mockReturnValue(rpcFailureClient.client);
    const rpcPrepared = await prepareMatchReplayUploads(validPreparationInput());
    if (rpcPrepared.status !== "success") throw new Error("Preparation failed");
    rpcPrepared.uploads.forEach((upload, index) =>
      rpcFailureClient.payloads.set(
        upload.path,
        [new TextEncoder().encode(`rpc-game-${index}`)]
      )
    );
    await finalizeMatchResult(
      validFinalizationInput(rpcPrepared.uploads.map((upload) => upload.path))
    );
    expect(rpcFailureClient.remove).toHaveBeenCalledOnce();
  });

  it("cleanup refuses another match, fails closed on reference errors, and preserves referenced proof", async () => {
    const replayClient = createReplayClient({ seriesBestOf: 1 });
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(
      validPreparationInput({
        playerOneScore: 1,
        replayFiles: [{ name: "one.rec", size: 10 }],
      })
    );
    if (prepared.status !== "success") throw new Error("Preparation failed");
    const path = prepared.uploads[0].path;
    replayClient.payloads.set(path, [new TextEncoder().encode("proof")]);

    await cleanupPreparedReplayUploads({
      matchId: MATCH_ID,
      replayPaths: [path.replace(MATCH_ID, OTHER_MATCH_ID)],
    });
    expect(replayClient.remove).not.toHaveBeenCalled();

    replayClient.state.referencedPaths.add(path);
    const preserved = await cleanupPreparedReplayUploads({
      matchId: MATCH_ID,
      replayPaths: [path],
    });
    expect(preserved).toEqual({ status: "success", removedCount: 0 });
    expect(replayClient.remove).not.toHaveBeenCalled();

    replayClient.state.referencedPaths.clear();
    replayClient.state.referenceError = {
      code: "DB_FAIL",
      message: "private database detail",
    };
    const failedClosed = await cleanupPreparedReplayUploads({
      matchId: MATCH_ID,
      replayPaths: [path],
    });
    expect(failedClosed.status).toBe("error");
    expect(replayClient.remove).not.toHaveBeenCalled();
  });

  it.each(["false", "throw", "revalidate"])(
    "preserves committed proof after the %s post-commit failure",
    async (failure) => {
      const replayClient = createReplayClient();
      createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
      if (failure === "false") createInAppNotificationMock.mockResolvedValue(false);
      if (failure === "throw") {
        createInAppNotificationMock.mockRejectedValue(
          new Error("private notification failure")
        );
      }
      if (failure === "revalidate") {
        revalidatePathMock.mockImplementation(() => {
          throw new Error("private cache failure");
        });
      }
      const prepared = await prepareMatchReplayUploads(validPreparationInput());
      if (prepared.status !== "success") throw new Error("Preparation failed");
      prepared.uploads.forEach((upload, index) =>
        replayClient.payloads.set(
          upload.path,
          [new TextEncoder().encode(`unique-${index}`)]
        )
      );

      const result = await finalizeMatchResult(
        validFinalizationInput(prepared.uploads.map((upload) => upload.path))
      );

      expect(result).toMatchObject({ status: "success" });
      expect(result.message).toContain("result was saved");
      expect(replayClient.remove).not.toHaveBeenCalled();
      expect(
        prepared.uploads.every((upload) => replayClient.payloads.has(upload.path))
      ).toBe(true);
    }
  );

  it("a response-loss retry cannot delete already-referenced replay proof", async () => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    prepared.uploads.forEach((upload) => {
      replayClient.state.referencedPaths.add(upload.path);
      replayClient.payloads.set(upload.path, [new Uint8Array([1, 2, 3])]);
    });
    replayClient.state.activeReport = true;

    const result = await finalizeMatchResult(
      validFinalizationInput(prepared.uploads.map((upload) => upload.path))
    );

    expect(result).toMatchObject({
      status: "error",
      message: expect.stringContaining("awaiting confirmation"),
    });
    expect(replayClient.remove).not.toHaveBeenCalled();
    expect(replayClient.payloads.size).toBe(2);
  });
});
