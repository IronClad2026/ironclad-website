"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { parseCoh3MapInput } from "@/lib/coh3-maps";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type CustomClaims = {
  metadata?: { role?: string };
};

export async function saveCoh3Map(formData: FormData) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  await requireCurrentAccountLegalAcceptance();

  const mapId = optionalText(formData, "mapId");
  if (mapId && !isUuid(mapId)) {
    redirect("/admin/maps?notice=invalid-map");
  }

  const parsed = parseCoh3MapInput({
    slug: text(formData, "slug"),
    displayName: text(formData, "displayName"),
    sourceType: text(formData, "sourceType"),
    creatorName: optionalText(formData, "creatorName"),
    gameMode: text(formData, "gameMode"),
    status: text(formData, "status"),
    thumbnailPath: optionalText(formData, "thumbnailPath"),
    sourceReference: optionalText(formData, "sourceReference"),
    adminNote: optionalText(formData, "adminNote"),
  });

  if (!parsed.ok) {
    redirect(
      `/admin/maps?notice=invalid-map&detail=${encodeURIComponent(parsed.error)}`
    );
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("save_coh3_map", {
    p_map_id: mapId,
    p_slug: parsed.value.slug,
    p_display_name: parsed.value.displayName,
    p_source_type: parsed.value.sourceType,
    p_creator_name: parsed.value.creatorName,
    p_game_mode: parsed.value.gameMode,
    p_status: parsed.value.status,
    p_thumbnail_path: parsed.value.thumbnailPath,
    p_source_reference: parsed.value.sourceReference,
    p_admin_note: parsed.value.adminNote,
    p_actor_clerk_user_id: userId,
  });

  if (error) {
    console.error("CoH3 map catalogue save failed.");
    redirect("/admin/maps?notice=save-failed");
  }

  revalidatePath("/admin/maps");
  revalidatePath("/admin/tournaments", "page");
  revalidatePath("/tournaments");
  redirect(`/admin/maps?notice=${mapId ? "updated" : "created"}`);
}

function text(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

function optionalText(formData: FormData, field: string) {
  return text(formData, field) || null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
