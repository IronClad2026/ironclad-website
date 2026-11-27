import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ account: vi.fn(), rpc: vi.fn(), staff: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/caster/server", async (original) => ({
  ...(await original<typeof import("@/lib/caster/server")>()),
  loadCurrentCasterAccount: mocks.account,
  casterRpc: mocks.rpc,
}));
vi.mock("@/lib/patch2-admin-access", () => ({ requireCurrentPatch2Admin: mocks.staff }));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({ storage: { from: () => ({ download: mocks.download }) } }),
}));

import sharp from "sharp";
import { POST as applicationPost } from "@/app/api/caster/application/route";
import { GET as privateMedia } from "@/app/api/caster/media/[id]/route";
import { CASTER_APPLICATION_PATH, casterMediaPath, emptyCasterDraft } from "@/lib/caster/application";
import { optimizeCasterImage } from "@/lib/caster/application-media";
import { isCompleteCasterDraft, parseCasterDraft } from "@/lib/caster/application-validation";
import { casterRouteAccess } from "@/lib/caster/routes";

const origin = "http://localhost:3013";
const actor = "user_caster_fixture";
const mediaId = "89a15f43-2099-44a8-a4ae-bea6b31ee08e";
const account = { status: "open", id: actor, emailVerified: true };
const biography = (text: string) => ({
  version: 1, doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
});
const submitted = () => ({
  ...emptyCasterDraft(), displayName: "Caster Name", country: "AU", languages: ["English"], avatar: mediaId,
  bio: biography("I cast tournament finals. 🎙️"),
});

function post(payload: unknown, requestOrigin = origin, action = false) {
  const headers = { "Content-Type": "application/json", origin: requestOrigin, ...(action ? { "next-action": "untrusted" } : {}) };
  return applicationPost(new Request(origin + CASTER_APPLICATION_PATH, { method: "POST", headers, body: JSON.stringify(payload) }));
}

function fetchMedia() {
  return privateMedia(new Request(origin + casterMediaPath(mediaId)), { params: Promise.resolve({ id: mediaId }) });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CASTER_PROGRAM_ENABLED", "true");
  vi.stubEnv("CASTER_PROGRAM_ORIGIN", origin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture");
  vi.stubEnv("TRANSACTIONAL_EMAIL_MODE", "disabled");
  for (const key of ["VERCEL", "VERCEL_ENV", "WEB_PUSH_VAPID_PUBLIC_KEY", "WEB_PUSH_VAPID_PRIVATE_KEY", "WEB_PUSH_VAPID_SUBJECT"]) vi.stubEnv(key, undefined);
  mocks.account.mockReset().mockResolvedValue(account);
  mocks.rpc.mockReset();
  mocks.staff.mockReset().mockRejectedValue(new Error("denied"));
  mocks.download.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("caster application validation", () => {
  it("recognises complete drafts and permits genuinely incomplete saves", () => {
    expect(parseCasterDraft(emptyCasterDraft())).toEqual(emptyCasterDraft());
    expect(isCompleteCasterDraft(emptyCasterDraft())).toBe(false);
    expect(isCompleteCasterDraft(parseCasterDraft(submitted())!)).toBe(true);
  });

  it("canonicalizes supported videos and rejects other embeds, HTML and extra private fields", () => {
    const draft = { ...submitted(), videos: ["https://youtu.be/abcdefghijk?t=1", "https://www.twitch.tv/videos/123"] };
    expect(parseCasterDraft(draft)?.videos).toEqual(["https://www.youtube.com/watch?v=abcdefghijk", "https://www.twitch.tv/videos/123"]);
    expect(parseCasterDraft({ ...draft, videos: ["https://youtube.com.bad.test/watch?v=abcdefghijk"] })).toBeNull();
    expect(parseCasterDraft({ ...draft, links: [{ label: "Channel", url: "javascript:alert(1)" }] })).toBeNull();
    expect(parseCasterDraft({ ...draft, bio: "<script>alert(1)</script>" })).toBeNull();
    expect(parseCasterDraft({ ...draft, email: "private@example.test" })).toBeNull();
    expect(parseCasterDraft({ ...draft, country: "ZZ" })).toBeNull();
    expect(parseCasterDraft({ ...draft, gallery: ["foreign-user/image.png"] })).toBeNull();
  });

  it("bounds visible Unicode biography, gallery, and external links", () => {
    expect(parseCasterDraft({ ...submitted(), bio: biography("🎙".repeat(2000)) })).not.toBeNull();
    expect(parseCasterDraft({ ...submitted(), bio: biography("🎙".repeat(2001)) })).toBeNull();
    expect(parseCasterDraft({ ...submitted(), gallery: Array(7).fill(mediaId) })).toBeNull();
    expect(parseCasterDraft({ ...submitted(), links: Array(7).fill({ label: "Other", url: "https://example.test/" }) })).toBeNull();
  });

  it("decodes and strips image metadata and rejects spoofed formats", async () => {
    const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "orange" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const file = new File([new Uint8Array(jpeg)], "profile.jpg", { type: "image/jpeg" });
    const encoded = await optimizeCasterImage(file, "avatar");
    const metadata = await sharp(encoded!).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 48, height: 64 });
    expect(metadata.exif).toBeUndefined();
    const spoof = new File([new Uint8Array(jpeg)], "profile.png", { type: "image/png" });
    expect(await optimizeCasterImage(spoof, "avatar")).toBeNull();
  });
});

describe("caster application and private media access", () => {
  it("keeps the new route methods exact", () => {
    expect(casterRouteAccess(CASTER_APPLICATION_PATH, "POST", true)).toBe("protected-api");
    expect(casterRouteAccess(CASTER_APPLICATION_PATH, "GET", true)).toBeNull();
    expect(casterRouteAccess(casterMediaPath(mediaId), "GET", true)).toBe("protected-api");
    expect(casterRouteAccess(casterMediaPath(mediaId), "POST", true)).toBeNull();
    expect(casterRouteAccess(casterMediaPath(`${mediaId}/other`), "HEAD", true)).toBeNull();
  });

  it("rejects foreign origins, Server Actions and unverified accounts", async () => {
    expect((await post({ action: "save", version: 0, draft: submitted() }, "https://outside.example")).status).toBe(403);
    expect((await post({ action: "submit", version: 1 }, origin, true)).status).toBe(403);
    mocks.account.mockResolvedValue({ ...account, emailVerified: false });
    expect((await post({ action: "submit", version: 1 })).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("freezes the saved version using only the authenticated actor", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "ok", application: { draft_version: 3, draft: submitted() } })
      .mockResolvedValueOnce({ status: "ok" });
    expect((await post({ action: "submit", version: 3, actor: "user_other", draft: emptyCasterDraft() })).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith("caster_phase2_submit", { p_actor: actor, p_expected_version: 3 });
  });

  it("requires ready media owned by the reader or independently verified staff", async () => {
    mocks.rpc.mockResolvedValue({ status: "not_found" });
    expect((await fetchMedia()).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();

    mocks.staff.mockResolvedValue(actor);
    mocks.rpc.mockResolvedValueOnce({ status: "not_found" }).mockResolvedValueOnce({ status: "ok", media: { state: "ready", object_path: "generated.webp" } });
    mocks.download.mockResolvedValue({ data: new Blob(["webp"]), error: null });
    const response = await fetchMedia();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenLastCalledWith("caster_phase2_get_media", { p_actor: actor, p_media_id: mediaId, p_staff: true });
  });
});
