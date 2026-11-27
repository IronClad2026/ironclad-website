import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase-server", () => ({ createAuthenticatedSupabaseClient: mocks.client }));

import { saveLegacyGamingProfilePublication } from "@/app/profile/gaming-profile-publication-action";

function choiceForm(choice = "public", revision = "0", confirmed = true) {
  const form = new FormData();
  form.set("publication", choice);
  form.set("revision", revision);
  if (confirmed) form.set("confirmPublication", "yes");
  return form;
}

function response(data: unknown, error: unknown = null) {
  return { abortSignal: vi.fn().mockResolvedValue({ data, error }) };
}

describe("legacy gaming-profile publication action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReset();
    mocks.auth.mockResolvedValue({ userId: "signed-in-owner", getToken: vi.fn() });
    mocks.client.mockResolvedValue({ rpc: mocks.rpc });
    vi.stubEnv("PATCH2_GAMING_PROFILE_PUBLICATION_ENABLED", "true");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("does not try to publish without an explicit checkbox or with a forged duplicate choice", async () => {
    await expect(saveLegacyGamingProfilePublication({ status: "idle" }, choiceForm("public", "0", false)))
      .resolves.toEqual({ status: "unavailable" });
    const duplicate = choiceForm();
    duplicate.append("publication", "private");
    await expect(saveLegacyGamingProfilePublication({ status: "idle" }, duplicate))
      .resolves.toEqual({ status: "unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sends only choice and expected revision through the authenticated owner's RPC", async () => {
    const publication = { mode: "legacy", public: true, revision: 1, objectionOpen: false };
    mocks.rpc.mockReturnValueOnce(response(true)).mockReturnValueOnce(response(publication));
    const form = choiceForm();
    form.set("playerId", "forged-player");
    await expect(saveLegacyGamingProfilePublication({ status: "idle" }, form))
      .resolves.toEqual({ status: "saved", publication });
    expect(mocks.rpc.mock.calls).toEqual([
      ["set_my_legacy_gaming_profile_publication", { p_public: true, p_expected_revision: 0 }],
      ["get_my_gaming_profile_publication"],
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/players/[playerId]", "page");
  });

  it("returns the latest state on a stale update so the next choice uses the current revision", async () => {
    const publication = { mode: "legacy", public: false, revision: 4, objectionOpen: true };
    mocks.rpc.mockReturnValueOnce(response(false)).mockReturnValueOnce(response(publication));
    await expect(saveLegacyGamingProfilePublication({ status: "idle" }, choiceForm("private", "3", false)))
      .resolves.toEqual({ status: "conflict", publication });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps protection reachable without a publication checkbox and requires a signed-in owner", async () => {
    const publication = { mode: "legacy", public: false, revision: 5, objectionOpen: true };
    mocks.rpc.mockReturnValueOnce(response(true)).mockReturnValueOnce(response(publication));
    await expect(saveLegacyGamingProfilePublication({ status: "idle" }, choiceForm("private", "4", false)))
      .resolves.toEqual({ status: "saved", publication });
    expect(mocks.rpc).toHaveBeenCalledWith("set_my_legacy_gaming_profile_publication", { p_public: false, p_expected_revision: 4 });

    mocks.rpc.mockClear();
    mocks.auth.mockResolvedValueOnce({ userId: null });
    await expect(saveLegacyGamingProfilePublication({ status: "idle" }, choiceForm()))
      .resolves.toEqual({ status: "unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
