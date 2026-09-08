import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tournaments: vi.fn(), community: vi.fn() }));
vi.mock("@/lib/player-polls", () => ({ loadTournamentPollsForRequest: mocks.tournaments, loadCommunityPollsForRequest: mocks.community }));
import { GET } from "@/app/api/polls/route";
const id = "22222222-2222-4222-8222-222222222222";
describe("read-only poll recovery route", () => {
  beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
  it.each(["", "surface=other", "surface=tournament", "surface=tournament&tournamentId=bad", "surface=community&tournamentId=" + id,
    "surface=community&userId=another", "surface=community&surface=tournament", "surface=tournament&tournamentId=" + id + "&tournamentId=" + id])("rejects malformed/scope/identity input: %s", async (query) => {
    expect((await GET(new Request("https://ironclad.invalid/api/polls?" + query))).status).toBe(400);
    expect(mocks.tournaments).not.toHaveBeenCalled(); expect(mocks.community).not.toHaveBeenCalled();
  });
  it("returns the authoritative per-tournament outcome without public caching", async () => {
    const snapshot = { private: { status: "unavailable" }, public: { status: "loaded", polls: [] } };
    mocks.tournaments.mockResolvedValue({ snapshotsByTournament: { [id]: snapshot } });
    const response = await GET(new Request("https://ironclad.invalid/api/polls?surface=tournament&tournamentId=" + id));
    expect(await response.json()).toEqual(snapshot);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie, Authorization");
    expect(mocks.tournaments).toHaveBeenCalledWith([id]);
  });
  it("shares the community server boundary and redacts unexpected failures", async () => {
    mocks.community.mockRejectedValue(new Error("SYNTHETIC_SECRET_TOKEN"));
    const response = await GET(new Request("https://ironclad.invalid/api/polls?surface=community"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("SYNTHETIC_SECRET");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("SYNTHETIC_SECRET");
  });
});
