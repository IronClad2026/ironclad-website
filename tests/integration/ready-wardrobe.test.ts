import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, HEAD } from "@/app/api/ready/wardrobe/assets/[itemId]/[file]/route";
import { POST } from "@/app/api/ready/wardrobe/route";
import { parseWardrobeSelection, toggleDynamiteSet, toggleWardrobeItem, visibleWardrobeItems, wardrobeItems, type WardrobeSelection } from "@/lib/wardrobe/catalogue";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  authority: vi.fn(),
  download: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/wardrobe/environment", () => ({ isReadyWardrobePilotEnabled: mocks.enabled }));
vi.mock("@/lib/wardrobe/access", () => ({
  getWardrobeAuthority: mocks.authority,
  getWardrobeState: vi.fn(),
}));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ upsert: mocks.upsert }),
    storage: { from: () => ({ download: mocks.download }) },
  }),
}));

const origin = "https://staging.example";
const aviators = "eyewear_smoked_aviators";
const demoSession = "session-test";
const owner = "player-own";

function asset(file: string, method = "GET", itemId = aviators) {
  return {
    request: new Request(`${origin}/api/ready/wardrobe/assets/${itemId}/${file}`, { method }),
    context: { params: Promise.resolve({ itemId, file }) },
  };
}

function save(input: unknown, requestOrigin = origin) {
  return POST(new Request(`${origin}/api/ready/wardrobe`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: requestOrigin },
    body: JSON.stringify(input),
  }));
}

describe("Ready Wardrobe pilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.authority.mockResolvedValue({ access: "locked", sessionId: null });
    mocks.download.mockImplementation(() => ({
      asStream: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]).stream(), error: null }),
    }));
    mocks.upsert.mockImplementation(() => ({ abortSignal: async () => ({ error: null }) }));
  });

  it("serves only dedicated blur files without checking or exposing an account", async () => {
    const { request, context } = asset("standalone-blur.webp");
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.authority).not.toHaveBeenCalled();
    expect(mocks.download).toHaveBeenCalledWith(`v1/${aviators}/standalone-blur.webp`, {}, expect.anything());
  });

  it("enforces fresh access for sharp images, HEAD and wearable URL requests", async () => {
    const request = asset("wearable.glb");
    const head = asset("fitted.webp", "HEAD");
    expect((await GET(request.request, request.context)).status).toBe(403);
    expect((await HEAD(head.request, head.context)).status).toBe(403);
    expect(mocks.download).not.toHaveBeenCalled();
    mocks.authority.mockResolvedValueOnce({ access: "admin", sessionId: demoSession, userId: owner });
    const file = await GET(request.request, request.context);
    expect(file.status).toBe(200);
    expect(file.headers.get("cache-control")).toContain("private, no-store");
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual([1, 2, 3]);
    expect((await GET(request.request, request.context)).status).toBe(403);
  });

  it("does not reach storage when the pilot is disabled or the file is not in the manifest", async () => {
    const unknown = asset("../fitted.webp");
    expect((await GET(unknown.request, unknown.context)).status).toBe(404);
    mocks.enabled.mockReturnValueOnce(false);
    const teaser = asset("fitted-blur.webp");
    expect((await GET(teaser.request, teaser.context)).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("serves only the two explicitly listed lossless textures behind fresh outfit access", async () => {
    for (const name of ["upper-basecolor.webp", "lower-basecolor.webp"]) {
      const paint = asset(name, "GET", "face_clown_makeup");
      mocks.authority.mockResolvedValueOnce({ access: "locked", sessionId: null });
      expect((await GET(paint.request, paint.context)).status).toBe(403);
      mocks.authority.mockResolvedValueOnce({ access: "subscriber", sessionId: demoSession, userId: owner });
      const response = await GET(paint.request, paint.context);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/webp");
      expect(response.headers.get("cache-control")).toContain("private, no-store");
      expect(mocks.download).toHaveBeenLastCalledWith(`v3/face_clown_makeup/${name}`, {}, expect.anything());
    }
    const unlisted = asset("upper-basecolor.webp", "GET", aviators);
    expect((await GET(unlisted.request, unlisted.context)).status).toBe(404);
  });

  it("saves only the authenticated owner's validated choice and supports removal", async () => {
    const input = { userId: "player-other", sessionId: demoSession, itemIds: [aviators] };
    expect((await save(input)).status).toBe(403);
    mocks.authority.mockResolvedValue({ access: "subscriber", sessionId: demoSession, userId: owner });
    expect((await save({ ...input, sessionId: "stale-session" })).status).toBe(400);
    expect((await save(input, "https://other.example")).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect((await save(input)).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ clerk_user_id: owner, item_ids: [aviators] }),
      { onConflict: "clerk_user_id" },
    );
    expect((await save({ ...input, itemIds: [] })).status).toBe(200);
    expect(mocks.upsert.mock.lastCall?.[0].item_ids).toEqual([]);
  });

  it("keeps pilot IDs unique and supports the verified three-item loadout", () => {
    expect(parseWardrobeSelection([aviators, aviators])).toBeNull();
    expect(parseWardrobeSelection(["unreleased_item"])).toBeNull();
    const complete = [aviators, "mouth_cigarette", "face_clown_makeup"];
    expect(parseWardrobeSelection(complete)).toEqual(complete);
  });

  it("gates every clear catalogue item and dependency while serving separately rendered teasers", async () => {
    expect(wardrobeItems).toHaveLength(20);
    for (const item of wardrobeItems) {
      const sharp = asset("fitted.webp", "GET", item.id);
      const blurred = asset("fitted-blur.webp", "GET", item.id);
      expect((await GET(sharp.request, sharp.context)).status).toBe(403);
      expect((await GET(blurred.request, blurred.context)).status).toBe(200);
    }
    for (const [id, file] of [
      ["headwear_tanker_beret", "helmet-free-r5.glb"],
      ["headwear_open_cranium", "cranium-r2-fitting.glb"],
      ["mouth_cigarette", "repaired-bite.glb"],
      ["face_clown_makeup", "lower-basecolor.png"],
    ]) {
      const dependency = asset(file, "GET", id);
      expect((await GET(dependency.request, dependency.context)).status).toBe(403);
    }
    expect(mocks.download).toHaveBeenCalledWith("v2/tankers_crown/fitted-blur.webp", {}, expect.anything());
  });

  it("hides stock-only mounts with replacement headwear and restores unrelated choices", () => {
    const prior: WardrobeSelection = { itemIds: [aviators, "helmet_trim_lucky_dog_tags", "mouth_cigarette"] };
    const beret = toggleWardrobeItem(prior, "headwear_tanker_beret");
    expect(visibleWardrobeItems(beret)).toEqual([aviators, "headwear_tanker_beret"]);
    const full = toggleWardrobeItem(beret, "headwear_wwii_full_face_helmet");
    expect(visibleWardrobeItems(full)).toEqual(["headwear_wwii_full_face_helmet"]);
    expect(toggleWardrobeItem(full, "headwear_wwii_full_face_helmet")).toEqual(prior);
  });

  it("round-trips the set with either component already equipped and keeps later unrelated edits", async () => {
    const band = "helmet_trim_dynamite_helmet_band";
    const stick = "mouth_sparking_dynamite_stick";
    mocks.authority.mockResolvedValue({ access: "admin", sessionId: demoSession, userId: owner });
    for (const prior of [band, stick] as const) {
      const outfit = toggleDynamiteSet({ itemIds: [prior] });
      expect(visibleWardrobeItems(outfit)).toEqual([band, stick]);
      const response = await save({ sessionId: demoSession, ...outfit });
      expect(response.status).toBe(200);
      const saved = await response.json() as WardrobeSelection;
      expect(mocks.upsert.mock.lastCall?.[0]).toMatchObject({
        item_ids: [], catalogue_item_ids: [band, stick], dynamite_restore: [prior],
      });
      expect(toggleDynamiteSet(toggleWardrobeItem(saved, aviators))).toEqual({ itemIds: [aviators, prior] });
    }
    expect((await save({ sessionId: demoSession, itemIds: [stick], dynamiteRestore: [] })).status).toBe(400);
    expect((await save({ sessionId: demoSession, itemIds: [stick, "mouth_cigarette"] })).status).toBe(400);
  });
});
