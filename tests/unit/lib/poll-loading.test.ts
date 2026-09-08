import { describe, expect, it } from "vitest";
import { isPollListSnapshotComplete, mergePollListSnapshot, parsePollListSnapshot, projectPollListSnapshot, type PollListSnapshot } from "@/lib/poll-loading";
import { makePollProjection, POLL_TEST_TOURNAMENT_ID as tournamentId } from "@/tests/fixtures/poll-recovery";

function snapshot(): PollListSnapshot {
  return { surface: "tournament", tournamentId, public: { status: "loaded", polls: [makePollProjection("public")] },
    private: { status: "loaded", polls: [makePollProjection("viewer")] }, accountState: "active",
    viewerContext: { userId: "user_synthetic", sessionId: "sess_synthetic" } };
}
describe("strict full-list snapshot contract", () => {
  it("roundtrips real camelCase projected public and member models", () => {
    expect(parsePollListSnapshot(JSON.parse(JSON.stringify(snapshot())), "tournament", tournamentId)).toEqual(snapshot());
  });
  it("recognizes genuine empty success and unavailable distinctly", () => {
    const value = snapshot();
    value.public = { status: "loaded", polls: [] };
    value.private = { status: "loaded", polls: [] };
    expect(isPollListSnapshotComplete(value)).toBe(true);
    expect(projectPollListSnapshot(value)).toEqual([]);
    value.private = { status: "unavailable" };
    expect(isPollListSnapshotComplete(value)).toBe(false);
  });
  it("retains a failed half with warning and prefers newly published public state over stale private", () => {
    const old = snapshot();
    const next = { ...snapshot(), private: { status: "unavailable" as const } };
    const merged = mergePollListSnapshot(next, old);
    expect(merged.private).toEqual({ status: "unavailable", polls: old.private.status === "loaded" ? old.private.polls : [] });
    expect(isPollListSnapshotComplete(merged)).toBe(false);
    expect(projectPollListSnapshot(merged)[0].status).toBe("final_decision_published");
    expect(projectPollListSnapshot(merged)[0]).not.toHaveProperty("ballotRevision");
  });
  it("does not retain data across accounts, sessions or tournaments", () => {
    for (const next of [
      { ...snapshot(), viewerContext: { userId: "user_other", sessionId: "sess_other" } },
      { ...snapshot(), viewerContext: { userId: "user_synthetic", sessionId: "sess_other" } },
      { ...snapshot(), tournamentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    ]) {
      next.public = { status: "unavailable" };
      next.private = { status: "unavailable" };
      expect(projectPollListSnapshot(mergePollListSnapshot(next, snapshot()))).toEqual([]);
    }
  });
  it("rejects unknown fields, private fields on public source, mismatched scope and no-op pretend data", () => {
    const value = snapshot();
    const publicPoll = makePollProjection("public");
    for (const invalid of [
      { ...value, raw: "SYNTHETIC_SECRET" },
      { ...value, public: { status: "loaded", polls: [{ ...publicPoll, playerId: "SYNTHETIC_SECRET" }] } },
      { ...value, public: { status: "loaded", polls: [makePollProjection("viewer")] } },
      { ...value, private: { status: "unavailable", polls: [makePollProjection("viewer")] } },
      { ...value, private: { status: "not_applicable" } },
      { ...value, accountState: "missing" },
      { ...value, tournamentId: null },
      { ...value, viewerContext: { userId: "user_synthetic", sessionId: null } },
    ]) expect(parsePollListSnapshot(invalid, "tournament", tournamentId)).toBeNull();
  });
  it("rejects cross-tournament private polls even when their projection is individually valid", () => {
    const value = snapshot();
    value.private = { status: "loaded", polls: [makePollProjection("viewer", { tournament_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })] };
    expect(parsePollListSnapshot(value, "tournament", tournamentId)).toBeNull();
  });
});
