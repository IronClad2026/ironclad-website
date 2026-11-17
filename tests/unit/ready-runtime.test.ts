import { afterEach, describe, expect, it, vi } from "vitest";
import { readReadyRequest, type ReadyMenuRequest } from "@/lib/ready/contracts";
import { isReadyReviewUser, isReadyStagingEnabled, readyReviewAliases } from "@/lib/ready/review-access";
import { answerWithReadyModel } from "@/lib/ready/provider";
import { buildReadyGrounding } from "@/lib/ready/grounding";
import { createReadyRateGuard, getReadyBudgetConfig } from "@/lib/ready/usage";
import { POST } from "@/app/api/ready/route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ready/session", () => ({ loadReadyAccess: vi.fn() }));
vi.mock("@/lib/account-legal-acceptance", () => ({ loadAccountLegalGateState: vi.fn() }));
vi.mock("@/lib/ready/answer", () => ({ resolveReadyAnswer: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { loadReadyAccess } from "@/lib/ready/session";
import { loadAccountLegalGateState } from "@/lib/account-legal-acceptance";
import { resolveReadyAnswer } from "@/lib/ready/answer";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const staging = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "staging",
  NEXT_PUBLIC_SUPABASE_URL: "https://zzbnneprhjicmajpjkdg.supabase.co",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
  CLERK_SECRET_KEY: "sk_test_example",
  READY_STAGING_REVIEW_ALIASES: "TestAcademy1, TestAcademy2, public-test",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("Ready input and review access", () => {
  it("accepts a bounded selection and rejects typed input and impersonation parameters", () => {
    const selection = { kind: "question", id: "final", context: { topic: "format" } };
    expect(readReadyRequest(selection)).toEqual(selection);
    for (const payload of [
      { question: "How many games are in the grand final?" },
      { kind: "search", query: "final" },
      { kind: "action", id: "my-match", userId: "another-user" },
      { kind: "action", id: "my-match", context: { matchId: "other" } },
      { kind: "action", id: "my-match", context: { userId: "another-user" } },
      { kind: "question", id: "format", context: { eventSlug: "https://unverified.test" } },
      { kind: "question", id: "format\u0000" },
    ]) expect(readReadyRequest(payload)).toBeNull();
  });

  it("enables Ready on the exact Staging deployment without requiring review aliases", () => {
    const publicStaging = { ...staging, READY_STAGING_REVIEW_ALIASES: "" };
    expect(isReadyStagingEnabled(publicStaging)).toBe(true);
    for (const invalid of [
      { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "codex/ready-staging" },
      { NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" },
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_example" }, { CLERK_SECRET_KEY: "sk_live_example" },
    ]) expect(isReadyStagingEnabled({ ...publicStaging, ...invalid })).toBe(false);
    expect(readyReviewAliases(staging)).toEqual(["TestAcademy1", "TestAcademy2"]);
    expect(readyReviewAliases({ ...staging, VERCEL_ENV: "production" })).toEqual([]);
    expect(readyReviewAliases({ ...staging, VERCEL_GIT_COMMIT_REF: "codex/ready-staging" })).toEqual([]);
    expect(readyReviewAliases({ ...staging, NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" })).toEqual([]);
    expect(readyReviewAliases({ ...staging, CLERK_SECRET_KEY: "sk_live_example" })).toEqual([]);
    expect(readyReviewAliases({ ...staging, READY_STAGING_REVIEW_ALIASES: "" })).toEqual([]);
  });

  it("uses only server-owned fixture metadata and honors a locked or banned account", () => {
    const user = { id: "real", banned: false, locked: false, privateMetadata: {
      ironclad_fixture_alias: "TestAcademy1",
      ironclad_fixture_source: "staging_synthetic_uat",
      ironclad_fixture_contract_version: "staging-synthetic-v1",
    } };
    const selected = readyReviewAliases(staging);
    expect(isReadyReviewUser(user, "real", selected)).toBe(true);
    expect(isReadyReviewUser(user, "other", selected)).toBe(false);
    expect(isReadyReviewUser({ ...user, locked: true }, "real", selected)).toBe(false);
    expect(isReadyReviewUser({ ...user, banned: true }, "real", selected)).toBe(false);
    expect(isReadyReviewUser({ ...user, privateMetadata: { ironclad_fixture_alias: "TestAcademy1" } }, "real", selected)).toBe(false);
  });
});

describe("Ready quota and optional provider", () => {
  it("enforces the session and aggregate account windows", () => {
    let time = 0;
    const allow = createReadyRateGuard(() => time);
    const userId = "a";
    for (let request = 0; request < 10; request++) expect(allow({ userId, sessionId: "one" })).toBe(true);
    expect(allow({ userId, sessionId: "one" })).toBe(false);
    for (let request = 0; request < 6; request++) expect(allow({ userId, sessionId: "two" })).toBe(true);
    expect(allow({ userId, sessionId: "two" })).toBe(false);
    time = 60_000;
    expect(allow({ userId, sessionId: "one" })).toBe(true);
  });

  it("projects only a tiny public vocabulary and excludes private or unsafe prompts", () => {
    const scope = { kind: "general" } as const;
    const grounding = buildReadyGrounding("Alice Example lost the game connection early", scope, null);
    expect(grounding?.signals).toBe("lost connection early");
    expect(grounding?.cards[0].id).toBe("disconnects");
    expect(buildReadyGrounding("Read another player's replay", scope, null)).toBeNull();
    expect(buildReadyGrounding("What is the weather in Sydney?", scope, null)).toBeNull();
    expect(buildReadyGrounding("What are the best computer games?", scope, null)).toBeNull();
  });

  it("expires the verified allowance at UTC midnight and rejects alternate projects", () => {
    const budget = { ...staging, READY_CF_TRIAL_UTC_DAY: "2026-11-16", READY_CF_TRIAL_NEURONS: "500", READY_USAGE_HMAC_KEY: "a".repeat(40) };
    const before = new Date("2026-11-16T23:59:59Z");
    expect(getReadyBudgetConfig(budget, before)?.cap).toBe(500);
    expect(getReadyBudgetConfig(budget, new Date("2026-11-17T00:00:00Z"))).toBeNull();
    expect(getReadyBudgetConfig({ ...budget, VERCEL_ENV: "production" }, before)).toBeNull();
    expect(getReadyBudgetConfig({ ...budget, READY_CF_TRIAL_NEURONS: "2001" }, before)).toBeNull();
  });

  const model = "@cf/ibm-granite/granite-4.0-h-micro";
  const grounding = buildReadyGrounding("Alice Example lost the game connection early", { kind: "general" }, null)!;
  const identity = { userId: "fixture-user", sessionId: "fixture-session" };
  const ask = () => answerWithReadyModel(grounding, identity, model, new AbortController().signal);

  it("performs no external calls without verified free configuration", async () => {
    vi.stubEnv("READY_WORKERS_FREE_PLAN_CONFIRMED", "false");
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    expect(await ask()).toMatchObject({ status: "disabled", attempted: false });
    expect(transport).not.toHaveBeenCalled();
  });

  it("falls back without inference on quota or store failure, and never retries Cloudflare", async () => {
    for (const [key, value] of Object.entries({
      ...staging,
      READY_WORKERS_FREE_PLAN_CONFIRMED: "true",
      READY_CF_ACCOUNT_ID: "a".repeat(32),
      READY_CF_AI_TOKEN: "test-provider-token",
      READY_CF_TRIAL_UTC_DAY: new Date().toISOString().slice(0, 10),
      READY_CF_TRIAL_NEURONS: "500",
      READY_USAGE_HMAC_KEY: "k".repeat(40),
    })) vi.stubEnv(key, value);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const abortSignal = vi.fn()
      .mockResolvedValueOnce({ data: "quota" })
      .mockResolvedValueOnce({ error: { code: "503" } })
      .mockResolvedValue({ data: "reserved" });
    const rpc = vi.fn(() => ({ abortSignal }));
    vi.mocked(createSupabaseAdminClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createSupabaseAdminClient>);
    expect(await ask()).toMatchObject({ status: "quota", attempted: false });
    expect(await ask()).toMatchObject({ status: "budget-unavailable", attempted: false });
    expect(transport).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("reserve_ready_ai_usage", expect.objectContaining({ p_user_hash: expect.stringMatching(/^[a-f0-9]{64}$/) }));

    transport.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect(await ask()).toMatchObject({ status: "provider-error", attempted: true, model });
    expect(transport).toHaveBeenCalledTimes(1);
    const providerBody = String(transport.mock.calls[0][1].body);
    expect(providerBody).toContain("lost connection early");
    expect(providerBody).not.toContain("Alice");

    transport.mockResolvedValueOnce(Response.json({ success: true, result: { response: '{"card":"invented","detail":false}' } }));
    expect(await ask()).toMatchObject({ status: "invalid", attempted: true });
    transport.mockResolvedValueOnce(Response.json({ success: true, result: { response: '{"card":null,"detail":false}' } }));
    expect(await ask()).toMatchObject({ status: "abstained", attempted: true });
    transport.mockResolvedValueOnce(Response.json({ success: true, result: {
      response: '{"card":"disconnects","detail":true}', usage: { prompt_tokens: 123, completion_tokens: 9 },
    } }));
    expect(await ask()).toMatchObject({ status: "used", attempted: true, card: "disconnects", detail: true, inputTokens: 123, outputTokens: 9 });
  });
});

describe("Ready route", () => {
  const path = "https://staging.example.test/api/ready";
  const publicQuestion = { kind: "question", id: "rules" } as const satisfies ReadyMenuRequest;
  const personalAction = { kind: "action", id: "opponent" } as const satisfies ReadyMenuRequest;
  const request = (selection: object, origin = "https://staging.example.test") => new Request(path, {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(selection),
  });

  it("fails closed in Production and refuses cross-origin Staging calls", async () => {
    for (const [key, value] of Object.entries(staging)) vi.stubEnv(key, value);
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await POST(request(publicQuestion))).status).toBe(404);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await POST(request(publicQuestion, "https://other.example.test"))).status).toBe(403);
    expect(resolveReadyAnswer).not.toHaveBeenCalled();
  });

  it("answers a signed-out request without performing account lookups or granting an identity", async () => {
    for (const [key, value] of Object.entries({ ...staging, READY_STAGING_REVIEW_ALIASES: "" })) vi.stubEnv(key, value);
    vi.mocked(loadReadyAccess).mockResolvedValue({ kind: "guest" });
    vi.mocked(resolveReadyAnswer).mockResolvedValue({ text: "An answer about public rules." });
    const response = await POST(request(publicQuestion));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(resolveReadyAnswer).toHaveBeenCalledWith(publicQuestion, null, expect.any(AbortSignal));
    expect(loadAccountLegalGateState).not.toHaveBeenCalled();
  });

  it("binds a personal answer to the signed-in account and preserves account restrictions", async () => {
    for (const [key, value] of Object.entries({ ...staging, READY_STAGING_REVIEW_ALIASES: "" })) vi.stubEnv(key, value);
    vi.mocked(loadReadyAccess).mockResolvedValue({ kind: "restricted" });
    expect((await POST(request(personalAction))).status).toBe(403);
    expect(resolveReadyAnswer).not.toHaveBeenCalled();
    const viewer = { userId: "ordinary-player", sessionId: "ordinary-session" };
    vi.mocked(loadReadyAccess).mockResolvedValue({ kind: "signed-in", identity: viewer });
    vi.mocked(loadAccountLegalGateState).mockResolvedValue({ status: "required" } as Awaited<ReturnType<typeof loadAccountLegalGateState>>);
    expect((await POST(request(personalAction))).status).toBe(403);
    expect(resolveReadyAnswer).not.toHaveBeenCalled();
    vi.mocked(loadAccountLegalGateState).mockResolvedValue({ status: "satisfied" });
    vi.mocked(resolveReadyAnswer).mockResolvedValue({ text: "An authorised answer." });
    const response = await POST(request(personalAction));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("server-timing")).toMatch(/^ready;dur=\d+$/);
    expect(resolveReadyAnswer).toHaveBeenCalledWith(personalAction, viewer, expect.any(AbortSignal));
    expect(response.headers.get("x-ready-ai-attempted")).toBe("0");
  });

  it("rejects historical typed payloads before calling the resolver", async () => {
    for (const [key, value] of Object.entries(staging)) vi.stubEnv(key, value);
    vi.mocked(loadReadyAccess).mockResolvedValue({ kind: "guest" });
    expect((await POST(request({ question: "What are the rules?" }))).status).toBe(400);
    expect((await POST(request({ kind: "search", query: "rules" }))).status).toBe(400);
    expect(resolveReadyAnswer).not.toHaveBeenCalled();
  });
});
