import { CASTER_MEDIA_BUCKET, isCasterMediaId } from "@/lib/caster/application";
import type { CasterMediaResult } from "@/lib/caster/application-media";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { CASTER_PRIVATE_HEADERS, casterRpc, loadCurrentCasterAccount } from "@/lib/caster/server";
import { requireCurrentPatch2Admin } from "@/lib/patch2-admin-access";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const missing = () => new Response(null, { status: 404, headers: CASTER_PRIVATE_HEADERS });

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isCasterProgramEnabled() || !isCasterMediaId(id)) return missing();
  const account = await loadCurrentCasterAccount();
  if (account.status !== "open" || !account.emailVerified) return missing();

  const args = { p_actor: account.id, p_media_id: id };
  let resolved = await casterRpc<CasterMediaResult>("caster_phase2_get_media", { ...args, p_staff: false });
  if (resolved?.status === "not_found") {
    try {
      if (await requireCurrentPatch2Admin() !== account.id) return missing();
    } catch {
      return missing();
    }
    resolved = await casterRpc<CasterMediaResult>("caster_phase2_get_media", { ...args, p_staff: true });
  }
  if (resolved?.status !== "ok" || resolved.media?.state !== "ready") return missing();

  const { data, error } = await createSupabaseAdminClient().storage.from(CASTER_MEDIA_BUCKET).download(resolved.media.object_path);
  if (error || !data) return missing();
  return new Response(data, {
    headers: { ...CASTER_PRIVATE_HEADERS, "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff" },
  });
}
