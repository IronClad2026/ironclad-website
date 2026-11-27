import "server-only";

import type { CasterWorkingResult, PublicCasterCard } from "./publication";
import { casterRpc, loadCurrentCasterAccount } from "./server";

// Only the request-specific portfolio page consumes this boolean. The public
// projection, metadata and media URLs contain no session-dependent fields.
export async function canManagePublishedCasterProfile(profile: Pick<PublicCasterCard, "slug" | "publication_id">): Promise<boolean> {
  const account = await loadCurrentCasterAccount();
  if (account.status !== "open" || !account.emailVerified) return false;
  const owner = await casterRpc<CasterWorkingResult>("caster_phase3_owner", { p_actor: account.id });
  const current = owner?.profile;
  return owner?.status === "ok" && current?.membership_status === "active" && !current.hidden &&
    current.slug === profile.slug && current.publication_id === profile.publication_id;
}
