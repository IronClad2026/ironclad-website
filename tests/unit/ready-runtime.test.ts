import { afterEach, describe, expect, it, vi } from "vitest";
import { readReadyRequest } from "@/lib/ready/contracts";
import { isReadyReviewUser, readyReviewAliases } from "@/lib/ready/review-access";
import { answerWithReadyModel } from "@/lib/ready/provider";
import { buildReadyGrounding } from "@/lib/ready/grounding";
import { createReadyRateGuard, getReadyBudgetConfig } from "@/lib/ready/usage";
import { POST } from "@/app/api/ready/route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ready/session", () => ({ loadReadySession: vi.fn() }));
vi.mock("@/lib/account-legal-acceptance", () => ({ loadAccountLegalGateState: vi.fn() }));
vi.mock("@/lib/ready/answer", () => ({ resolveReadyAnswer: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { loadReadySession } from "@/lib/ready/session";
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
});

describe("Ready input and review access", () => {
  it("normalises input and rejects excess data, arbitrary IDs and impersonation parameters", () => {
    expect(readReadyRequest({ question: "  What about the final?  ", context: { topic: "format" } }))
      .toEqual({ question: "What about the final?", context: { topic: "format" } });
    for (const payload of [
      { question: "A".repeat(301) },
      { question: "my match", userId: "another-user" },
      { question: "my match", context: { matchId: "other", userId: "another-user" } },
      { question: "format", context: { eventSlug: "https://unverified.test" } },
      { question: "question\u0000" },
    ]) expect(readReadyRequest(payload)).toBeNull();
  });

  it("permits only the opt-in Staging Git ref, exact database and Clerk test mode", () => {
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
  const request = (question: string, origin = "https://staging.example.test") => new Request(path, {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ question }),
  });

  it("fails closed in Production and refuses cross-origin Staging calls", async () => {
    for (const [key, value] of Object.entries(staging)) vi.stubEnv(key, value);
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await POST(request("rules"))).status).toBe(404);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await POST(request("rules", "https://other.example.test"))).status).toBe(403);
    expect(resolveReadyAnswer).not.toHaveBeenCalled();
  });

  it("binds the answer to the authenticated reviewer and sends a private no-store response", async () => {
    for (const [key, value] of Object.entries(staging)) vi.stubEnv(key, value);
    vi.mocked(loadReadySession).mockResolvedValue(null);
    expect((await POST(request("Who am I playing?"))).status).toBe(403);
    const viewer = { userId: "verified", sessionId: "session" };
    vi.mocked(loadReadySession).mockResolvedValue(viewer);
    vi.mocked(loadAccountLegalGateState).mockResolvedValue({ status: "required" } as Awaited<ReturnType<typeof loadAccountLegalGateState>>);
    expect((await POST(request("Who am I playing?"))).status).toBe(403);
    vi.mocked(loadAccountLegalGateState).mockResolvedValue({ status: "satisfied" });
    vi.mocked(resolveReadyAnswer).mockResolvedValue({ text: "An authorised answer." });
    const response = await POST(request("Who am I playing?"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("server-timing")).toMatch(/^ready;dur=\d+$/);
    expect(resolveReadyAnswer).toHaveBeenCalledWith({ question: "Who am I playing?" }, viewer, expect.any(AbortSignal), null);
    expect(response.headers.get("x-ready-ai-attempted")).toBe("0");
  });
});
