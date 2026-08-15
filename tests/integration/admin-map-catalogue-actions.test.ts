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

import { saveCoh3Map } from "@/app/admin/maps/actions";

function communityMapForm() {
  const formData = new FormData();
  formData.set("slug", "synthetic-community-crossing");
  formData.set("displayName", "Synthetic Community Crossing");
  formData.set("sourceType", "community");
  formData.set("creatorName", "Fixture Cartographer");
  formData.set("gameMode", "1v1");
  formData.set("status", "active");
  formData.set("sourceReference", "workshop:synthetic-feature-a");
  formData.set("adminNote", "Private staging fixture note.");
  return formData;
}

describe("administrator CoH3 map catalogue action", () => {
  beforeEach(() => {
    authMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    redirectMock.mockClear();
    revalidatePathMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("rejects a non-administrator before creating a trusted client", async () => {
    authMock.mockResolvedValue(playerIdentity);

    await expect(saveCoh3Map(communityMapForm())).rejects.toThrow(
      "Unauthorized"
    );
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("preserves manually curated community attribution and a null thumbnail", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    authMock.mockResolvedValue(adminIdentity);
    createSupabaseAdminClientMock.mockReturnValue({ rpc });

    await expect(saveCoh3Map(communityMapForm())).rejects.toThrow(
      "NEXT_REDIRECT:/admin/maps?notice=created"
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_coh3_map", {
      p_map_id: null,
      p_slug: "synthetic-community-crossing",
      p_display_name: "Synthetic Community Crossing",
      p_source_type: "community",
      p_creator_name: "Fixture Cartographer",
      p_game_mode: "1v1",
      p_status: "active",
      p_thumbnail_path: null,
      p_source_reference: "workshop:synthetic-feature-a",
      p_admin_note: "Private staging fixture note.",
      p_actor_clerk_user_id: adminIdentity.userId,
    });
  });

  it("rejects invalid game modes before trusted database access", async () => {
    const formData = communityMapForm();
    formData.set("gameMode", "2v2");
    authMock.mockResolvedValue(adminIdentity);

    await expect(saveCoh3Map(formData)).rejects.toThrow(
      /NEXT_REDIRECT:\/admin\/maps\?notice=invalid-map/
    );
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });
});
