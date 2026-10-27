import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseQueryMock } from "@/tests/helpers/supabase-query-mock";

const client = vi.hoisted(() => ({ from: vi.fn() }));
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }));
vi.mock("@/lib/supabase", () => ({ createNoStoreSupabaseClient: () => client }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/i18n/request", () => ({ getRequestLocale: async () => "en" }));
vi.mock("@/lib/active-tournament-elo-snapshots", () => ({ getPublicActiveTournamentEloSnapshots: async () => [] }));
vi.mock("@/lib/player-showcase/read", () => ({ getPublicPlayerShowcase: async () => null }));
vi.mock("@/lib/combat-highlights/read", () => ({ getPublicCombatHighlights: async () => [] }));
import { getPublicPlayerById, getPublicPlayers } from "@/lib/public-players";
import PublicPlayerProfilePage from "@/app/players/[playerId]/page";

const id = "11111111-1111-4111-8111-111111111111";
const activeRow = {
  id, display_name: "Competitive Commander", player_name: "LegacyPrivateCommander",
  country: "Australia", region: "Oceania", current_elo: 1450,
  public_profile_enabled: false, discord_public_enabled: false,
  discord_username: "PRIVATE_DISCORD", has_avatar: true,
  avatar_url: "PRIVATE_STORAGE_PATH", created_at: "2026-01-01T00:00:00.000Z",
  email: "PRIVATE_EMAIL", clerk_user_id: "PRIVATE_CLERK_ID", legal_receipts: "PRIVATE_LEGAL_RECEIPTS",
  admin_notes: "PRIVATE_ADMIN_NOTES", moderation_notes: "PRIVATE_MODERATION_NOTES",
  ip_address: "PRIVATE_IP", notifications: "PRIVATE_NOTIFICATIONS",
  steam_payload: "PRIVATE_STEAM_PAYLOAD", relic_payload: "PRIVATE_RELIC_PAYLOAD",
  service_role_key: "PRIVATE_SERVICE_KEY", audit_data: "PRIVATE_AUDIT_DATA",
};

describe("permanent public competitive player visibility", () => {
  beforeEach(() => { client.from.mockReset(); notFound.mockClear(); });

  it.each([true, false])("lists active legacy flag %s profiles with stored ELO and safe identity", async (legacy) => {
    const query = createSupabaseQueryMock({ data: [{ ...activeRow, public_profile_enabled: legacy }] });
    client.from.mockImplementation(query.from);
    const players = await getPublicPlayers();
    expect(players).toMatchObject([{ id, currentElo: 1450, publicProfileEnabled: true, avatarUrl: `/players/${id}/avatar`, discordUsername: null }]);
    expect(query.calls.filter((call) => call.method === "eq")).toEqual([]);
    expect(JSON.stringify(players)).not.toContain("PRIVATE_");
  });

  it("loads the public page identity for an active legacy false profile", async () => {
    const query = createSupabaseQueryMock({ data: activeRow });
    client.from.mockImplementation(query.from);
    expect(await getPublicPlayerById(id)).toMatchObject({ id, playerName: "LegacyPrivateCommander", currentElo: 1450 });
    expect(query.calls.filter((call) => call.method === "eq")).toEqual([{ method: "eq", args: ["id", id] }]);
  });

  it("renders the active legacy false public page with only competitive player props", async () => {
    client.from.mockImplementation(createSupabaseQueryMock({ data: activeRow }).from);
    const page = await PublicPlayerProfilePage({ params: Promise.resolve({ playerId: id }) });
    const playerProps: unknown[] = [];
    function inspect(node: ReactNode): void {
      if (Array.isArray(node)) { node.forEach(inspect); return; }
      if (!isValidElement<{ player?: unknown; children?: ReactNode }>(node)) return;
      if (node.props.player) playerProps.push(node.props.player);
      inspect(node.props.children);
    }
    inspect(page);
    expect(playerProps).toHaveLength(2);
    expect(playerProps).toEqual(expect.arrayContaining([expect.objectContaining({ id, currentElo: 1450 })]));
    expect(JSON.stringify(playerProps)).not.toContain("PRIVATE_");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("keeps a closed or unknown account absent from the active-only public view", async () => {
    client.from.mockImplementation(createSupabaseQueryMock({ data: null }).from);
    await expect(PublicPlayerProfilePage({ params: Promise.resolve({ playerId: id }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("keeps legitimate unrated profiles unrated", async () => {
    client.from.mockImplementation(createSupabaseQueryMock({ data: [{ ...activeRow, current_elo: null }] }).from);
    expect(await getPublicPlayers()).toMatchObject([{ id, currentElo: null }]);
  });

  it("keeps Discord independently opt-in", async () => {
    client.from.mockImplementation(createSupabaseQueryMock({ data: [{ ...activeRow, discord_public_enabled: true, discord_username: "shared.contact" }] }).from);
    expect(await getPublicPlayers()).toMatchObject([{ discordPublicEnabled: true, discordUsername: "shared.contact" }]);
  });

  it("has no competitive privacy mutation or switch and preserves private dashboard capabilities", () => {
    const dashboard = readFileSync(resolve("app/dashboard/page.tsx"), "utf8");
    expect(dashboard).not.toContain("PublicProfileVisibilityCard");
    expect(dashboard).not.toContain("public_profile_enabled");
    expect(existsSync(resolve("app/dashboard/public-profile-actions.ts"))).toBe(false);
    expect(existsSync(resolve("components/PublicProfileVisibilityCard.tsx"))).toBe(false);
    for (const capability of ["DiscordContactVisibilityCard", "DashboardNotifications", "InAppNotificationCenter", "DashboardIdentity", "RegistrationCard", "DashboardCareerHistory"]) expect(dashboard).toContain(capability);
    expect(readFileSync(resolve("app/dashboard/actions.ts"), "utf8")).toContain("updateDiscordPublicEnabled");
  });
});
