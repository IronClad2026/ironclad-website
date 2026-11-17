import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerk: vi.fn(),
  legal: vi.fn(),
  profile: vi.fn(),
  user: vi.fn(),
  rpc: vi.fn(),
  database: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, clerkClient: mocks.clerk }));
vi.mock("@/lib/account-legal-acceptance", () => ({ loadAccountLegalGateState: mocks.legal }));
vi.mock("@/lib/ready/platform-data", () => ({ loadReadyActiveProfile: mocks.profile }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.database }));

import { GET as getUsage, POST as postUsage } from "@/app/api/ready/usage/route";
import { POST as submitSuggestion } from "@/app/api/ready/suggestions/route";

const site = "https://staging.example.test";
const reviewer = { userId: "visitor-reviewer", sessionId: "review-session" };
const fixture = {
  id: reviewer.userId,
  banned: false,
  locked: false,
  privateMetadata: {
    ironclad_fixture_source: "staging_synthetic_uat",
    ironclad_fixture_contract_version: "staging-synthetic-v1",
    ironclad_fixture_alias: "TestAcademy1",
  },
};
const playerId = "d92f2e87-98df-4a73-bc37-798d00c3592d";
const epoch = "97400208-7b75-4c93-9243-cca74658b3a5";
const browserId = "367a8fac-b9dd-4ccd-95d0-688d6900156e";
const eventId = "a87520d5-8bfe-450d-a2f1-8f6006c30199";
const event = {
  kind: "event", epoch, browserId, eventId,
  event: { type: "action_click", actionId: "my-match", categoryId: "match" },
};

function request(path: "usage" | "suggestions", body: unknown, origin = site) {
  return new Request(`${site}/api/ready/${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function reply(data: unknown) {
  mocks.rpc.mockReturnValueOnce({ abortSignal: vi.fn().mockResolvedValue({ data, error: null }) });
}

beforeEach(() => {
  for (const [name, value] of Object.entries({
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
    NEXT_PUBLIC_SUPABASE_URL: "https://zzbnneprhjicmajpjkdg.supabase.co",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
    CLERK_SECRET_KEY: "sk_test_example",
    READY_STAGING_REVIEW_ALIASES: "TestAcademy1",
    READY_USAGE_HMAC_KEY: "test-only-key-for-the-suggestion-rate-limit",
  })) vi.stubEnv(name, value);
  mocks.auth.mockResolvedValue(reviewer);
  mocks.clerk.mockResolvedValue({ users: { getUser: mocks.user } });
  mocks.user.mockResolvedValue(fixture);
  mocks.profile.mockResolvedValue({ id: playerId, account_closed_at: null });
  mocks.legal.mockResolvedValue({ status: "satisfied" });
  mocks.database.mockReturnValue({ rpc: mocks.rpc });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Ready reviewer telemetry HTTP boundary", () => {
  it.each([
    ["a different preview branch", () => vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/ready")],
    ["Production", () => vi.stubEnv("VERCEL_ENV", "production")],
    ["the wrong database target", () => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://wrong.supabase.co")],
    ["a guest", () => mocks.auth.mockResolvedValue({ userId: null, sessionId: null })],
    ["an ordinary player", () => mocks.user.mockResolvedValue({ ...fixture, privateMetadata: {} })],
    ["a synthetic player outside the configured cohort", () => vi.stubEnv("READY_STAGING_REVIEW_ALIASES", "TestAcademy2")],
    ["a locked reviewer", () => mocks.user.mockResolvedValue({ ...fixture, locked: true })],
    ["a reviewer without an active profile", () => mocks.profile.mockResolvedValue(null)],
    ["a reviewer without the current agreements", () => mocks.legal.mockResolvedValue({ status: "required" })],
  ] as const)("denies choices and event submission for %s", async (_, configure) => {
    configure();
    const responses = await Promise.all([
      getUsage(),
      postUsage(request("usage", { kind: "choice", enabled: true })),
      postUsage(request("usage", event)),
    ]);
    expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it("uses only the server-selected player, destination classification and version at the write boundary", async () => {
    reply("stored");
    const response = await postUsage(request("usage", event));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(mocks.rpc.mock.calls).toEqual([["record_ready_usage_event", {
      p_player: playerId, p_epoch: epoch, p_browser: browserId, p_event: eventId,
      p_type: "action_click", p_category: "match", p_question: null, p_action: "my-match",
      p_destination: "match", p_outcome: null, p_helpful: null, p_answer: null, p_menu: "2", p_catalogue: "1",
    }]]);
  });

  it("rejects a foreign origin, suggestion text and private match data before any database write", async () => {
    expect((await postUsage(request("usage", event, "https://foreign.example.test"))).status).toBe(403);
    for (const badRequest of [
      { ...event, description: "Should Ready cover an extra topic?" },
      { ...event, event: { ...event.event, href: "/matches/private-example" } },
      { ...event, event: { ...event.event, context: { matchId: "private-example" } } },
      { ...event, event: { ...event.event, copyText: "Opponent name and room reference" } },
      { kind: "choice", enabled: true, contact: "private@example.test" },
    ]) {
      expect((await postUsage(request("usage", badRequest))).status).toBe(400);
    }
    expect(mocks.database).not.toHaveBeenCalled();
  });
});

describe("Ready written suggestions HTTP boundary", () => {
  it("sends a deliberate guest submission only to suggestion storage while usage is unavailable", async () => {
    mocks.auth.mockResolvedValue({ userId: null, sessionId: null });
    vi.stubEnv("READY_STAGING_REVIEW_ALIASES", "");
    expect((await getUsage()).status).toBe(403);
    expect(mocks.database).not.toHaveBeenCalled();

    const description = "Could Ready explain how to choose a result format?";
    const suggestion = { submissionId: eventId, description, categoryId: "results" };
    expect((await postUsage(request("usage", suggestion))).status).toBe(400);
    expect((await submitSuggestion(request("suggestions", { ...suggestion, matchId: "private-example" }))).status).toBe(400);
    expect(mocks.database).not.toHaveBeenCalled();

    reply("stored");
    const response = await submitSuggestion(request("suggestions", suggestion));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ saved: true });
    expect(mocks.rpc.mock.calls).toEqual([["submit_ready_topic_suggestion", {
      p_id: eventId, p_description: description, p_category: "results", p_menu: "2", p_catalogue: "1",
      p_rate_key: expect.stringMatching(/^[0-9a-f]{64}$/),
    }]]);
  });
});
