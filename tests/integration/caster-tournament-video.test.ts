import { beforeEach, describe, expect, it, vi } from "vitest";
import { casterRouteAccess } from "@/lib/caster/routes";
import { parseCasterTournamentVideo, parseCasterTournamentVideoAction } from "@/lib/caster/tournament-video";

const mocks = vi.hoisted(() => ({ enabled: true, account: vi.fn(), legal: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/caster/environment", () => ({ isCasterProgramEnabled: () => mocks.enabled }));
vi.mock("@/lib/account-legal-mutation-guard", () => ({ requireCurrentAccountLegalAcceptance: mocks.legal }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/caster/server", () => ({
  CASTER_PRIVATE_HEADERS: { "Cache-Control": "private, no-store" }, casterRpc: mocks.rpc, loadCurrentCasterAccount: mocks.account,
  isCasterPostOrigin: (request: Request) => request.headers.get("origin") === "https://staging.example.com" && !request.headers.has("next-action"),
  readSmallCasterBody: (request: Request) => request.text(),
}));

import { POST } from "@/app/api/caster/tournament-videos/route";

const tournament = "805f4a27-f440-4aa8-ae50-e4d5355e482d";
const media = "4ad9e184-6805-4f2f-870c-ecba8f293d9b";
const division = "45a85e09-636c-4c37-8cc8-03c89c75c7f2";
const match = "4283da5c-8f7e-4824-86e4-6236e6019437";
const url = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
const raw = { id: media, version: 2, title: "Test coverage", description: null, url, tournament_id: tournament,
  tournament_title: "Staging test", tournament_slug: "staging-test", published: true, published_at: "2026-11-27T04:00:00Z" };
const input = { action: "save", title: "Test coverage", url, tournamentId: tournament };
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://staging.example.com/api/caster/tournament-videos", { method: "POST",
    body: JSON.stringify(body), headers: { "Content-Type": "application/json", Origin: "https://staging.example.com", ...headers } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.account.mockResolvedValue({ id: "user_author", status: "open", emailVerified: true });
  mocks.legal.mockResolvedValue(undefined);
});

describe("Caster Tournament Video boundary", () => {
  it("only admits the exact POST handler while the caster feature is enabled", () => {
    const path = "/api/caster/tournament-videos";
    expect(casterRouteAccess(path, "POST", true)).toBe("protected-api");
    expect(casterRouteAccess(path, "GET", true)).toBeNull();
    expect(casterRouteAccess(`${path}/x`, "POST", true)).toBeNull();
    expect(casterRouteAccess(path, "POST", false)).toBeNull();
  });

  it("blocks wrong origin, unrelated server actions and disabled calls before authentication", async () => {
    expect((await POST(request(input, { Origin: "https://other.example" }))).status).toBe(403);
    expect((await POST(request(input, { "next-action": "unrelated" }))).status).toBe(403);
    mocks.enabled = false;
    expect((await POST(request(input))).status).toBe(404);
    expect(mocks.account).not.toHaveBeenCalled();
  });

  it("denies unverified, signed-out, closed and legally ineligible accounts without an RPC", async () => {
    mocks.account.mockResolvedValueOnce({ status: "signed_out" });
    expect((await POST(request(input))).status).toBe(401);
    mocks.account.mockResolvedValueOnce({ status: "closed" });
    expect((await POST(request(input))).status).toBe(403);
    mocks.account.mockResolvedValueOnce({ status: "open", emailVerified: false });
    expect((await POST(request(input))).status).toBe(403);
    mocks.legal.mockRejectedValueOnce(new Error("legal"));
    expect((await POST(request(input))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the authenticated actor and returns both the stable item link and private response", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "ok", media: raw });
    const response = await POST(request({ ...input, actor: "user_other", divisionId: division, matchId: match, url: "https://youtu.be/aqz-KE-bpKQ?t=25" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("caster_media_save", expect.objectContaining({ p_actor: "user_author", p_url: url, p_division_id: division, p_match_id: match }));
    expect((await response.json()).media.tournamentHref).toBe(`/tournaments?tournament=staging-test&tab=media#tournament-media-${media}`);
    expect(mocks.revalidate).toHaveBeenCalledWith("/tournaments");
  });

  it("does not silently treat unapproved, moderated and conflicting operations as publication", async () => {
    for (const [status, code] of [["not_found", 403], ["moderated", 409], ["duplicate", 409], ["profile_required", 422]] as const) {
      mocks.rpc.mockResolvedValueOnce({ status });
      expect((await POST(request(input))).status).toBe(code);
    }
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("rejects unsupported hosts and out-of-shape match or revision requests", () => {
    expect(parseCasterTournamentVideoAction({ ...input, url: "https://youtube.com.example.com/watch?v=aqz-KE-bpKQ" })).toBeNull();
    expect(parseCasterTournamentVideoAction({ ...input, matchId: match })).toBeNull();
    expect(parseCasterTournamentVideoAction({ ...input, mediaId: media, version: 0 })).toBeNull();
  });

  it("accepts immutable public database projections without requiring private revision authority", () => {
    const { version, ...publicRow } = raw;
    expect(parseCasterTournamentVideo(publicRow)).toBeNull();
    expect(parseCasterTournamentVideo(publicRow, true)?.publiclyVisible).toBe(true);
    expect(version).toBe(2);
  });
});
