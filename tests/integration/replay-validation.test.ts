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
type AttemptStatus =
  | "prepared"
  | "finalizing"
  | "cleaning"
  | "cleaned"
  | "recycling"
  | "committed";
type MockReplayAttempt = {
  id: string;
  matchId: string;
  ownerClerkUserId: string;
  ownerRegistrationId: string;
  winnerRegistrationId: string;
  playerOneScore: number;
  playerTwoScore: number;
  requiredReplayCount: number;
  declaredReplaySizes: number[];
  paths: string[];
  status: AttemptStatus;
  finalizationClaimId: string | null;
  cleanupClaimId: string | null;
  recycleClaimId: string | null;
  committedResult: Record<string, unknown> | null;
};
type MockOptions = {
  activeReport?: boolean;
  beforeRpcCommit?: () => Promise<void>;
  beforeStorageRemove?: (paths: string[]) => Promise<void>;
  claimReplayPathCount?: number;
  legacyReport?: boolean;
  launched?: boolean;
  matchStatus?: string;
  ownedRegistrationId?: string | null;
  preparationOutcomes?: Array<
    | "create"
    | "existing-blocked"
    | "cooldown-budget"
    | "cleanup-required"
    | "recycle-required"
  >;
  referenceError?: MockError | null;
  referencedPaths?: string[];
  rpcError?: MockError | null;
  rpcResponseLossAfterCommit?: boolean;
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

function validFinalizationInput(attemptId: string) {
  return {
    matchId: MATCH_ID,
    attemptId,
    playerOneScore: 2,
    playerTwoScore: 0,
    winnerRegistrationId: PLAYER_ONE_REGISTRATION_ID,
    notes: "gg",
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
  const attempts = new Map<string, MockReplayAttempt>();
  let preparationCallCount = 0;
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
    await options.beforeStorageRemove?.(paths);
    removedPaths.push([...paths]);
    for (const path of paths) payloads.delete(path);
    return { data: paths.map((name) => ({ name })), error: null };
  });
  const storageBucket = { createSignedUploadUrl, download, remove };
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "prepare_match_replay_upload_attempt") {
      const forcedOutcome =
        options.preparationOutcomes?.[preparationCallCount++] ?? null;
      if (forcedOutcome === "existing-blocked") {
        return rpcFailure(
          "This replay attempt is already being finalized or cleaned"
        );
      }
      if (forcedOutcome === "cooldown-budget") {
        return rpcFailure(
          "Replay upload capability cooldown or attempt budget is active"
        );
      }
      const ownerClerkUserId = String(args.p_submitted_by_clerk_user_id);
      const existing = [...attempts.values()].find(
        (attempt) =>
          attempt.matchId === args.p_match_id &&
          attempt.ownerRegistrationId === state.ownedRegistrationId &&
          ["prepared", "finalizing", "cleaning", "recycling"].includes(
            attempt.status
          )
      );
      if (existing && forcedOutcome !== "create") {
        return {
          data: null,
          error: {
            code: "55000",
            message:
              existing.status === "prepared"
                ? "A replay upload attempt is already active; retry in 60 seconds"
                : "This replay attempt is already being finalized or cleaned",
          },
        };
      }

      const attemptId = `77777777-7777-4777-8777-${String(
        attempts.size + 1
      ).padStart(12, "0")}`;
      const requiredReplayCount =
        Number(args.p_player_one_score) + Number(args.p_player_two_score);
      const paths = Array.from({ length: 5 }, (_, index) => {
        const objectId = `88888888-8888-4888-8888-${String(
          index + 1
        ).padStart(12, "0")}`;
        return `${args.p_match_id}/${attemptId}/game-${index + 1}-${objectId}.rec`;
      });
      const attempt: MockReplayAttempt = {
        id: attemptId,
        matchId: String(args.p_match_id),
        ownerClerkUserId,
        ownerRegistrationId: state.ownedRegistrationId ?? "",
        winnerRegistrationId: String(args.p_winner_registration_id),
        playerOneScore: Number(args.p_player_one_score),
        playerTwoScore: Number(args.p_player_two_score),
        requiredReplayCount,
        declaredReplaySizes: [...(args.p_declared_replay_sizes as number[])],
        paths,
        status: "prepared",
        finalizationClaimId: null,
        cleanupClaimId: null,
        recycleClaimId: null,
        committedResult: null,
      };
      attempts.set(attemptId, attempt);
      if (forcedOutcome === "cleanup-required") {
        const claimId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
        attempt.status = "cleaning";
        attempt.cleanupClaimId = claimId;
        return {
          data: {
            outcome: "cleanup_required",
            attempt_id: attemptId,
            cleanup_claim_id: claimId,
            replay_storage_paths: [...paths],
          },
          error: null,
        };
      }
      if (forcedOutcome === "recycle-required") {
        const claimId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
        attempt.status = "recycling";
        attempt.recycleClaimId = claimId;
        return {
          data: {
            outcome: "recycle_required",
            attempt_id: attemptId,
            recycle_claim_id: claimId,
            replay_storage_paths: [...paths],
          },
          error: null,
        };
      }
      return {
        data: {
          outcome: "prepared",
          attempt_id: attemptId,
          replay_storage_paths: paths.slice(0, requiredReplayCount),
          required_replay_count: requiredReplayCount,
          capability_issue_count: 1,
        },
        error: null,
      };
    }

    if (name === "claim_match_replay_attempt_finalization") {
      const attempt = attempts.get(String(args.p_attempt_id));
      const ownershipError = validateAttemptRpcScope(attempt, args);
      if (ownershipError) return { data: null, error: ownershipError };
      if (!attempt) throw new Error("Attempt scope unexpectedly passed");

      if (
        args.p_winner_registration_id !== attempt.winnerRegistrationId ||
        args.p_player_one_score !== attempt.playerOneScore ||
        args.p_player_two_score !== attempt.playerTwoScore
      ) {
        return rpcFailure("Final result does not match this replay attempt");
      }

      if (attempt.status === "committed") {
        return {
          data: {
            outcome: "committed",
            report: attempt.committedResult,
            winner_registration_id: attempt.winnerRegistrationId,
            player_one_score: attempt.playerOneScore,
            player_two_score: attempt.playerTwoScore,
            required_replay_count: attempt.requiredReplayCount,
          },
          error: null,
        };
      }
      if (attempt.status === "finalizing") {
        return rpcFailure("Replay finalization is already in progress");
      }
      if (attempt.status !== "prepared") {
        return rpcFailure("Replay attempt is not available for finalization");
      }
      if (
        !state.launched ||
        state.tournamentStatus === "cancelled" ||
        state.tournamentStatus === "voided"
      ) {
        return rpcFailure(
          "Terminal tournaments cannot accept competitive mutation"
        );
      }
      if (state.activeReport || state.legacyReport) {
        return rpcFailure("This match already has active result activity");
      }

      const claimId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      attempt.status = "finalizing";
      attempt.finalizationClaimId = claimId;
      return {
        data: {
          outcome: "claimed",
          claim_id: claimId,
          replay_storage_paths: attempt.paths.slice(
            0,
            options.claimReplayPathCount ?? attempt.requiredReplayCount
          ),
          winner_registration_id: attempt.winnerRegistrationId,
          player_one_score: attempt.playerOneScore,
          player_two_score: attempt.playerTwoScore,
          required_replay_count: attempt.requiredReplayCount,
        },
        error: null,
      };
    }

    if (name === "claim_match_replay_attempt_cleanup") {
      const attempt = attempts.get(String(args.p_attempt_id));
      const ownershipError = validateAttemptRpcScope(attempt, args);
      if (ownershipError) return { data: null, error: ownershipError };
      if (!attempt) throw new Error("Attempt scope unexpectedly passed");

      if (attempt.status === "committed") {
        return { data: { outcome: "preserved" }, error: null };
      }
      if (attempt.status === "cleaned") {
        return { data: { outcome: "cleaned" }, error: null };
      }
      const suppliedFinalizationClaim =
        typeof args.p_finalization_claim_id === "string"
          ? args.p_finalization_claim_id
          : null;
      if (
        attempt.status === "finalizing" &&
        suppliedFinalizationClaim !== attempt.finalizationClaimId
      ) {
        return rpcFailure("Replay finalization owns this attempt");
      }
      if (attempt.status === "cleaning") {
        return rpcFailure("Replay cleanup is already in progress");
      }
      if (![
        "prepared",
        "finalizing",
      ].includes(attempt.status)) {
        return rpcFailure("Replay attempt is not available for cleanup");
      }

      const cleanupClaimId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      attempt.status = "cleaning";
      attempt.finalizationClaimId = null;
      attempt.cleanupClaimId = cleanupClaimId;
      return {
        data: {
          outcome: "claimed",
          cleanup_claim_id: cleanupClaimId,
          replay_storage_paths: [...attempt.paths],
        },
        error: null,
      };
    }

    if (name === "complete_match_replay_attempt_cleanup") {
      const attempt = attempts.get(String(args.p_attempt_id));
      if (
        !attempt ||
        attempt.status !== "cleaning" ||
        attempt.cleanupClaimId !== args.p_cleanup_claim_id
      ) {
        return rpcFailure("Replay cleanup claim no longer owns this attempt");
      }
      attempt.status = "cleaned";
      attempt.cleanupClaimId = null;
      return { data: true, error: null };
    }

    if (name === "complete_match_replay_attempt_recycling") {
      const attempt = attempts.get(String(args.p_attempt_id));
      const ownershipError = validateAttemptRpcScope(attempt, args);
      if (ownershipError) return { data: null, error: ownershipError };
      if (
        !attempt ||
        attempt.status !== "recycling" ||
        attempt.recycleClaimId !== args.p_recycle_claim_id
      ) {
        return rpcFailure("Replay recycling claim no longer owns this attempt");
      }
      attempt.paths = attempt.paths.map(
        (_, index) =>
          `${attempt.matchId}/${attempt.id}/game-${index + 1}-99999999-9999-4999-8999-${String(
            index + 1
          ).padStart(12, "0")}.rec`
      );
      attempt.status = "prepared";
      attempt.recycleClaimId = null;
      return {
        data: {
          outcome: "prepared",
          attempt_id: attempt.id,
          replay_storage_paths: attempt.paths.slice(
            0,
            attempt.requiredReplayCount
          ),
          required_replay_count: attempt.requiredReplayCount,
          capability_issue_count: 2,
        },
        error: null,
      };
    }

    if (name === "commit_match_replay_attempt_result") {
      const attempt = attempts.get(String(args.p_attempt_id));
      const ownershipError = validateAttemptRpcScope(attempt, args);
      if (ownershipError) return { data: null, error: ownershipError };
      if (
        !attempt ||
        attempt.status !== "finalizing" ||
        attempt.finalizationClaimId !== args.p_finalization_claim_id
      ) {
        return rpcFailure(
          "Replay finalization claim no longer owns this attempt"
        );
      }

      await options.beforeRpcCommit?.();
      if (state.rpcError) return { data: null, error: state.rpcError };
      if (
        !Array.isArray(args.p_replay_content_hashes) ||
        args.p_replay_content_hashes.length !== attempt.requiredReplayCount
      ) {
        return rpcFailure("Replay hash count does not match this attempt");
      }

      const result = {
        report_group_id: "66666666-6666-4666-8666-666666666666",
        submission_number: 3,
        confirmation_deadline_at: "2026-08-13T10:00:00.000Z",
      };
      attempt.paths
        .slice(0, attempt.requiredReplayCount)
        .forEach((path) => state.referencedPaths.add(path));
      attempt.status = "committed";
      attempt.finalizationClaimId = null;
      attempt.committedResult = result;
      state.activeReport = true;
      if (options.rpcResponseLossAfterCommit) {
        return rpcFailure("The committed response was lost in transit");
      }
      return { data: result, error: null };
    }

    throw new Error(`Unexpected RPC: ${name}`);
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

  function validateAttemptRpcScope(
    attempt: MockReplayAttempt | undefined,
    args: Record<string, unknown>
  ): MockError | null {
    if (!attempt || attempt.matchId !== args.p_match_id) {
      return { code: "P0001", message: "Replay attempt not found" };
    }
    if (attempt.ownerClerkUserId !== args.p_submitted_by_clerk_user_id) {
      return {
        code: "P0001",
        message: "Player does not own this replay attempt",
      };
    }
    return null;
  }

  function rpcFailure(message: string) {
    return { data: null, error: { code: "P0001", message } };
  }

  return {
    client,
    attempts,
    createSignedUploadUrl,
    download,
    payloads,
    queryCalls,
    remove,
    removedPaths,
    rpc,
    rpcCallsFor: (name: string) =>
      rpc.mock.calls.filter(([rpcName]) => rpcName === name),
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
    const attemptId = "77777777-7777-4777-8777-777777777777";

    await expect(
      prepareMatchReplayUploads(validPreparationInput())
    ).resolves.toMatchObject({ status: "error", message: expect.stringContaining("Sign in") });
    await expect(
      finalizeMatchResult(validFinalizationInput(attemptId))
    ).resolves.toMatchObject({ status: "error", message: expect.stringContaining("Sign in") });
    await expect(
      cleanupPreparedReplayUploads({ matchId: MATCH_ID, attemptId })
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
    expect(result.uploads[0].path.split("/")[1]).toBe(result.attemptId);
  });

  it("bounds parallel and cooldown preparation to one active attempt", async () => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);

    const results = await Promise.all([
      prepareMatchReplayUploads(validPreparationInput()),
      prepareMatchReplayUploads(validPreparationInput()),
    ]);
    expect(results.filter((result) => result.status === "success")).toHaveLength(
      1
    );
    expect(results.filter((result) => result.status === "error")).toHaveLength(1);
    expect(replayClient.attempts.size).toBe(1);
    expect(replayClient.createSignedUploadUrl).toHaveBeenCalledTimes(2);

    const cooldownRetry = await prepareMatchReplayUploads(
      validPreparationInput()
    );
    expect(cooldownRetry.status).toBe("error");
    expect(replayClient.attempts.size).toBe(1);
    expect(replayClient.createSignedUploadUrl).toHaveBeenCalledTimes(2);
  });

  it("replaces an abandoned preparation only after claiming and cleaning it", async () => {
    const replayClient = createReplayClient({
      preparationOutcomes: ["cleanup-required", "create"],
    });
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);

    const result = await prepareMatchReplayUploads(validPreparationInput());

    expect(result.status).toBe("success");
    expect(
      replayClient.rpcCallsFor("prepare_match_replay_upload_attempt")
    ).toHaveLength(2);
    expect(
      replayClient.rpcCallsFor("complete_match_replay_attempt_cleanup")
    ).toHaveLength(1);
    expect(replayClient.remove).toHaveBeenCalledTimes(1);
    expect(replayClient.removedPaths[0]).toHaveLength(5);
    expect(replayClient.createSignedUploadUrl).toHaveBeenCalledTimes(2);
  });

  it("final-sweeps an expired namespace before signing fresh object paths", async () => {
    const replayClient = createReplayClient({
      preparationOutcomes: ["recycle-required"],
    });
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);

    const result = await prepareMatchReplayUploads(validPreparationInput());
    if (result.status !== "success") throw new Error("Preparation failed");

    expect(replayClient.remove).toHaveBeenCalledTimes(1);
    expect(replayClient.removedPaths[0]).toHaveLength(5);
    expect(
      replayClient.rpcCallsFor("complete_match_replay_attempt_recycling")
    ).toHaveLength(1);
    expect(result.uploads.every((upload) => upload.path.includes("99999999"))).toBe(
      true
    );
    expect(
      result.uploads.some((upload) =>
        replayClient.removedPaths[0].includes(upload.path)
      )
    ).toBe(false);
  });

  it("streams stored bytes, derives trusted SHA-256, and commits through the attempt wrapper", async () => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    const firstBytes = new TextEncoder().encode("stored-game-one");
    const secondBytes = new TextEncoder().encode("stored-game-two");
    replayClient.payloads.set(prepared.uploads[0].path, [firstBytes]);
    replayClient.payloads.set(prepared.uploads[1].path, [secondBytes]);

    const input = validFinalizationInput(prepared.attemptId);
    const result = await finalizeMatchResult(input);

    expect(result).toMatchObject({ status: "success" });
    expect(replayClient.download).toHaveBeenCalledTimes(2);
    expect(replayClient.rpc).toHaveBeenCalledWith(
      "commit_match_replay_attempt_result",
      expect.objectContaining({
        p_match_id: MATCH_ID,
        p_attempt_id: prepared.attemptId,
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
    const ownershipClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(ownershipClient.client);
    const ownedAttempt = await prepareMatchReplayUploads(validPreparationInput());
    if (ownedAttempt.status !== "success") throw new Error("Preparation failed");
    ownershipClient.state.ownedRegistrationId = null;

    const ownershipResult = await finalizeMatchResult(
      validFinalizationInput(ownedAttempt.attemptId)
    );
    expect(ownershipResult).toMatchObject({
      status: "error",
      message: expect.stringContaining("only submit results"),
    });
    expect(ownershipClient.download).not.toHaveBeenCalled();
    expect(ownershipClient.remove).not.toHaveBeenCalled();

    const countClient = createReplayClient({ claimReplayPathCount: 1 });
    createSupabaseAdminClientMock.mockReturnValue(countClient.client);
    const countAttempt = await prepareMatchReplayUploads(validPreparationInput());
    if (countAttempt.status !== "success") throw new Error("Preparation failed");
    countAttempt.uploads.forEach((upload) =>
      countClient.payloads.set(upload.path, [new TextEncoder().encode("proof")])
    );
    const countResult = await finalizeMatchResult(
      validFinalizationInput(countAttempt.attemptId)
    );
    expect(countResult.status).toBe("error");
    expect(countClient.download).not.toHaveBeenCalled();
    expect(countClient.remove).not.toHaveBeenCalled();
  });

  it("rejects changed result facts before claiming finalization and keeps the prepared attempt retryable", async () => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    prepared.uploads.forEach((upload, index) =>
      replayClient.payloads.set(upload.path, [
        new TextEncoder().encode(`stored-game-${index + 1}`),
      ])
    );

    const mismatch = await finalizeMatchResult({
      ...validFinalizationInput(prepared.attemptId),
      playerTwoScore: 1,
    });

    expect(mismatch).toMatchObject({
      status: "error",
      requiresRefresh: false,
    });
    expect(replayClient.download).not.toHaveBeenCalled();
    expect(replayClient.remove).not.toHaveBeenCalled();
    expect(replayClient.attempts.get(prepared.attemptId)?.status).toBe(
      "prepared"
    );

    const retry = await finalizeMatchResult(
      validFinalizationInput(prepared.attemptId)
    );
    expect(retry.status).toBe("success");
    expect(replayClient.download).toHaveBeenCalledTimes(2);
    expect(
      replayClient.rpcCallsFor("commit_match_replay_attempt_result")
    ).toHaveLength(1);
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
      ...validFinalizationInput(prepared.attemptId),
      playerOneScore: 1,
    });

    expect(result.status).toBe("success");
    const trustedHash = createHash("sha256");
    chunks.forEach((chunk) => trustedHash.update(chunk));
    expect(replayClient.rpc).toHaveBeenCalledWith(
      "commit_match_replay_attempt_result",
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
      validFinalizationInput(prepared.attemptId)
    );

    expect(result.status).toBe("error");
    expect(
      replayClient.rpcCallsFor("commit_match_replay_attempt_result")
    ).toHaveLength(0);
    expect(replayClient.remove).toHaveBeenCalledWith(
      replayClient.attempts.get(prepared.attemptId)?.paths
    );
  });

  it("rejects duplicate payloads on distinct paths using trusted stored hashes", async () => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    const duplicate = new TextEncoder().encode("same-stored-payload");
    const duplicateHash = createHash("sha256").update(duplicate).digest("hex");
    prepared.uploads.forEach((upload) =>
      replayClient.payloads.set(upload.path, [duplicate])
    );

    const result = await finalizeMatchResult(
      validFinalizationInput(prepared.attemptId)
    );

    expect(result).toMatchObject({
      status: "error",
      code: "duplicate_replay",
      message:
        "This replay has already been submitted. Use a different replay file.",
      requiresRefresh: false,
    });
    expect(
      replayClient.rpcCallsFor("commit_match_replay_attempt_result")
    ).toHaveLength(0);
    expect(replayClient.remove).toHaveBeenCalledOnce();
    expect(replayClient.state.activeReport).toBe(false);
    expect(replayClient.state.referencedPaths.size).toBe(0);
    expect(replayClient.payloads.size).toBe(0);

    const visibleOutput = JSON.stringify({
      result,
      logs: vi.mocked(console.error).mock.calls,
    });
    for (const privateValue of [
      duplicateHash,
      ...prepared.uploads.flatMap((upload) => [upload.path, upload.token]),
      "https://private.invalid",
      "must-not-leak",
    ]) {
      expect(visibleOutput).not.toContain(privateValue);
    }
  });

  it("does not promote an untyped duplicate-looking database error", async () => {
    const privateDatabaseDetail =
      "Each game requires a unique replay file; private/path?token=secret";
    const replayClient = createReplayClient({
      rpcError: { code: "P0001", message: privateDatabaseDetail },
    });
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    prepared.uploads.forEach((upload, index) =>
      replayClient.payloads.set(
        upload.path,
        [new TextEncoder().encode(`unique-stored-payload-${index}`)]
      )
    );

    const result = await finalizeMatchResult(
      validFinalizationInput(prepared.attemptId)
    );

    expect(result).toMatchObject({
      status: "error",
      code: "operation_failed",
      message: "Each completed game requires a unique replay file.",
      requiresRefresh: false,
    });
    expect(
      replayClient.rpcCallsFor("commit_match_replay_attempt_result")
    ).toHaveLength(1);
    expect(replayClient.remove).toHaveBeenCalledOnce();
    expect(replayClient.state.activeReport).toBe(false);
    expect(replayClient.state.referencedPaths.size).toBe(0);
    expect(replayClient.payloads.size).toBe(0);

    const visibleOutput = JSON.stringify({
      result,
      logs: vi.mocked(console.error).mock.calls,
    });
    expect(visibleOutput).not.toContain("private/path");
    expect(visibleOutput).not.toContain("token=secret");
  });

  it("rejects malformed, wrong-match, and wrong-owner attempts without unsafe deletion", async () => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");

    const malformed = await finalizeMatchResult(
      validFinalizationInput("../private-attempt")
    );
    expect(malformed.status).toBe("error");

    const wrongMatch = await cleanupPreparedReplayUploads({
      matchId: OTHER_MATCH_ID,
      attemptId: prepared.attemptId,
    });
    expect(wrongMatch.status).toBe("error");

    authMock.mockResolvedValue({
      ...playerIdentity,
      userId: "user_other_match_participant",
    });
    replayClient.state.ownedRegistrationId = PLAYER_TWO_REGISTRATION_ID;
    const wrongOwner = await finalizeMatchResult(
      validFinalizationInput(prepared.attemptId)
    );
    expect(wrongOwner.status).toBe("error");
    const wrongOwnerCleanup = await cleanupPreparedReplayUploads({
      matchId: MATCH_ID,
      attemptId: prepared.attemptId,
    });
    expect(wrongOwnerCleanup.status).toBe("error");

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
      validFinalizationInput(prepared.attemptId)
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
      validFinalizationInput(rpcPrepared.attemptId)
    );
    expect(rpcFailureClient.remove).toHaveBeenCalledOnce();
  });

  it("cleanup refuses another match, fails closed on reference errors, and preserves referenced proof", async () => {
    const wrongMatchClient = createReplayClient({ seriesBestOf: 1 });
    createSupabaseAdminClientMock.mockReturnValue(wrongMatchClient.client);
    const wrongMatchAttempt = await prepareMatchReplayUploads(
      validPreparationInput({
        playerOneScore: 1,
        replayFiles: [{ name: "one.rec", size: 10 }],
      })
    );
    if (wrongMatchAttempt.status !== "success") {
      throw new Error("Preparation failed");
    }

    await cleanupPreparedReplayUploads({
      matchId: OTHER_MATCH_ID,
      attemptId: wrongMatchAttempt.attemptId,
    });
    expect(wrongMatchClient.remove).not.toHaveBeenCalled();

    const referenceClient = createReplayClient({ seriesBestOf: 1 });
    createSupabaseAdminClientMock.mockReturnValue(referenceClient.client);
    const referenceAttempt = await prepareMatchReplayUploads(
      validPreparationInput({
        playerOneScore: 1,
        replayFiles: [{ name: "one.rec", size: 10 }],
      })
    );
    if (referenceAttempt.status !== "success") {
      throw new Error("Preparation failed");
    }
    const referencedPath = referenceAttempt.uploads[0].path;
    referenceClient.state.referencedPaths.add(referencedPath);
    const referenced = await cleanupPreparedReplayUploads({
      matchId: MATCH_ID,
      attemptId: referenceAttempt.attemptId,
    });
    expect(referenced.status).toBe("error");
    expect(referenceClient.remove).not.toHaveBeenCalled();

    const referenceErrorClient = createReplayClient({ seriesBestOf: 1 });
    createSupabaseAdminClientMock.mockReturnValue(referenceErrorClient.client);
    const referenceErrorAttempt = await prepareMatchReplayUploads(
      validPreparationInput({
        playerOneScore: 1,
        replayFiles: [{ name: "one.rec", size: 10 }],
      })
    );
    if (referenceErrorAttempt.status !== "success") {
      throw new Error("Preparation failed");
    }
    referenceErrorClient.state.referenceError = {
      code: "DB_FAIL",
      message: "private database detail",
    };
    const failedClosed = await cleanupPreparedReplayUploads({
      matchId: MATCH_ID,
      attemptId: referenceErrorAttempt.attemptId,
    });
    expect(failedClosed.status).toBe("error");
    expect(referenceErrorClient.remove).not.toHaveBeenCalled();

    const committedClient = createReplayClient({ seriesBestOf: 1 });
    createSupabaseAdminClientMock.mockReturnValue(committedClient.client);
    const committedAttempt = await prepareMatchReplayUploads(
      validPreparationInput({
        playerOneScore: 1,
        replayFiles: [{ name: "one.rec", size: 10 }],
      })
    );
    if (committedAttempt.status !== "success") {
      throw new Error("Preparation failed");
    }
    committedClient.payloads.set(committedAttempt.uploads[0].path, [
      new TextEncoder().encode("committed-proof"),
    ]);
    await finalizeMatchResult({
      ...validFinalizationInput(committedAttempt.attemptId),
      playerOneScore: 1,
    });
    const preserved = await cleanupPreparedReplayUploads({
      matchId: MATCH_ID,
      attemptId: committedAttempt.attemptId,
    });
    expect(preserved).toEqual({ status: "success", removedCount: 0 });
    expect(committedClient.remove).not.toHaveBeenCalled();
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
        validFinalizationInput(prepared.attemptId)
      );

      expect(result).toMatchObject({ status: "success" });
      expect(result.message).toContain("result was saved");
      expect(replayClient.remove).not.toHaveBeenCalled();
      expect(
        prepared.uploads.every((upload) => replayClient.payloads.has(upload.path))
      ).toBe(true);
    }
  );

  it("reconciles an ambiguous RPC response after the atomic commit", async () => {
    const replayClient = createReplayClient({ rpcResponseLossAfterCommit: true });
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    prepared.uploads.forEach((upload, index) =>
      replayClient.payloads.set(upload.path, [new Uint8Array([index + 1])])
    );

    const result = await finalizeMatchResult(
      validFinalizationInput(prepared.attemptId)
    );

    expect(result.status).toBe("success");
    expect(
      replayClient.rpcCallsFor("commit_match_replay_attempt_result")
    ).toHaveLength(1);
    expect(replayClient.remove).not.toHaveBeenCalled();
    expect(createInAppNotificationMock).not.toHaveBeenCalled();
    expect(
      prepared.uploads.every((upload) => replayClient.payloads.has(upload.path))
    ).toBe(true);
  });

  it("reconciles a response-loss retry without deleting or recommitting proof", async () => {
    const replayClient = createReplayClient();
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    prepared.uploads.forEach((upload, index) => {
      replayClient.payloads.set(upload.path, [new Uint8Array([index + 1])]);
    });
    const input = validFinalizationInput(prepared.attemptId);
    const committed = await finalizeMatchResult(input);
    expect(committed.status).toBe("success");

    const retry = await finalizeMatchResult(input);

    expect(retry.status).toBe("success");
    expect(
      replayClient.rpcCallsFor("commit_match_replay_attempt_result")
    ).toHaveLength(1);
    expect(createInAppNotificationMock).toHaveBeenCalledOnce();
    expect(replayClient.remove).not.toHaveBeenCalled();
    expect(replayClient.payloads.size).toBe(2);
  });

  it("does not let cleanup delete proof after hashing while result commit is pending", async () => {
    const rpcReached = deferred();
    const allowRpcCommit = deferred();
    const replayClient = createReplayClient({
      beforeRpcCommit: async () => {
        rpcReached.resolve();
        await allowRpcCommit.promise;
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    prepared.uploads.forEach((upload, index) =>
      replayClient.payloads.set(
        upload.path,
        [new TextEncoder().encode(`race-a-${index}`)]
      )
    );

    const finalization = finalizeMatchResult(
      validFinalizationInput(prepared.attemptId)
    );
    await rpcReached.promise;

    const cleanup = await cleanupPreparedReplayUploads({
      matchId: MATCH_ID,
      attemptId: prepared.attemptId,
    });
    allowRpcCommit.resolve();
    const committed = await finalization;

    expect(committed.status).toBe("success");
    expect(cleanup.status).toBe("error");
    expect(replayClient.remove).not.toHaveBeenCalled();
    expect(
      prepared.uploads.every((upload) => replayClient.payloads.has(upload.path))
    ).toBe(true);
  });

  it("does not let a stale cleanup decision delete proof after result commit", async () => {
    const removeReached = deferred();
    const allowRemove = deferred();
    const replayClient = createReplayClient({
      beforeStorageRemove: async () => {
        removeReached.resolve();
        await allowRemove.promise;
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    prepared.uploads.forEach((upload, index) =>
      replayClient.payloads.set(
        upload.path,
        [new TextEncoder().encode(`race-b-${index}`)]
      )
    );

    const cleanup = cleanupPreparedReplayUploads({
      matchId: MATCH_ID,
      attemptId: prepared.attemptId,
    });
    await removeReached.promise;
    const rejectedFinalization = await finalizeMatchResult(
      validFinalizationInput(prepared.attemptId)
    );
    allowRemove.resolve();
    const cleanupResult = await cleanup;

    expect(rejectedFinalization.status).toBe("error");
    expect(cleanupResult).toEqual({ status: "success", removedCount: 5 });
    expect(replayClient.state.referencedPaths.size).toBe(0);
    expect(replayClient.payloads.size).toBe(0);
  });

  it("does not let a losing parallel finalization delete the winner's proof", async () => {
    const rpcReached = deferred();
    const allowRpcCommit = deferred();
    const replayClient = createReplayClient({
      beforeRpcCommit: async () => {
        rpcReached.resolve();
        await allowRpcCommit.promise;
      },
    });
    createSupabaseAdminClientMock.mockReturnValue(replayClient.client);
    const prepared = await prepareMatchReplayUploads(validPreparationInput());
    if (prepared.status !== "success") throw new Error("Preparation failed");
    prepared.uploads.forEach((upload, index) =>
      replayClient.payloads.set(
        upload.path,
        [new TextEncoder().encode(`race-c-${index}`)]
      )
    );
    const input = validFinalizationInput(prepared.attemptId);

    const winner = finalizeMatchResult(input);
    await rpcReached.promise;
    const loser = await finalizeMatchResult(input);
    allowRpcCommit.resolve();
    const committed = await winner;

    expect(committed.status).toBe("success");
    expect(loser.status).toBe("error");
    expect(
      replayClient.rpcCallsFor("commit_match_replay_attempt_result")
    ).toHaveLength(1);
    expect(replayClient.download).toHaveBeenCalledTimes(2);
    expect(replayClient.remove).not.toHaveBeenCalled();
    expect(
      prepared.uploads.every((upload) => replayClient.payloads.has(upload.path))
    ).toBe(true);
  });
});
