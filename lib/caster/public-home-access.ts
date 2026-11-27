import "server-only";

import { loadAccountLegalGateStateForSubject } from "@/lib/account-legal-acceptance";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isCasterMediaId } from "./application";
import { casterRpc, verifyCasterSessionIdentity } from "./server";

type CasterApplicationPresence = {
  status: string;
  application: { id: string; status: string } | null;
};

const journeyStates = new Set(["draft", "submitted", "changes_requested", "approved"]);

export async function canReadCasterPublicHome(userId: string, sessionId: string): Promise<boolean> {
  try {
    const [caster, player] = await Promise.all([
      casterRpc<CasterApplicationPresence>("caster_phase1_get_application", { p_actor: userId }),
      createSupabaseAdminClient().from("players").select("id").eq("clerk_user_id", userId)
        .abortSignal(AbortSignal.timeout(4000)).maybeSingle(),
    ]);
    if (caster?.status !== "open" || !isCasterMediaId(caster.application?.id) ||
      !journeyStates.has(caster.application.status) || player.error || player.data !== null) return false;

    const [identity, legal] = await Promise.all([
      verifyCasterSessionIdentity(userId, sessionId),
      loadAccountLegalGateStateForSubject(userId),
    ]);
    return identity.status === "open" && identity.emailVerified && Boolean(identity.email) &&
      !identity.administrator && legal.status === "satisfied";
  } catch {
    return false;
  }
}
