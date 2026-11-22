import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, HEAD } from "@/app/api/ready/wardrobe/assets/[itemId]/[file]/route";
import { POST } from "@/app/api/ready/wardrobe/route";
import { parseWardrobeSelection } from "@/lib/wardrobe/catalogue";

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

function asset(file: string, method = "GET") {
  return {
    request: new Request(`${origin}/api/ready/wardrobe/assets/${aviators}/${file}`, { method }),
    context: { params: Promise.resolve({ itemId: aviators, file }) },
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
});
