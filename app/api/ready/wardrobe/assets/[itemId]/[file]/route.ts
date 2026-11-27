import { getWardrobeAuthority } from "@/lib/wardrobe/access";
import { isWardrobeItem } from "@/lib/wardrobe/catalogue";
import { isReadyWardrobePilotEnabled } from "@/lib/wardrobe/environment";
import { getWardrobeAsset, wardrobeBucket } from "@/lib/wardrobe/storage";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type Context = { params: Promise<{ itemId: string; file: string }> };

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

async function respond(request: Request, { params }: Context) {
  if (!isReadyWardrobePilotEnabled()) return new Response(null, { status: 404, headers });
  const { itemId, file } = await params;
  const asset = isWardrobeItem(itemId) && getWardrobeAsset(itemId, file);
  if (!asset) return new Response(null, { status: 404, headers });
  if (!asset.isPublicTeaser && (await getWardrobeAuthority()).access === "locked") {
    return new Response(null, { status: 403, headers });
  }

  const { data, error } = await createSupabaseAdminClient().storage.from(wardrobeBucket)
    .download(asset.path, {}, { cache: "no-store", signal: request.signal }).asStream();
  if (error || !data) return new Response(null, { status: 503, headers });
  if (request.method === "HEAD") await data.cancel();
  return new Response(request.method === "HEAD" ? null : data, {
    headers: { ...headers, "Content-Type": asset.contentType },
  });
}

export const GET = respond;
export const HEAD = respond;
