import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { saveTournament } from "@/app/admin/tournaments/actions";

const bannerUrl =
  "http://127.0.0.1:54321/storage/v1/object/public/" +
  "tournament-banners/banners/123e4567-e89b-42d3-a456-426614174000.png";

function tournamentFormData(maxPlayers: number) {
  const formData = new FormData();
  formData.set("title", "Eight Player Cup");
  formData.set("description", "Exactly eight players per Division.");
  formData.set("bannerImageUrl", bannerUrl);
  formData.set("status", "upcoming");
  formData.set("format", "1v1");
  formData.set("ruleFormat", "format_a");
  formData.set("resultConfirmationWindowMinutes", "30");
  formData.set("prizePool", "");
  formData.set("academyEnabled", "on");
  formData.set("academyEloRules", "Below 1100 ELO");
  formData.set("academyMaxPlayers", String(maxPlayers));
  return formData;
}

describe("exact eight-player tournament capacity", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReset();
  });

  it("rejects a non-eight Division before creating a trusted client", async () => {
    createSupabaseAdminClientMock.mockImplementation(() => {
      throw new Error("trusted client must not be reached");
    });

    await expect(
      saveTournament({ error: null }, tournamentFormData(16))
    ).resolves.toEqual({
      error: "Academy Bracket launch capacity is fixed at exactly 8 players.",
    });
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });
});
