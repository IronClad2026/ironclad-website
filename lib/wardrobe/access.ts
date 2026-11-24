import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { loadAccountLegalGateState } from "@/lib/account-legal-acceptance";
import { hasCurrentPatch2AdminAccess } from "@/lib/patch2-admin-access";
import { loadReadyActiveProfile } from "@/lib/ready/platform-data";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { emptyWardrobe, parseWardrobeOutfit, parseWardrobeSelection, pilotWardrobeItems, type WardrobeState } from "./catalogue";
import { isReadyWardrobePilotEnabled } from "./environment";

type WardrobeAuthority =
  | { access: "locked"; sessionId: string | null }
  | { access: "admin" | "subscriber"; sessionId: string; userId: string };

export async function getWardrobeAuthority(): Promise<WardrobeAuthority> {
  let locked: WardrobeAuthority = { access: "locked", sessionId: null };
  if (!isReadyWardrobePilotEnabled()) return locked;
  try {
    const { userId, sessionId, sessionClaims } = await auth();
    locked = { access: "locked", sessionId };
    if (!userId || !sessionId) return locked;
    if ((await loadAccountLegalGateState()).status !== "satisfied") return locked;

    if (await hasCurrentPatch2AdminAccess(userId, sessionClaims, sessionId, false, { refreshClerkAuthority: true })) {
      return { access: "admin", sessionId, userId };
    }

    const at = new Date().toISOString();
    const coverage = await createSupabaseAdminClient().from("ready_wardrobe_pilot_coverage")
      .select("clerk_user_id").eq("clerk_user_id", userId).lte("starts_at", at).gt("ends_at", at)
      .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
    if (coverage.error || coverage.data?.clerk_user_id !== userId) return locked;

    const clerk = await clerkClient();
    const [user, session, profile] = await Promise.all([
      clerk.users.getUser(userId),
      clerk.sessions.getSession(sessionId),
      loadReadyActiveProfile(userId),
    ]);
    if (!profile?.profile_completed || user.id !== userId || user.banned || user.locked ||
      user.privateMetadata.ironclad_fixture_source !== "staging_synthetic_uat" ||
      session.id !== sessionId || session.userId !== userId || session.status !== "active" ||
      !Number.isFinite(session.expireAt) || session.expireAt <= Date.now()) return locked;
    return { access: "subscriber", sessionId, userId };
  } catch {
    return locked;
  }
}

export async function getWardrobeState(): Promise<WardrobeState> {
  const authority = await getWardrobeAuthority();
  const { access, sessionId } = authority;
  if (authority.access === "locked") return { ...emptyWardrobe, sessionId };
  const { data, error } = await createSupabaseAdminClient().from("ready_wardrobe_pilot_profiles")
    .select("item_ids,catalogue_item_ids,dynamite_restore").eq("clerk_user_id", authority.userId)
    .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
  if (error) throw new Error("Could not load the saved Ready wardrobe.");
  const pilot = parseWardrobeSelection(data?.item_ids) ?? [];
  const saved = parseWardrobeOutfit(data?.catalogue_item_ids, data?.dynamite_restore);
  if (!saved) return { access, sessionId, itemIds: pilot };
  const projected = pilotWardrobeItems(saved.itemIds);
  if (projected.length === pilot.length && projected.every(id => pilot.includes(id))) {
    return { access, sessionId, ...saved };
  }
  // A previous build may have saved its three-item projection after a rollback.
  const replacesEyes = pilot.includes("eyewear_smoked_aviators");
  const replacesMouth = pilot.includes("mouth_cigarette");
  const active = saved.itemIds.filter(id => !projected.includes(id) &&
    (!replacesEyes || !id.startsWith("eyewear_")) &&
    (!replacesMouth || id !== "mouth_sparking_dynamite_stick"));
  return { access, sessionId, itemIds: [...active, ...pilot] };
}
