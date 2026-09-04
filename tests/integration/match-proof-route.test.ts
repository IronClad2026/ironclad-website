import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminIdentity,
  anonymousIdentity,
  playerIdentity,
  type MockAuthIdentity,
} from "@/tests/fixtures/auth";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const authMock = vi.hoisted(() => vi.fn());
const createAuthenticatedSupabaseClientMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import { GET } from "@/app/api/match-proofs/[matchId]/[source]/[recordId]/[kind]/route";

const RECORD_ID = "11111111-1111-4111-8111-111111111111";
const MATCH_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_MATCH_ID = "33333333-3333-4333-8333-333333333333";
const TOURNAMENT_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_TOURNAMENT_ID = "55555555-5555-4555-8555-555555555555";
const SUBMITTER_REGISTRATION_ID =
  "66666666-6666-4666-8666-666666666666";
const OPPONENT_REGISTRATION_ID =
  "77777777-7777-4777-8777-777777777777";
const REPORT_GROUP_ID = "88888888-8888-4888-8888-888888888888";
const DEFAULT_REPLAY_PATH = `${MATCH_ID}/proof-${RECORD_ID}/game-1.rec`;

type ProofSource = "submission" | "report-group";
type StorageError = {
  message: string;
};

type AdminClientOptions = {
  divisionName?: string;
  gameNumber?: number;
  matchId?: string;
  matchNumber?: number;
  playerOneName?: string;
  playerTwoName?: string;
  proofMatchId?: string;
  proofTournamentId?: string;
  proofData?: unknown;
  proofError?: StorageError | null;
  reportGroupId?: string | null;
  roundName?: string;
  source?: ProofSource;
  storageError?: StorageError | null;
  storagePath?: string;
  storageStream?: ReadableStream<Uint8Array> | null;
  tournamentId?: string;
  tournamentTitle?: string;
  viewerRegistrationId?: string | null;
};

function createAuthenticatedClient({
  events,
  matchData = {
    id: MATCH_ID,
    player_one_registration_id: SUBMITTER_REGISTRATION_ID,
    player_two_registration_id: OPPONENT_REGISTRATION_ID,
  },
  matchError = null,
  registrationData = {
    id: SUBMITTER_REGISTRATION_ID,
  },
  registrationError = null,
}: {
  events?: string[];
  matchData?: unknown;
  matchError?: StorageError | null;
  registrationData?: unknown;
  registrationError?: StorageError | null;
} = {}) {
  const matchQuery = createSupabaseQueryMock({
    data: matchData,
    error: matchError,
  });
  const registrationQuery = createSupabaseQueryMock({
    data: registrationData,
    error: registrationError,
  });

  makeTerminalQuery(
    matchQuery,
    { data: matchData, error: matchError },
    "match-authorization-resolved",
    events
  );
  makeTerminalQuery(
    registrationQuery,
    { data: registrationData, error: registrationError },
    "registration-authorization-resolved",
    events
  );

  const from = vi.fn((table: string) => {
    if (table === "tournament_matches") return matchQuery.query;
    if (table === "registrations") return registrationQuery.query;
    throw new Error(`Unexpected authenticated test table: ${table}`);
  });

  return {
    client: { from },
    from,
    matchQuery,
    registrationQuery,
  };
}

function makeTerminalQuery(
  queryMock: ReturnType<typeof createSupabaseQueryMock>,
  result: {
    data: unknown;
    error: StorageError | null;
  },
  resolutionEvent: string,
  events?: string[]
) {
  Object.assign(queryMock.query, {
    limit: (...args: unknown[]) => {
      queryMock.calls.push({ method: "limit", args });
      return queryMock.query;
    },
    maybeSingle: async (...args: unknown[]) => {
      queryMock.calls.push({ method: "maybeSingle", args });
      events?.push(resolutionEvent);
      return result;
    },
  });
}

function createAdminClient({
  divisionName = "Academy",
  gameNumber = 1,
  matchId = MATCH_ID,
  matchNumber = 3,
  playerOneName = "Commander One",
  playerTwoName = "Commander Two",
  proofMatchId = matchId,
  proofData,
  proofError = null,
  source = "submission",
  storageError = null,
  storagePath = DEFAULT_REPLAY_PATH,
  storageStream = streamFromText("proof-bytes"),
  tournamentId = TOURNAMENT_ID,
  proofTournamentId = tournamentId,
  reportGroupId = REPORT_GROUP_ID,
  roundName = "Round 1",
  tournamentTitle = "IronClad Invitational",
  viewerRegistrationId = SUBMITTER_REGISTRATION_ID,
}: AdminClientOptions = {}) {
  const resolvedProofData =
    proofData === undefined
      ? source === "submission"
        ? {
            id: RECORD_ID,
            game_number: gameNumber,
            match_id: proofMatchId,
            report_group_id: reportGroupId,
            replay_storage_path: storagePath,
            screenshot_storage_path: storagePath,
            submitted_by_registration_id: SUBMITTER_REGISTRATION_ID,
          }
        : {
            id: RECORD_ID,
            match_id: proofMatchId,
            opponent_registration_id: OPPONENT_REGISTRATION_ID,
            replay_storage_path: storagePath,
            submitted_by_registration_id: SUBMITTER_REGISTRATION_ID,
            tournament_id: proofTournamentId,
          }
      : proofData;
  const proofQuery = createSupabaseQueryMock({
    data: resolvedProofData,
    error: proofError,
  });
  const matchQuery = createSupabaseQueryMock({
    data: {
      generated_bracket_id: "generated-bracket-1",
      id: matchId,
      match_number: matchNumber,
      player_one_registration_id: SUBMITTER_REGISTRATION_ID,
      player_two_registration_id: OPPONENT_REGISTRATION_ID,
      player_one: { player_name: playerOneName },
      player_two: { player_name: playerTwoName },
      bracket_rounds: { name: roundName },
      generated_brackets: {
        id: "generated-bracket-1",
        tournament_brackets: {
          id: "tournament-bracket-1",
          name: divisionName,
          tournament_id: tournamentId,
          tournaments: {
            id: tournamentId,
            title: tournamentTitle,
          },
        },
      },
    },
  });
  const generatedBracketQuery = createSupabaseQueryMock({
    data: {
      id: "generated-bracket-1",
      tournament_bracket_id: "tournament-bracket-1",
    },
  });
  const tournamentBracketQuery = createSupabaseQueryMock({
    data: {
      id: "tournament-bracket-1",
      tournament_id: tournamentId,
    },
  });
  const registrationQuery = createSupabaseQueryMock({
    data: viewerRegistrationId
      ? {
          id: viewerRegistrationId,
        }
      : null,
  });
  Object.assign(registrationQuery.query, {
    limit: (...args: unknown[]) => {
      registrationQuery.calls.push({ method: "limit", args });
      return registrationQuery.query;
    },
  });
  const queries = new Map([
    [
      source === "submission"
        ? "match_result_submissions"
        : "match_result_report_groups",
      proofQuery,
    ],
    ["tournament_matches", matchQuery],
    ["generated_brackets", generatedBracketQuery],
    ["tournament_brackets", tournamentBracketQuery],
    ["registrations", registrationQuery],
  ]);
  const from = vi.fn((table: string) => {
    const fixture = queries.get(table);
    if (!fixture) {
      throw new Error(`Unexpected test table: ${table}`);
    }
    return fixture.query;
  });
  const asStream = vi.fn(async () => ({
    data: storageStream,
    error: storageError,
  }));
  const download = vi.fn(() => ({ asStream }));
  const createSignedUrl = vi.fn();
  const storageFrom = vi.fn(() => ({
    createSignedUrl,
    download,
  }));

  return {
    asStream,
    client: {
      from,
      storage: {
        from: storageFrom,
      },
    },
    createSignedUrl,
    download,
    from,
    generatedBracketQuery,
    matchQuery,
    proofQuery,
    registrationQuery,
    storageFrom,
    tournamentBracketQuery,
  };
}

function configureAuthorizedRequest({
  adminClient = createAdminClient(),
  authenticatedClient,
  events,
  identity = playerIdentity,
}: {
  adminClient?: ReturnType<typeof createAdminClient>;
  authenticatedClient?: ReturnType<typeof createAuthenticatedClient>;
  events?: string[];
  identity?: MockAuthIdentity;
} = {}) {
  const resolvedAuthenticatedClient =
    authenticatedClient ?? createAuthenticatedClient({ events });
  authMock.mockImplementation(async () => {
    events?.push("clerk-authenticated");
    return identity;
  });
  createAuthenticatedSupabaseClientMock.mockImplementation(async () => {
    events?.push("authenticated-client-created");
    return resolvedAuthenticatedClient.client;
  });
  createSupabaseAdminClientMock.mockImplementation(() => {
    events?.push("service-role-created");
    return adminClient.client;
  });

  return {
    adminClient,
    authenticatedClient: resolvedAuthenticatedClient,
  };
}

async function requestProof({
  kind = "replay",
  matchId = MATCH_ID,
  recordId = RECORD_ID,
  source = "submission",
}: {
  kind?: string;
  matchId?: string;
  recordId?: string;
  source?: string;
} = {}) {
  return GET(
    new Request(
      `http://localhost/api/match-proofs/${encodeURIComponent(
        matchId
      )}/${encodeURIComponent(source)}/${encodeURIComponent(
        recordId
      )}/${encodeURIComponent(kind)}`
    ),
    {
      params: Promise.resolve({
        kind,
        matchId,
        recordId,
        source,
      }),
    }
  );
}

function streamFromText(value: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

function streamWithSize(totalBytes: number, chunkBytes = 1024 * 1024) {
  let emittedBytes = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (emittedBytes >= totalBytes) {
        controller.close();
        return;
      }

      const nextChunkSize = Math.min(chunkBytes, totalBytes - emittedBytes);
      emittedBytes += nextChunkSize;
      controller.enqueue(new Uint8Array(nextChunkSize));
    },
  });
}

function expectUnavailableResponse(response: Response) {
  expect(response.status).toBe(404);
  expect(response.headers.get("Cache-Control")).toContain("private");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(response.headers.get("Content-Type")).toBe(
    "text/plain; charset=utf-8"
  );
  expect(response.headers.get("Location")).toBeNull();
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
}

function expectPrivateProofResponse(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("private");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(response.headers.get("Location")).toBeNull();
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
}

describe("authenticated match-proof proxy route", () => {
  beforeEach(() => {
    authMock.mockReset();
    createAuthenticatedSupabaseClientMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
  });

  it("rejects an anonymous request before either Supabase client is created", async () => {
    authMock.mockResolvedValue(anonymousIdentity);

    const response = await requestProof();

    expectUnavailableResponse(response);
    expect(await response.text()).toBe("Proof unavailable.");
    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid match ID", { matchId: "not-a-uuid" }],
    ["invalid source", { source: "submissions" }],
    ["invalid record ID", { recordId: "not-a-uuid" }],
    ["invalid proof kind", { kind: "archive" }],
    [
      "unsupported report-group screenshot",
      { source: "report-group", kind: "screenshot" },
    ],
  ])("rejects %s before database access", async (_name, parameters) => {
    authMock.mockResolvedValue(playerIdentity);

    const response = await requestProof(parameters);

    expectUnavailableResponse(response);
    expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["unrelated viewer", null, null],
    ["authorization denial", null, { message: "permission denied" }],
  ])(
    "fails closed for an %s without creating the service-role client",
    async (_name, matchData, matchError) => {
      const authenticatedClient = createAuthenticatedClient({
        matchData,
        matchError,
      });
      configureAuthorizedRequest({ authenticatedClient });

      const response = await requestProof();

      expectUnavailableResponse(response);
      expect(await response.text()).toBe("Proof unavailable.");
      expect(authenticatedClient.from).toHaveBeenCalledWith(
        "tournament_matches"
      );
      expect(authenticatedClient.matchQuery.calls).toContainEqual({
        method: "select",
        args: [
          "id, player_one_registration_id, player_two_registration_id",
        ],
      });
      expect(authenticatedClient.matchQuery.calls).toContainEqual({
        method: "eq",
        args: ["id", MATCH_ID],
      });
      expect(authenticatedClient.registrationQuery.calls).toHaveLength(0);
      expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    [
      "an unexpected field",
      {
        id: MATCH_ID,
        player_one_registration_id: SUBMITTER_REGISTRATION_ID,
        player_two_registration_id: OPPONENT_REGISTRATION_ID,
        raw_storage_path: DEFAULT_REPLAY_PATH,
      },
    ],
    [
      "a mismatched match ID",
      {
        id: OTHER_MATCH_ID,
        player_one_registration_id: SUBMITTER_REGISTRATION_ID,
        player_two_registration_id: OPPONENT_REGISTRATION_ID,
      },
    ],
    [
      "a malformed participant registration ID",
      {
        id: MATCH_ID,
        player_one_registration_id: "registration-not-a-uuid",
        player_two_registration_id: OPPONENT_REGISTRATION_ID,
      },
    ],
    ["an array", [MATCH_ID, SUBMITTER_REGISTRATION_ID]],
  ])(
    "rejects an authorization descriptor containing %s",
    async (_name, matchData) => {
      const authenticatedClient = createAuthenticatedClient({ matchData });
      configureAuthorizedRequest({ authenticatedClient });

      const response = await requestProof();

      expectUnavailableResponse(response);
      expect(authenticatedClient.registrationQuery.calls).toHaveLength(0);
      expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["no owned registration", null, null],
    [
      "an authenticated registration query failure",
      null,
      { message: "permission denied" },
    ],
    [
      "an unexpected registration field",
      {
        id: SUBMITTER_REGISTRATION_ID,
        clerk_user_id: "user_private",
      },
      null,
    ],
    [
      "an out-of-scope registration ID",
      {
        id: OTHER_MATCH_ID,
      },
      null,
    ],
  ])(
    "rejects %s before creating the service-role client",
    async (_name, registrationData, registrationError) => {
      const authenticatedClient = createAuthenticatedClient({
        registrationData,
        registrationError,
      });
      configureAuthorizedRequest({ authenticatedClient });

      const response = await requestProof();

      expectUnavailableResponse(response);
      expect(authenticatedClient.registrationQuery.calls).toContainEqual({
        method: "select",
        args: ["id"],
      });
      expect(authenticatedClient.registrationQuery.calls).toContainEqual({
        method: "in",
        args: [
          "id",
          [SUBMITTER_REGISTRATION_ID, OPPONENT_REGISTRATION_ID],
        ],
      });
      expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
    }
  );

  it("rejects a participantless match before registration or service access", async () => {
    const authenticatedClient = createAuthenticatedClient({
      matchData: {
        id: MATCH_ID,
        player_one_registration_id: null,
        player_two_registration_id: null,
      },
    });
    configureAuthorizedRequest({ authenticatedClient });

    const response = await requestProof();

    expectUnavailableResponse(response);
    expect(authenticatedClient.registrationQuery.calls).toHaveLength(0);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("fails closed when Clerk says admin but authenticated match scope is unavailable", async () => {
    const authenticatedClient = createAuthenticatedClient({
      matchData: null,
    });
    configureAuthorizedRequest({
      authenticatedClient,
      identity: adminIdentity,
    });

    const response = await requestProof();

    expectUnavailableResponse(response);
    expect(authenticatedClient.registrationQuery.calls).toHaveLength(0);
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("creates the service-role client only after authenticated authorization succeeds", async () => {
    const events: string[] = [];
    const { authenticatedClient } = configureAuthorizedRequest({ events });

    const response = await requestProof();

    expectPrivateProofResponse(response);
    expect(await response.text()).toBe("proof-bytes");
    expect(events).toEqual([
      "clerk-authenticated",
      "authenticated-client-created",
      "match-authorization-resolved",
      "registration-authorization-resolved",
      "service-role-created",
    ]);
    expect(authenticatedClient.matchQuery.calls).toContainEqual({
      method: "maybeSingle",
      args: [],
    });
    expect(authenticatedClient.registrationQuery.calls).toContainEqual({
      method: "maybeSingle",
      args: [],
    });
    expect(createSupabaseAdminClientMock).toHaveBeenCalledOnce();
  });

  it("rejects a cross-match proof after privileged descriptor revalidation", async () => {
    const adminClient = createAdminClient({
      proofMatchId: OTHER_MATCH_ID,
    });
    configureAuthorizedRequest({ adminClient });

    const response = await requestProof();

    expectUnavailableResponse(response);
    expect(adminClient.registrationQuery.calls).toHaveLength(0);
    expect(adminClient.proofQuery.calls).toContainEqual({
      method: "eq",
      args: ["match_id", MATCH_ID],
    });
    expect(adminClient.download).not.toHaveBeenCalled();
  });

  it("rejects a tournament descriptor mismatch before participant or storage access", async () => {
    const adminClient = createAdminClient({
      proofTournamentId: OTHER_TOURNAMENT_ID,
      source: "report-group",
    });
    configureAuthorizedRequest({ adminClient });

    const response = await requestProof({ source: "report-group" });

    expectUnavailableResponse(response);
    expect(adminClient.registrationQuery.calls).toHaveLength(0);
    expect(adminClient.download).not.toHaveBeenCalled();
  });

  it.each([
    ["missing proof record", null],
    [
      "missing proof object reference",
      {
        id: RECORD_ID,
        match_id: MATCH_ID,
        replay_storage_path: null,
        screenshot_storage_path: null,
        submitted_by_registration_id: SUBMITTER_REGISTRATION_ID,
      },
    ],
  ])("returns the uniform unavailable response for a %s", async (_name, proofData) => {
    const adminClient = createAdminClient({ proofData });
    configureAuthorizedRequest({ adminClient });

    const response = await requestProof();

    expectUnavailableResponse(response);
    expect(await response.text()).toBe("Proof unavailable.");
    expect(adminClient.download).not.toHaveBeenCalled();
  });

  it("rejects a viewer who is not a same-match registration", async () => {
    const adminClient = createAdminClient({
      viewerRegistrationId: null,
    });
    configureAuthorizedRequest({ adminClient });

    const response = await requestProof();

    expectUnavailableResponse(response);
    expect(adminClient.download).not.toHaveBeenCalled();
  });

  it.each([
    ["submitting player", SUBMITTER_REGISTRATION_ID],
    ["opponent", OPPONENT_REGISTRATION_ID],
  ])("serves a replay to the %s", async (_name, viewerRegistrationId) => {
    const adminClient = createAdminClient({ viewerRegistrationId });
    const authenticatedClient = createAuthenticatedClient({
      registrationData: {
        id: viewerRegistrationId,
      },
    });
    configureAuthorizedRequest({ adminClient, authenticatedClient });

    const response = await requestProof();

    expectPrivateProofResponse(response);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="IronClad_IronClad-Invitational_Academy_Round-1_Match-3_Game-1_Commander-One-vs-Commander-Two.rec"'
    );
    expect(response.headers.get("Content-Type")).toBe(
      "application/octet-stream"
    );
    expect(await response.text()).toBe("proof-bytes");
    expect(adminClient.registrationQuery.calls).toContainEqual({
      args: [
        "id",
        [SUBMITTER_REGISTRATION_ID, OPPONENT_REGISTRATION_ID],
      ],
      method: "in",
    });
    expect(authenticatedClient.registrationQuery.calls).toContainEqual({
      args: [
        "id",
        [SUBMITTER_REGISTRATION_ID, OPPONENT_REGISTRATION_ID],
      ],
      method: "in",
    });
    expect(adminClient.storageFrom).toHaveBeenCalledWith("match-proofs");
    expect(adminClient.download).toHaveBeenCalledWith(
      DEFAULT_REPLAY_PATH,
      {},
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      })
    );
    expect(adminClient.createSignedUrl).not.toHaveBeenCalled();
  });

  it("serves a replay to an administrator without a participant lookup", async () => {
    const adminClient = createAdminClient();
    const { authenticatedClient } = configureAuthorizedRequest({
      adminClient,
      identity: adminIdentity,
    });

    const response = await requestProof();

    expectPrivateProofResponse(response);
    expect(await response.text()).toBe("proof-bytes");
    expect(authenticatedClient.matchQuery.calls).toContainEqual({
      method: "eq",
      args: ["id", MATCH_ID],
    });
    expect(authenticatedClient.registrationQuery.calls).toHaveLength(0);
    expect(adminClient.registrationQuery.calls).toHaveLength(0);
    expect(adminClient.download).toHaveBeenCalledOnce();
  });

  it("serves an authorized report-group replay through its opaque record reference", async () => {
    const adminClient = createAdminClient({
      source: "report-group",
      storagePath: `${MATCH_ID}/proof-${RECORD_ID}/legacy.rec`,
    });
    configureAuthorizedRequest({ adminClient });

    const response = await requestProof({
      source: "report-group",
    });

    expectPrivateProofResponse(response);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="IronClad_IronClad-Invitational_Academy_Round-1_Match-3_Series-Replay_Commander-One-vs-Commander-Two.rec"'
    );
    expect(await response.text()).toBe("proof-bytes");
    expect(adminClient.from).toHaveBeenCalledWith(
      "match_result_report_groups"
    );
    expect(adminClient.download).toHaveBeenCalledOnce();
  });

  it("sanitizes contextual replay filenames without weakening private delivery", async () => {
    const adminClient = createAdminClient({
      divisionName: "Main/Pro \\ Division",
      matchNumber: 12,
      playerOneName: 'Alpha\r\nContent-Disposition: inline',
      playerTwoName: "Bravó / ..",
      roundName: "Semi-final / Upper",
      tournamentTitle: 'Open <Final> : 2026',
    });
    configureAuthorizedRequest({ adminClient, identity: adminIdentity });

    const response = await requestProof();
    const disposition = response.headers.get("Content-Disposition");

    expectPrivateProofResponse(response);
    expect(disposition).toBe(
      'attachment; filename="IronClad_Open-Final-2026_Main-Pro-Division_Semi-final-Upper_Match-12_Game-1_Alpha-Content-Disposition-in-vs-Bravo.rec"'
    );
    expect(disposition).not.toMatch(/[\\/\r\n]/);
    expect(await response.text()).toBe("proof-bytes");
    expect(adminClient.createSignedUrl).not.toHaveBeenCalled();
  });

  it("labels a standalone legacy submission as a Series Replay", async () => {
    const adminClient = createAdminClient({ reportGroupId: null });
    configureAuthorizedRequest({ adminClient, identity: adminIdentity });

    const response = await requestProof();

    expectPrivateProofResponse(response);
    expect(response.headers.get("Content-Disposition")).toContain(
      "_Series-Replay_"
    );
    expect(await response.text()).toBe("proof-bytes");
  });

  it.each([
    ["jpeg", "image/jpeg", 'inline; filename="match-screenshot.jpg"'],
    ["jpg", "image/jpeg", 'inline; filename="match-screenshot.jpg"'],
    ["png", "image/png", 'inline; filename="match-screenshot.png"'],
    ["webp", "image/webp", 'inline; filename="match-screenshot.webp"'],
  ])(
    "serves an authorized .%s screenshot with an allowlisted content type and filename",
    async (extension, contentType, contentDisposition) => {
      const screenshotPath = `${MATCH_ID}/proof-${RECORD_ID}/screenshot.${extension}`;
      const adminClient = createAdminClient({
        storagePath: screenshotPath,
      });
      configureAuthorizedRequest({ adminClient });

      const response = await requestProof({ kind: "screenshot" });

      expectPrivateProofResponse(response);
      expect(response.headers.get("Content-Disposition")).toBe(
        contentDisposition
      );
      expect(response.headers.get("Content-Type")).toBe(contentType);
      expect(await response.text()).toBe("proof-bytes");
      expect(JSON.stringify([...response.headers])).not.toContain(
        screenshotPath
      );
    }
  );

  it("rejects a screenshot with an active or unknown extension", async () => {
    const adminClient = createAdminClient({
      storagePath: `${MATCH_ID}/proof-${RECORD_ID}/screenshot.svg`,
    });
    configureAuthorizedRequest({ adminClient });

    const response = await requestProof({ kind: "screenshot" });

    expectUnavailableResponse(response);
    expect(adminClient.download).not.toHaveBeenCalled();
  });

  it("does not expose a historical identity-bearing path in headers, body, redirects, or logs", async () => {
    const historicalPath = `${MATCH_ID}/user_historical_clerk_id/game-1.rec`;
    const adminClient = createAdminClient({
      storagePath: historicalPath,
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    configureAuthorizedRequest({ adminClient });

    const response = await requestProof();
    const body = await response.text();
    const browserVisibleResponse = `${JSON.stringify([
      ...response.headers,
    ])}\n${body}`;

    expectPrivateProofResponse(response);
    expect(browserVisibleResponse).not.toContain(historicalPath);
    expect(browserVisibleResponse).not.toContain("user_historical_clerk_id");
    expect(response.headers.get("Location")).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
    expect(adminClient.createSignedUrl).not.toHaveBeenCalled();
  });

  it.each([
    `/${MATCH_ID}/absolute/game-1.rec`,
    "../escape.rec",
    `${MATCH_ID}/../escape.rec`,
    `${MATCH_ID}\\escape.rec`,
    `${MATCH_ID}/object?alternate.rec`,
    `${MATCH_ID}/object#fragment.rec`,
    `${MATCH_ID}/object%25encoded.rec`,
    `${MATCH_ID}/%2e%2e/escape.rec`,
    `${MATCH_ID}/%2Fescape.rec`,
    `${MATCH_ID}/%5cescape.rec`,
    `${MATCH_ID}/header\r\ninjection.rec`,
  ])("rejects unsafe storage path syntax without reflecting %s", async (storagePath) => {
    const adminClient = createAdminClient({ storagePath });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    configureAuthorizedRequest({ adminClient });

    const response = await requestProof();
    const body = await response.text();
    const loggedOutput = JSON.stringify(consoleError.mock.calls);

    expectUnavailableResponse(response);
    expect(body).toBe("Proof unavailable.");
    expect(body).not.toContain(storagePath);
    expect(loggedOutput).not.toContain(storagePath);
    expect(adminClient.download).not.toHaveBeenCalled();
  });

  it("rejects a safe-looking object key from another match namespace", async () => {
    const crossMatchPath = `${OTHER_MATCH_ID}/proof/game-1.rec`;
    const adminClient = createAdminClient({
      storagePath: crossMatchPath,
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    configureAuthorizedRequest({ adminClient });

    const response = await requestProof();
    const body = await response.text();

    expectUnavailableResponse(response);
    expect(body).not.toContain(crossMatchPath);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      crossMatchPath
    );
    expect(adminClient.download).not.toHaveBeenCalled();
  });

  it("returns the same non-reflective response when private storage denies access", async () => {
    const privatePath = `${MATCH_ID}/user_private_actor/game-1.rec`;
    const adminClient = createAdminClient({
      storageError: { message: `denied: ${privatePath}` },
      storagePath: privatePath,
      storageStream: null,
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    configureAuthorizedRequest({ adminClient });

    const response = await requestProof();
    const body = await response.text();
    const browserVisibleResponse = `${JSON.stringify([
      ...response.headers,
    ])}\n${body}`;
    const loggedOutput = JSON.stringify(consoleError.mock.calls);

    expectUnavailableResponse(response);
    expect(body).toBe("Proof unavailable.");
    expect(browserVisibleResponse).not.toContain(privatePath);
    expect(browserVisibleResponse).not.toContain("user_private_actor");
    expect(loggedOutput).not.toContain(privatePath);
    expect(loggedOutput).not.toContain("user_private_actor");
    expect(adminClient.createSignedUrl).not.toHaveBeenCalled();
  });

  it(
    "streams a proof exactly at the existing 10 MiB upload limit",
    async () => {
      const tenMiB = 10 * 1024 * 1024;
      const adminClient = createAdminClient({
        storageStream: streamWithSize(tenMiB),
      });
      configureAuthorizedRequest({
        adminClient,
        identity: adminIdentity,
      });

      const response = await requestProof();
      const bytes = await response.arrayBuffer();

      expectPrivateProofResponse(response);
      expect(bytes.byteLength).toBe(tenMiB);
      expect(adminClient.asStream).toHaveBeenCalledOnce();
      expect(adminClient.createSignedUrl).not.toHaveBeenCalled();
    },
    15_000
  );

  it("terminates an oversized historical proof stream", async () => {
    const adminClient = createAdminClient({
      storageStream: streamWithSize(10 * 1024 * 1024 + 1),
    });
    configureAuthorizedRequest({
      adminClient,
      identity: adminIdentity,
    });

    const response = await requestProof();

    expectPrivateProofResponse(response);
    await expect(response.arrayBuffer()).rejects.toThrow(
      "Proof response exceeded its size limit."
    );
    expect(adminClient.createSignedUrl).not.toHaveBeenCalled();
  });
});
