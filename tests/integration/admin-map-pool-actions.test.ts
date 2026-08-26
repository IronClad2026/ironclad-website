import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminIdentity, playerIdentity } from "@/tests/fixtures/auth";

const authMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  })
);
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import {
  correctTournamentMapPool,
  publishTournamentMapPools,
} from "@/app/admin/tournaments/map-pool-actions";

const tournamentId = "123e4567-e89b-42d3-a456-426614174000";
const bracketIds = [
  "223e4567-e89b-42d3-a456-426614174000",
  "323e4567-e89b-42d3-a456-426614174000",
  "423e4567-e89b-42d3-a456-426614174000",
];
const mapIds = [
  "523e4567-e89b-42d3-a456-426614174000",
  "623e4567-e89b-42d3-a456-426614174000",
  "723e4567-e89b-42d3-a456-426614174000",
  "823e4567-e89b-42d3-a456-426614174000",
  "923e4567-e89b-42d3-a456-426614174000",
];

function publishFormData() {
  const formData = new FormData();
  formData.set("tournamentId", tournamentId);
  bracketIds.forEach((bracketId) => formData.append("bracketIds", bracketId));
  mapIds.forEach((mapId) => formData.append("mapIds", mapId));
  return formData;
}

function correctionFormData() {
  const formData = new FormData();
  formData.set("tournamentId", tournamentId);
  formData.set("bracketId", bracketIds[0]);
  mapIds.forEach((mapId) => formData.append("mapIds", mapId));
  formData.set("reason", "game_update");
  formData.set("explanation", "A game update made the replaced map unusable.");
  return formData;
}

describe("administrator Division map-pool actions", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    redirectMock.mockClear();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("rejects a non-administrator before creating a trusted client", async () => {
    authMock.mockResolvedValue(playerIdentity);

    await expect(publishTournamentMapPools(publishFormData()))
      .rejects.toThrow("Unauthorized");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("publishes the same distinct pool to several Divisions in one RPC", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(publishTournamentMapPools(publishFormData()))
      .rejects.toThrow(
        `NEXT_REDIRECT:/admin/tournaments/${tournamentId}?section=map-pool&notice=map-pool-published`
      );
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "publish_tournament_bracket_map_pools",
      {
        p_tournament_id: tournamentId,
        p_bracket_ids: bracketIds,
        p_map_ids: mapIds,
        p_actor_clerk_user_id: adminIdentity.userId,
      }
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/tournaments",
      "page"
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/admin/tournaments/${tournamentId}`,
      "page"
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/tournaments", "page");
  });

  it("rejects duplicate map selections before calling the RPC", async () => {
    const rpc = vi.fn();
    const formData = publishFormData();
    formData.append("mapIds", mapIds[0]);
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(publishTournamentMapPools(formData)).rejects.toThrow(
      `NEXT_REDIRECT:/admin/tournaments/${tournamentId}?section=map-pool&notice=map-pool-invalid`
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires a locked correction reason and delegates valid changes", async () => {
    const invalid = correctionFormData();
    invalid.set("reason", "other");
    authMock.mockResolvedValue(adminIdentity);

    await expect(correctTournamentMapPool(invalid)).rejects.toThrow(
      `NEXT_REDIRECT:/admin/tournaments/${tournamentId}?section=map-pool&notice=map-pool-invalid`
    );
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();

    const rpc = vi.fn(async () => ({ data: null, error: null }));
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(correctTournamentMapPool(correctionFormData()))
      .rejects.toThrow(
        `NEXT_REDIRECT:/admin/tournaments/${tournamentId}?section=map-pool&notice=map-pool-corrected`
      );
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "correct_tournament_bracket_map_pool",
      {
        p_tournament_bracket_id: bracketIds[0],
        p_map_ids: mapIds,
        p_reason: "game_update",
        p_explanation: "A game update made the replaced map unusable.",
        p_actor_clerk_user_id: adminIdentity.userId,
      }
    );
  });
});
