import { CASTER_APPLICATION_LIMITS as limits, CASTER_MEDIA_BUCKET } from "@/lib/caster/application";
import { isCasterMediaKind, optimizeCasterImage, type CasterMediaResult } from "@/lib/caster/application-media";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { CASTER_PRIVATE_HEADERS, casterRpc, isCasterPostOrigin, loadCurrentCasterAccount, readBoundedCasterBody } from "@/lib/caster/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function reply(status: string, code: number, id?: string) {
  return Response.json({ status, ...(id ? { id } : {}) }, { status: code, headers: CASTER_PRIVATE_HEADERS });
}

export async function POST(request: Request) {
  if (!isCasterProgramEnabled()) return reply("not_found", 404);
  const contentType = request.headers.get("content-type") ?? "";
  if (!isCasterPostOrigin(request) || !/^multipart\/form-data\s*;/i.test(contentType)) return reply("invalid", 403);
  const account = await loadCurrentCasterAccount();
  if (account.status === "signed_out") return reply("signed_out", 401);
  if (account.status === "unavailable") return reply("unavailable", 503);
  if (account.status !== "open" || !account.emailVerified) return reply("closed", 403);

  let form: FormData;
  try {
    const body = await readBoundedCasterBody(request, limits.galleryImage + 16_384);
    if (!body) return reply("invalid", 413);
    form = await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    return reply("invalid", 400);
  }
  const kind = form.get("kind");
  const file = form.get("file");
  if (!isCasterMediaKind(kind) || !(file instanceof File) || [...form.keys()].length !== 2) return reply("invalid", 400);
  const image = await optimizeCasterImage(file, kind);
  if (!image) return reply("invalid_image", 422);

  const reserved = await casterRpc<CasterMediaResult>("caster_phase2_reserve_media", {
    p_actor: account.id, p_kind: kind, p_size: image.length, p_content_type: "image/webp",
  });
  if (!reserved) return reply("unavailable", 503);
  if (reserved.status !== "ok" || !reserved.media) return reply(reserved.status, 409);

  const { media } = reserved;
  try {
    const stored = await createSupabaseAdminClient().storage.from(CASTER_MEDIA_BUCKET)
      .upload(media.object_path, image, { contentType: "image/webp", cacheControl: "0", upsert: false });
    if (stored.error) {
      // A failed response can race a successful write. Keep this reservation
      // charged until operators can reconcile it without deleting user data.
      return reply("unavailable", 503);
    }
    const ready = await casterRpc<CasterMediaResult>("caster_phase2_finish_media", {
      p_actor: account.id, p_media_id: media.id, p_ready: true,
    });
    return ready?.status === "ok" ? reply("ok", 201, media.id) : reply("unavailable", 503);
  } catch {
    return reply("unavailable", 503);
  }
}
