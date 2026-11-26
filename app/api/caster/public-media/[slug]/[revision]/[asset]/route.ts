import { CASTER_MEDIA_BUCKET, isCasterMediaId } from "@/lib/caster/application";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { isCasterPublicSlug } from "@/lib/caster/publication";
import { CASTER_PRIVATE_HEADERS, casterRpc } from "@/lib/caster/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const headers = { ...CASTER_PRIVATE_HEADERS, "X-Content-Type-Options": "nosniff" };
const missing = () => new Response(null, { status: 404, headers });
type Params = { params: Promise<{ slug: string; revision: string; asset: string }> };

async function resolvePublishedImage({ params }: Params) {
  const { slug, revision, asset } = await params;
  if (!isCasterProgramEnabled() || !isCasterPublicSlug(slug) || !isCasterMediaId(revision) || !isCasterMediaId(asset)) return null;
  const args = { p_slug: slug, p_publication_id: revision, p_media_id: asset };
  const image = await casterRpc<{ object_path: string; content_type: string }>("caster_phase3_public_media", args);
  if (image?.content_type !== "image/webp" || typeof image.object_path !== "string") return null;
  const [owner, file, extra] = image.object_path.split("/");
  return !extra && isCasterMediaId(owner) && file === `${asset}.webp` ? image.object_path : null;
}

export async function HEAD(_: Request, context: Params) {
  const path = await resolvePublishedImage(context);
  return path ? new Response(null, { headers: { ...headers, "Content-Type": "image/webp" } }) : missing();
}

export async function GET(_: Request, context: Params) {
  const path = await resolvePublishedImage(context);
  if (!path) return missing();
  try {
    const { data, error } = await createSupabaseAdminClient().storage.from(CASTER_MEDIA_BUCKET).download(path);
    // Recheck after the storage call so a concurrent moderation action or
    // replacement can revoke this URL before the bytes leave the application.
    if (error || !data || await resolvePublishedImage(context) !== path) return missing();
    return new Response(data, { headers: { ...headers, "Content-Type": "image/webp" } });
  } catch {
    return missing();
  }
}
