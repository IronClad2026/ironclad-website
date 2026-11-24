import { getWardrobeAuthority, getWardrobeState } from "@/lib/wardrobe/access";
import { parseWardrobeOutfit, pilotWardrobeItems, type WardrobeSelection } from "@/lib/wardrobe/catalogue";
import { isReadyWardrobePilotEnabled } from "@/lib/wardrobe/environment";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET() {
  if (!isReadyWardrobePilotEnabled()) return Response.json({}, { status: 404, headers });
  try {
    return Response.json(await getWardrobeState(), { headers });
  } catch {
    return Response.json({ error: "Ready’s saved wardrobe could not be loaded." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  if (!isReadyWardrobePilotEnabled()) return Response.json({}, { status: 404, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin ||
    request.headers.get("content-type") !== "application/json") {
    return Response.json({}, { status: 403, headers });
  }
  const authority = await getWardrobeAuthority();
  if (authority.access === "locked") return Response.json({}, { status: 403, headers });

  const reader = request.body?.getReader();
  if (!reader) return Response.json({}, { status: 400, headers });
  let outfit: WardrobeSelection | null;
  try {
    const buffer = new Uint8Array(2048);
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (size + value.length > buffer.length) return Response.json({}, { status: 413, headers });
      buffer.set(value, size);
      size += value.length;
    }
    const input = JSON.parse(new TextDecoder().decode(buffer.subarray(0, size)));
    outfit = input?.sessionId === authority.sessionId
      ? parseWardrobeOutfit(input.itemIds, input.dynamiteRestore)
      : null;
  } catch {
    return Response.json({}, { status: 400, headers });
  } finally {
    void reader.cancel().catch(() => {});
  }
  if (!outfit) return Response.json({}, { status: 400, headers });
  const result = await createSupabaseAdminClient().from("ready_wardrobe_pilot_profiles").upsert({
    clerk_user_id: authority.userId,
    item_ids: pilotWardrobeItems(outfit.itemIds),
    catalogue_item_ids: outfit.itemIds,
    dynamite_restore: outfit.dynamiteRestore ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "clerk_user_id" }).abortSignal(AbortSignal.timeout(4000));
  if (result.error) return Response.json({}, { status: 503, headers });
  return Response.json({ access: authority.access, sessionId: authority.sessionId, ...outfit }, { headers });
}
