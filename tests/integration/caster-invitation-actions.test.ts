import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), clerk: vi.fn(), rpc: vi.fn(), legal: vi.fn(), staff: vi.fn(), enabled: true,
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, clerkClient: mocks.clerk }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/account-legal-mutation-guard", () => ({ requireCurrentAccountLegalAcceptance: mocks.legal }));
vi.mock("@/lib/patch2-admin-access", () => ({ requireCurrentPatch2Admin: mocks.staff }));
vi.mock("@/lib/caster/environment", () => ({
  getCasterInvitationOrigin: () => mocks.enabled ? "https://staging.invalid" : null,
  isCasterProgramEnabled: () => mocks.enabled,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { POST as prepare } from "@/app/api/caster/invitation/prepare/route";
import { POST as claim } from "@/app/api/caster/invitation/claim/route";
import { updateCasterInvitation } from "@/app/admin/casters/actions";
import { isCasterRequestAtOrigin } from "@/lib/caster/request-origin";
import { CONTINUATION_COOKIE, createInvitationContinuation, digestInvitationSecret, generateInvitationSecret, readInvitationContinuation } from "@/lib/caster/invitation-secret";

const origin = "https://staging.invalid";
const actor = "user_synthetic_caster";
const expires = "2026-11-27T11:00:00Z";
const sessionExpiry = Date.parse("2026-11-28T11:00:00Z");
let secret: string;

function rpcHandler(name: string) {
  const data: Record<string, unknown> = {
    caster_phase1_account_open: true,
    caster_phase1_prepare: { status: "valid", expires_at: expires },
    caster_phase1_claim: { status: "claimed" },
    caster_phase1_issue: { status: "issued" },
    caster_phase1_revoke: { status: "revoked" },
  };
  return { abortSignal: async () => ({ data: data[name], error: null }) };
}

function clerkUser(verification = "verified") {
  mocks.clerk.mockResolvedValue({
    users: { getUser: async () => ({
      id: actor, primaryEmailAddressId: "email_id", emailAddresses: [{ id: "email_id", emailAddress: "caster@example.invalid", verification: { status: verification } }],
    }) },
    sessions: { getSession: async () => ({ id: "sess_test", userId: actor, status: "active", expireAt: sessionExpiry }) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(new Date("2026-11-26T11:00:00Z"));
  vi.stubEnv("CASTER_CONTINUATION_KEY", generateInvitationSecret());
  mocks.enabled = true;
  mocks.auth.mockResolvedValue({ userId: actor, sessionId: "sess_test" });
  mocks.legal.mockResolvedValue(undefined);
  mocks.staff.mockResolvedValue("user_synthetic_admin");
  mocks.rpc.mockImplementation(rpcHandler);
  clerkUser();
  secret = generateInvitationSecret();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function prepareRequest(value = secret, source = origin) {
  return new Request(`${origin}/api/caster/invitation/prepare`, {
    method: "POST", headers: { Origin: source, "Content-Type": "application/json" }, body: JSON.stringify({ secret: value }),
  });
}

function claimRequest(cookie?: string, options?: { account?: string; source?: string; accept?: string }) {
  return new NextRequest(`${origin}/api/caster/invitation/claim`, {
    method: "POST", headers: {
      Origin: options?.source ?? origin,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(cookie ? { Cookie: `${CONTINUATION_COOKIE}=${cookie}` } : {}),
    },
    body: new URLSearchParams({ accept: options?.accept ?? "yes", account: options?.account ?? actor }),
  });
}

describe("caster invitation route handlers", () => {
  it("accepts Next's internal loopback alias only with the exact incoming host", () => {
    const origin = "http://127.0.0.1:4073";
    const correct = new Request("http://localhost:4073/api/caster/invitation/prepare", { headers: { host: "127.0.0.1:4073" } });
    const wrong = new Request("http://localhost:4073/api/caster/invitation/prepare", { headers: { host: "localhost:4073" } });
    const internal = new Request("http://localhost:4073/caster-studio", { headers: { host: "localhost:4073", "x-forwarded-host": "127.0.0.1:4073" } });
    expect(isCasterRequestAtOrigin(correct, origin)).toBe(true);
    expect(isCasterRequestAtOrigin(internal, origin)).toBe(true);
    expect(isCasterRequestAtOrigin(wrong, origin)).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isCasterRequestAtOrigin(correct, origin)).toBe(false);
    expect(isCasterRequestAtOrigin(internal, origin)).toBe(false);
  });

  it("prepares without a claim, stores only a sealed continuation, then claims the selected account", async () => {
    const result = await prepare(prepareRequest());
    expect(await result.json()).toEqual({ status: "ready" });
    const cookie = result.cookies.get(CONTINUATION_COOKIE)!;
    expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax", path: "/", maxAge: 1800 });
    expect(cookie).not.toHaveProperty("domain");
    expect(result.headers.get("set-cookie")).not.toContain(secret);
    expect(cookie.value).not.toContain(digestInvitationSecret(secret));
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("caster_phase1_prepare", {
      p_token_digest: digestInvitationSecret(secret), p_rate_key: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const accepted = await claim(claimRequest(cookie.value));
    expect(accepted.status).toBe(303);
    expect(accepted.headers.get("location")).toBe(`${origin}/caster-studio?claim=claimed`);
    expect(accepted.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(mocks.rpc).toHaveBeenCalledWith("caster_phase1_claim", { p_actor: actor, p_token_digest: digestInvitationSecret(secret) });
    expect(mocks.legal).toHaveBeenCalledOnce();
  });

  it("rejects disabled routes, foreign origins, and malformed or oversized input before querying the database", async () => {
    expect((await prepare(prepareRequest(secret, "https://wrong.invalid"))).status).toBe(403);
    expect((await prepare(prepareRequest("too-short"))).status).toBe(400);
    expect((await prepare(prepareRequest("x".repeat(512)))).status).toBe(400);
    expect((await claim(claimRequest(undefined, { source: "https://wrong.invalid" }))).status).toBe(403);
    expect((await claim(claimRequest(undefined, { accept: "no" }))).status).toBe(400);
    mocks.enabled = false;
    expect((await prepare(prepareRequest())).status).toBe(404);
    expect((await claim(claimRequest())).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["signed out", "signed_out"], ["unverified", "unverified"], ["closed", "closed"],
    ["unavailable legal evidence", "unavailable"], ["changed selected account", "account_changed"],
  ])("rejects claim when %s", async (condition, status) => {
    const continuation = createInvitationContinuation(digestInvitationSecret(secret), expires)!;
    if (condition === "signed out") mocks.auth.mockResolvedValue({});
    if (condition === "unverified") clerkUser("unverified");
    if (condition === "closed") mocks.rpc.mockImplementation((name: string) => name === "caster_phase1_account_open" ? { abortSignal: async () => ({ data: false }) } : rpcHandler(name));
    if (condition === "unavailable legal evidence") mocks.legal.mockRejectedValue(new Error("Unavailable"));
    const options = condition === "changed selected account" ? { account: "another_user" } : undefined;
    expect((await claim(claimRequest(continuation.value, options))).headers.get("location")).toBe(`${origin}/caster-studio?claim=${status}`);
    expect(mocks.rpc.mock.calls.some(([name]) => name === "caster_phase1_claim")).toBe(false);
  });

  it("bounds continuation to the invite expiration and rejects modified and expired cookies", () => {
    const digest = digestInvitationSecret(secret);
    const continuation = createInvitationContinuation(digest, "2026-11-26T11:10:00Z")!;
    expect(continuation.maxAge).toBe(600);
    expect(readInvitationContinuation(continuation.value)).toBe(digest);
    const modified = `${continuation.value[0] === "A" ? "B" : "A"}${continuation.value.slice(1)}`;
    expect(readInvitationContinuation(modified)).toBeNull();
    expect(readInvitationContinuation(continuation.value, Date.parse("2026-11-26T11:10:00Z"))).toBeNull();
  });

  it.each(["invalid", "expired", "revoked", "claimed", "rate_limited"])("reports %s without a continuation or claimant identity", async (status) => {
    mocks.rpc.mockReturnValue({ abortSignal: async () => ({ data: { status, claimed_by: "private" } }) });
    const result = await prepare(prepareRequest());
    expect(await result.json()).toEqual({ status: status === "rate_limited" ? "limited" : status });
    expect(result.cookies.get(CONTINUATION_COOKIE)?.maxAge).toBe(0);
  });
});

describe("caster invitation administrator actions", () => {
  it("issues and replaces, returning a fragment link and one-time recovery secret without persisting either", async () => {
    const issue = new FormData();
    issue.set("intent", "issue");
    const result = await updateCasterInvitation({ kind: "idle" }, issue);
    expect(result.kind).toBe("ok");
    const issued = result.issued!;
    expect(issued.link).toBe(`${origin}/casters/invitation#invite=${issued.recovery}`);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("caster_phase1_issue", {
      p_actor: "user_synthetic_admin", p_reference: null, p_replaces: null, p_token_digest: digestInvitationSecret(issued.recovery),
    });
    issue.set("intent", "replace");
    issue.set("invitation", "41378a47-fda5-4971-90c5-7d39ec217719");
    const replacement = await updateCasterInvitation({ kind: "idle" }, issue);
    expect(replacement.issued?.recovery).not.toBe(issued.recovery);
    issue.set("intent", "revoke");
    const revoked = await updateCasterInvitation({ kind: "idle" }, issue);
    expect(revoked).toEqual({ kind: "ok", message: "Invitation revoked." });
  });

  it("checks staff authority before creating or retrieving a secret", async () => {
    mocks.staff.mockRejectedValue(new Error("Denied"));
    const issue = new FormData();
    issue.set("intent", "issue");
    await expect(updateCasterInvitation({ kind: "idle" }, issue)).resolves.toMatchObject({ kind: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
