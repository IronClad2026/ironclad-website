import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), ownerRpc: vi.fn(), publicRpc: vi.fn(), config: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createNoStoreSupabaseClient: () => ({ rpc: mocks.publicRpc }) }));
vi.mock("@/lib/supabase-server", () => ({ createAuthenticatedSupabaseClient: async () => ({ rpc: mocks.ownerRpc }) }));
vi.mock("@/lib/combat-highlights/config", () => ({ mediaConfiguration: mocks.config }));

import { getMyCombatHighlights, getPublicCombatHighlights, parseHighlightsState } from "@/lib/combat-highlights/read";

const playerId = "125a7a44-e834-4ef8-a415-093264053431";
const uploadId = "f104712c-3ce5-478d-aebc-d116ec81f55a";
const clip = { uploadId, title: "A clean flank", durationMs: 12000, width: 1920, height: 1080, fps: 60, contentType: "video/mp4", hasPoster: true };
const privateFields = {
  email: "private-email@example.test", clerk_user_id: "private-clerk-id", legal_receipt: "private-receipt",
  admin_notes: "private-admin-note", moderated_by_clerk_user_id: "private-moderator", ip: "private-ip",
  notification: "private-notification", raw_steam_payload: "private-steam", raw_relic_payload: "private-relic",
  service_role: "private-service-credential", storage_path: "private/video/object.mp4", poster_path: "private/poster/object.jpg",
  signed_url: "https://storage.example.test/private?token=private-token", security_metadata: "private-security",
};
const state = () => ({
  playerId, enabled: true,
  slots: [{ slotNumber: 1, displayOrder: 1, revision: 7, hidden: true, clip, pendingUploadId: null }],
});

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: "owner" });
  mocks.config.mockReturnValue({ origin: "https://media.example.test" });
});

describe("Combat Highlights read contracts", () => {
  it("loads the current owner state without a competitive visibility setting", async () => {
    mocks.ownerRpc.mockResolvedValue({ data: state(), error: null });
    expect(await getMyCombatHighlights()).toEqual(state());
    expect(mocks.ownerRpc).toHaveBeenCalledWith("get_my_player_combat_highlights");
  });

  it("preserves owner-only hidden clip preview state while excluding private metadata", () => {
    const input = { ...state(), ...privateFields };
    input.slots[0] = { ...input.slots[0], ...privateFields, clip: { ...clip, ...privateFields } };
    const result = parseHighlightsState(input);
    expect(result).toEqual(state());
    expect(Object.keys(result!)).toEqual(["playerId", "enabled", "slots"]);
    for (const value of Object.values(privateFields)) expect(JSON.stringify(result)).not.toContain(value);
  });

  it("exposes only bounded competitive clip metadata and the public media proxy", async () => {
    mocks.publicRpc.mockResolvedValue({ data: [{ ...clip, ...privateFields, videoUrl: privateFields.signed_url, posterUrl: privateFields.signed_url }], error: null });
    const result = await getPublicCombatHighlights(playerId);
    expect(result).toEqual([{ ...clip, videoUrl: `https://media.example.test/public/${uploadId}/video`, posterUrl: `https://media.example.test/public/${uploadId}/poster` }]);
    expect(mocks.publicRpc).toHaveBeenCalledWith("get_public_player_combat_highlights", { p_player_id: playerId });
    for (const value of Object.values(privateFields)) expect(JSON.stringify(result)).not.toContain(value);
  });

  it("keeps empty or failed public database projections empty", async () => {
    mocks.publicRpc.mockResolvedValue({ data: [], error: null });
    expect(await getPublicCombatHighlights(playerId)).toEqual([]);
    mocks.publicRpc.mockResolvedValue({ data: [clip], error: { message: "unavailable" } });
    expect(await getPublicCombatHighlights(playerId)).toEqual([]);
  });

  it.each([{ durationMs: 0 }, { durationMs: 15001 }, { fps: 61 }, { width: 1921 }, { height: 1081 }, { uploadId: "invalid" }, { contentType: "application/octet-stream" }])("rejects invalid public clip metadata %o", async (override) => {
    mocks.publicRpc.mockResolvedValue({ data: [{ ...clip, ...override }], error: null });
    expect(await getPublicCombatHighlights(playerId)).toEqual([]);
  });

  it("never queries media without configured access or a valid public player ID", async () => {
    expect(await getPublicCombatHighlights("invalid")).toEqual([]);
    mocks.config.mockReturnValue(null);
    expect(await getPublicCombatHighlights(playerId)).toEqual([]);
    expect(await getMyCombatHighlights()).toBeNull();
    expect(mocks.publicRpc).not.toHaveBeenCalled();
    expect(mocks.ownerRpc).not.toHaveBeenCalled();
  });
});
