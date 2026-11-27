import { describe, expect, it } from "vitest";
import { isAssistanceBody, parseAssistanceContext, parseAssistanceMutation, parseAssistanceQueue, parseAssistanceRequest } from "@/lib/private-assistance";

const id = (n: number) => `${n.toString().padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const T = id(1);
export const request = {
  id: id(2), roomId: id(3), tournamentId: T, tournamentBracketId: id(4), matchId: id(5),
  tournamentTitle: "Synthetic A", divisionName: "Academy", matchReference: "Round 1 / Match 1",
  reference: "Synthetic A / Academy / Round 1 / Match 1", requesterRegistrationId: id(6), requesterName: "Synthetic Player",
  status: "open", version: 1, lastSequence: 1, createdAt: "2026-11-02T20:00:00Z", updatedAt: "2026-11-02T20:00:00Z",
  resolvedAt: null, contentPurgedAt: null,
};
describe("private assistance response boundaries", () => {
  it("counts Unicode characters and requires visible text", () => {
    expect(isAssistanceBody("😀".repeat(1000))).toBe(true);
    expect(isAssistanceBody("😀".repeat(1001))).toBe(false);
    for (const body of [" ", "\n\t", "\u200b\u2060\u0085", null, 9]) expect(isAssistanceBody(body)).toBe(false);
  });
  it("projects known fields without exporting stored identities", () => {
    expect(parseAssistanceRequest({ ...request, requester_clerk_user_id: "private", body_sha256: "private" })).toEqual(request);
    expect(parseAssistanceRequest({ ...request, status: "resolved" })).toBeNull();
  });
  it("rejects foreign room associations and impossible creation capabilities", () => {
    const context = { newRequestsEnabled: true, canCreate: false, room: request, request, discordUrl: null };
    expect(parseAssistanceContext(context)?.request?.id).toBe(request.id);
    expect(parseAssistanceContext({ ...context, request: { ...request, matchId: id(7) } })).toBeNull();
    expect(parseAssistanceContext({ ...context, canCreate: true })).toBeNull();
    expect(parseAssistanceContext({ ...context, discordUrl: "https://example.com" })).toBeNull();
  });
  it("does not acknowledge unsent text when a thread already exists", () => {
    expect(parseAssistanceMutation({ request, message: null, accepted: false, acceptedClientMessageId: null, duplicate: false })?.accepted).toBe(false);
    expect(parseAssistanceMutation({ request, message: null, accepted: true, acceptedClientMessageId: id(8), duplicate: false })).toBeNull();
  });
  it("requires complete, scoped page counts", () => {
    const queue = { tournamentId: T, requests: [request], counts: { all: 1, open: 1, in_progress: 0, resolved: 0 }, filteredCount: 1,
      page: 1, pageCount: 1, filter: "all", selectedRequest: null, newRequestsEnabled: false };
    expect(parseAssistanceQueue(queue, T)?.counts.all).toBe(1);
    for (const changed of [{ requests: [] }, { pageCount: 2 }, { filteredCount: 2 }, { requests: [{ ...request, tournamentId: id(9) }] },
      { counts: { all: 2, open: 1, in_progress: 0, resolved: 0 } }]) expect(parseAssistanceQueue({ ...queue, ...changed }, T)).toBeNull();
  });
});
