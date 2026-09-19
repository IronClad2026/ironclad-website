import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), admin: vi.fn(), notify: vi.fn(), history: vi.fn(), legal: vi.fn(), profile: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/notifications", () => ({ createInAppNotification: mocks.notify }));
vi.mock("@/app/tournaments/room-actions", () => ({ getMatchRoomHistory: mocks.history }));
vi.mock("@/lib/account-legal-mutation-guard", () => ({ requireCurrentAccountLegalAcceptance: mocks.legal }));
vi.mock("@/lib/public-players", () => ({ getPublicPlayerById: mocks.profile }));

import { getMatchRoomOpponentDiscord, requestMatchAdminAssistance } from "@/app/tournaments/support-actions";

const MATCH = "11111111-1111-4111-8111-111111111111";
const ROOM = "22222222-2222-4222-8222-222222222222";
const REG = "33333333-3333-4333-8333-333333333333";
const OPPONENT = "44444444-4444-4444-8444-444444444444";
const TOURNAMENT = "55555555-5555-4555-8555-555555555555";
const PROFILE = "66666666-6666-4666-8666-666666666666";
const input = { matchId: MATCH, roomId: ROOM, roomRevision: 1 };
const room = {
  id: ROOM, matchId: MATCH, roomRevision: 1, viewerRegistrationId: REG,
  playerOneRegistrationId: REG, playerTwoRegistrationId: OPPONENT,
  closedAt: "2026-09-01T00:00:00Z", writable: false,
};

function client() {
  const queries: { table: string; filters: [string, unknown][] }[] = [];
  const from = vi.fn((table: string) => {
    const query = { table, filters: [] as [string, unknown][] };
    queries.push(query);
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => { query.filters.push([key, value]); return builder; },
      limit: () => builder,
      maybeSingle: async () => ({
        error: null,
        data: table === "tournament_matches"
          ? { id: MATCH, match_number: 3, status: "completed", player_one_registration_id: OPPONENT, player_two_registration_id: PROFILE }
          : { id: REG, tournament_id: TOURNAMENT, tournament_title: "Fixture Cup", player_name: "Original Player", profile_id: PROFILE },
      }),
    };
    return builder;
  });
  return { from, queries };
}

describe("room-scoped admin assistance and optional contact", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_original" });
    mocks.legal.mockResolvedValue(undefined);
    mocks.history.mockResolvedValue({ ok: true, data: { room } });
    mocks.notify.mockResolvedValue(true);
    mocks.admin.mockReturnValue(client());
  });

  it("requires authentication before private room access", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await requestMatchAdminAssistance(input)).code).toBe("auth_required");
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("rejects unauthorized historical access before any service query", async () => {
    mocks.history.mockResolvedValue({ ok: false, code: "forbidden" });
    expect((await requestMatchAdminAssistance(input)).code).toBe("participant_only");
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("binds the exact room to the match and revision", async () => {
    expect((await requestMatchAdminAssistance({ ...input, roomRevision: 2 })).code).toBe("invalid_request");
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.history).toHaveBeenCalledWith({ roomId: ROOM, afterSequence: 0, limit: 1 });
  });

  it("does not allow a nonparticipant admin to impersonate a participant", async () => {
    mocks.history.mockResolvedValue({ ok: true, data: { room: { ...room, viewerRegistrationId: null } } });
    expect((await requestMatchAdminAssistance(input)).code).toBe("participant_only");
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("permits original participants after completion or replacement and scopes service reads", async () => {
    const db = client();
    mocks.admin.mockReturnValue(db);
    expect((await requestMatchAdminAssistance(input)).success).toBe(true);
    expect(db.queries).toEqual([
      { table: "tournament_matches", filters: [["id", MATCH]] },
      { table: "registrations", filters: [["id", REG], ["clerk_user_id", "user_original"]] },
    ]);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({
      matchId: MATCH, registrationId: REG,
      eventKey: "match-room:" + ROOM + ":revision:1:registration:" + REG + ":admin-assistance",
      metadata: { source: "tournament_match_workspace", roomId: ROOM, roomRevision: 1 },
    }));
  });

  it("retries share one event key and never derive new cycles from notification dismissal", async () => {
    await requestMatchAdminAssistance(input);
    await requestMatchAdminAssistance(input);
    expect(mocks.notify.mock.calls[0][0].eventKey).toBe(mocks.notify.mock.calls[1][0].eventKey);
    expect(mocks.admin.mock.results[0].value.from).not.toHaveBeenCalledWith("notifications");
  });

  it("fails safely for legal and notification failures", async () => {
    mocks.legal.mockRejectedValue(new Error("blocked"));
    expect((await requestMatchAdminAssistance(input)).success).toBe(false);
    expect(mocks.history).not.toHaveBeenCalled();
    mocks.legal.mockResolvedValue(undefined);
    mocks.notify.mockResolvedValue(false);
    expect((await requestMatchAdminAssistance(input)).code).toBe("request_failed");
  });

  it("fetches contact using the fixed opponent and current public privacy projection on every click", async () => {
    const db = client();
    mocks.admin.mockReturnValue(db);
    mocks.profile.mockResolvedValueOnce({ publicProfileEnabled: true, discordPublicEnabled: true, discordUsername: "shared.name" });
    expect(await getMatchRoomOpponentDiscord({ roomId: ROOM })).toEqual({ discordUsername: "shared.name" });
    expect(db.queries[0]).toEqual({ table: "registrations", filters: [["id", OPPONENT]] });
    expect(mocks.profile).toHaveBeenCalledWith(PROFILE);
    mocks.profile.mockResolvedValueOnce(null);
    expect(await getMatchRoomOpponentDiscord({ roomId: ROOM })).toEqual({ discordUsername: null });
  });

  it("never returns hidden contact or queries profiles for unauthorized room access", async () => {
    mocks.profile.mockResolvedValue({ publicProfileEnabled: true, discordPublicEnabled: false, discordUsername: "private.name" });
    expect(await getMatchRoomOpponentDiscord({ roomId: ROOM })).toEqual({ discordUsername: null });
    mocks.history.mockResolvedValue({ ok: false, code: "forbidden" });
    mocks.profile.mockClear();
    expect(await getMatchRoomOpponentDiscord({ roomId: ROOM })).toEqual({ discordUsername: null });
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});
