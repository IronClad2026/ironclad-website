import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({ config: vi.fn(), adminClient: vi.fn(), rpc: vi.fn(), sign: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/combat-highlights/config", () => ({ mediaConfiguration: mocks.config }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.adminClient }));
vi.mock("@/lib/combat-highlights/signing", () => ({ signMediaGrant: mocks.sign }));

import { GET, dynamic, maxDuration, runtime } from "@/app/api/cron/combat-highlights-cleanup/route";

const secret = "synthetic-only-cron-secret";
const uploadId = "11111111-1111-4111-8111-111111111111";
const claimToken = "22222222-2222-4222-8222-222222222222";
const config = { origin: "https://media.example.test", allowedOrigins: ["https://app.example.test"] };
const request = (authorization: string | null = `Bearer ${secret}`, suffix = "", method = "GET") => new Request(`https://app.example.test/api/cron/combat-highlights-cleanup${suffix}`, {
  method, headers: authorization === null ? {} : { authorization },
});

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", secret);
  mocks.config.mockReturnValue(config);
  mocks.adminClient.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.sign.mockResolvedValue("synthetic-scoped-delete-grant");
  mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Combat Highlights protected scheduled cleanup", () => {
  it("schedules only the exact protected media cleanup path every five minutes", () => {
    const configuration = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    expect(configuration.crons).toEqual([
      { path: "/api/cron/combat-highlights-cleanup", schedule: "*/5 * * * *" },
    ]);
  });

  it("uses uncached Node execution with a bounded function duration", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(60);
  });

  it.each([null, "", "Basic synthetic-only-cron-secret", "bearer synthetic-only-cron-secret", "Bearer", "Bearer wrong", "Bearer " + "x".repeat(4000), "Bearer synthetic-only-cron-secret, Bearer other"])("rejects malformed or wrong authorization %s before any provider work", async (authorization) => {
    const response = await GET(request(authorization));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.adminClient).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(["", "   "])("fails closed when the configured secret is blank", async (configured) => {
    vi.stubEnv("CRON_SECRET", configured);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the configured secret is missing", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not run cleanup for an implicit HEAD request", async () => {
    expect((await GET(request(`Bearer ${secret}`, "", "HEAD"))).status).toBe(405);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps disabled or unprovisioned media idle even with correct cron authorization", async () => {
    mocks.config.mockReturnValue(null);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 0 });
    expect(mocks.adminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("claims at most ten due jobs and returns only the completed count", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ uploadId, claimToken }], error: null })
      .mockResolvedValueOnce({ data: { code: "saved" }, error: null });
    const response = await GET(request(undefined, "?limit=9999"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 1 });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "claim_player_combat_highlight_cleanup", { p_limit: 10 });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "finish_player_combat_highlight_cleanup", {
      p_upload_id: uploadId, p_claim_token: claimToken, p_deleted: true, p_error_code: null,
    });
    expect(mocks.sign).toHaveBeenCalledWith(expect.objectContaining({ op: "delete", id: uploadId, size: 0 }));
    expect(mocks.fetch).toHaveBeenCalledWith(config.origin + "/internal/" + uploadId + "/video", expect.objectContaining({ method: "DELETE", redirect: "error" }));
  });

  it("retains a due cleanup job for retry when the media provider fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ uploadId, claimToken }], error: null })
      .mockResolvedValueOnce({ data: { code: "saved" }, error: null });
    mocks.fetch.mockRejectedValue(new Error("private-provider-secret"));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 0 });
    expect(mocks.rpc).toHaveBeenLastCalledWith("finish_player_combat_highlight_cleanup", {
      p_upload_id: uploadId, p_claim_token: claimToken, p_deleted: false, p_error_code: "provider-unavailable",
    });
  });

  it("sanitizes unexpected failures without returning identifiers or exception details", async () => {
    mocks.adminClient.mockImplementation(() => { throw new Error("private-provider-secret:" + uploadId); });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("repeated invocations with no due jobs do not sign or delete any object", async () => {
    for (let n = 0; n < 2; n++) expect(await (await GET(request())).json()).toEqual({ deleted: 0 });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith("claim_player_combat_highlight_cleanup", { p_limit: 10 });
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
