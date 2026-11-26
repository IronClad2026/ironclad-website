import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ account: vi.fn(), rpc: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/caster/server", async (original) => ({
  ...(await original<typeof import("@/lib/caster/server")>()),
  loadCurrentCasterAccount: mocks.account,
  casterRpc: mocks.rpc,
}));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({ storage: { from: () => ({ download: mocks.download }) } }),
}));

import { POST as writeProfile } from "@/app/api/caster/profile/route";
import { GET as getMedia, HEAD as headMedia } from "@/app/api/caster/public-media/[slug]/[revision]/[asset]/route";
import { emptyCasterDraft } from "@/lib/caster/application";
import { loadPublicCasterDirectory, loadPublicCasterProfile } from "@/lib/caster/public-directory";
import { CASTER_PROFILE_PATH, casterPublicMediaPath } from "@/lib/caster/publication";
import { casterRouteAccess } from "@/lib/caster/routes";

const origin = "http://localhost:3013";
const actor = "user_publication_fixture";
const media = { slug: "iron-caster", revision: "10000000-0000-4000-8000-000000000001", asset: "20000000-0000-4000-8000-000000000002" };
const assetPath = `30000000-0000-4000-8000-000000000003/${media.asset}.webp`;
const bio = { version: 1, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Tournament commentary 🎙️" }] }] } };
const draft = { ...emptyCasterDraft(), displayName: "Iron Caster", avatar: media.asset, bio, languages: ["English"] };
const publicRow = {
  slug: media.slug, publication_id: media.revision, display_name: "Iron Caster", avatar: media.asset,
  languages: ["English"], games: [], platforms: [], banner: null, bio, experience: "", links: [], videos: [], gallery: [], country: null,
};

function post(body: unknown, requestOrigin = origin) {
  return writeProfile(new Request(origin + CASTER_PROFILE_PATH, {
    method: "POST", headers: { origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
}

function readMedia(method: "GET" | "HEAD" = "GET") {
  const request = new Request(origin + casterPublicMediaPath(media.slug, media.revision, media.asset), { method });
  return (method === "GET" ? getMedia : headMedia)(request, { params: Promise.resolve(media) });
}

beforeEach(() => {
  const env: Record<string, string | undefined> = {
    NODE_ENV: "test", VERCEL: undefined, VERCEL_ENV: undefined, CASTER_PROGRAM_ENABLED: "true", CASTER_PROGRAM_ORIGIN: origin,
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture", CLERK_SECRET_KEY: "sk_test_fixture",
    SUPABASE_SERVICE_ROLE_KEY: "fixture", TRANSACTIONAL_EMAIL_MODE: "disabled", WEB_PUSH_VAPID_PUBLIC_KEY: undefined,
    WEB_PUSH_VAPID_PRIVATE_KEY: undefined, WEB_PUSH_VAPID_SUBJECT: undefined,
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  mocks.account.mockReset().mockResolvedValue({ status: "open", id: actor, emailVerified: true });
  mocks.rpc.mockReset();
  mocks.download.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("Caster publication boundaries", () => {
  it("admits only public Caster reads and does not treat the homepage or competitive paths as Caster exceptions", () => {
    expect(casterRouteAccess("/casters", "GET", true)).toBe("public-page");
    expect(casterRouteAccess("/casters/iron-caster", "HEAD", true)).toBe("public-page");
    expect(casterRouteAccess("/casters/invitation", "GET", true)).toBeNull();
    expect(casterRouteAccess("/casters/iron-caster", "POST", true)).toBeNull();
    expect(casterRouteAccess("/casters/iron-caster/other", "GET", true)).toBeNull();
    expect(casterRouteAccess("/", "GET", true)).toBeNull();
    expect(casterRouteAccess("/tournaments", "GET", true)).toBeNull();
    expect(casterRouteAccess("/casters", "GET", false)).toBeNull();
    expect(casterRouteAccess(casterPublicMediaPath(media.slug, media.revision, media.asset), "HEAD", true)).toBe("public-media");
  });

  it("uses only the authenticated actor and saved version, not caller-supplied ownership fields", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "ok", profile: { draft, version: 2, show_country: false, membership_status: "active" } })
      .mockResolvedValueOnce({ status: "ok" });
    const result = await post({ action: "publish", version: 2, draft: { email: "private" }, actor: "user_other" });
    expect(result.status).toBe(200);
    expect(mocks.rpc.mock.calls).toEqual([
      ["caster_phase3_owner", { p_actor: actor }],
      ["caster_phase3_publish", { p_actor: actor, p_version: 2 }],
    ]);
  });

  it("fails closed for origins, unavailable authority, and moderation", async () => {
    expect((await post({ action: "publish", version: 2 }, "https://outside.example")).status).toBe(403);
    mocks.account.mockResolvedValueOnce({ status: "unavailable" });
    expect((await post({ action: "publish", version: 2 })).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ status: "ok", profile: { draft, version: 2, membership_status: "active", hidden: true } });
    expect(await (await post({ action: "publish", version: 2 })).json()).toEqual({ status: "hidden" });
    mocks.rpc.mockResolvedValueOnce({ status: "ok", profile: { draft, version: 2, membership_status: "suspended" } });
    expect((await post({ action: "publish", version: 2 })).status).toBe(403);
    expect(mocks.rpc.mock.calls.every(([name]) => name === "caster_phase3_owner")).toBe(true);
  });

  it("leaves all private fields out of directory cards and public profiles", async () => {
    const unsafe = { ...publicRow, discord: "verification-only", email: "private@example.test", feedback: "internal", draft, owner_clerk_user_id: actor };
    mocks.rpc.mockResolvedValueOnce([unsafe]).mockResolvedValueOnce(unsafe);
    const cards = await loadPublicCasterDirectory();
    expect(cards).toEqual([{
      slug: media.slug, publication_id: media.revision, display_name: "Iron Caster", avatar: media.asset, languages: ["English"], games: [], platforms: [],
    }]);
    expect(await loadPublicCasterProfile(media.slug)).toEqual(publicRow);
  });

  it("requires the exact eligible revision and a second authorization after the storage read", async () => {
    const image = { object_path: assetPath, content_type: "image/webp" };
    mocks.rpc.mockResolvedValueOnce(image).mockResolvedValueOnce(null);
    mocks.download.mockResolvedValue({ data: new Blob(["image"]), error: null });
    expect((await readMedia()).status).toBe(404);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(assetPath);
    mocks.rpc.mockResolvedValueOnce(image).mockResolvedValueOnce(image);
    const permitted = await readMedia();
    expect(permitted.status).toBe(200);
    expect(permitted.headers.get("cache-control")).toBe("private, no-store");
    expect(permitted.headers.get("content-type")).toBe("image/webp");
    mocks.rpc.mockResolvedValueOnce(null);
    expect((await readMedia("HEAD")).status).toBe(404);
  });
});
