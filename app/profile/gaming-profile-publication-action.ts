"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import type { GamingProfilePublicationActionState } from "@/lib/gaming-profile-publication";
import { isGamingProfilePublicationUiEnabled, readGamingProfilePublication } from "@/lib/gaming-profile-publication-server";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

export async function saveLegacyGamingProfilePublication(
  _previous: GamingProfilePublicationActionState,
  form: FormData
): Promise<GamingProfilePublicationActionState> {
  if (!isGamingProfilePublicationUiEnabled()) return { status: "unavailable" };

  const choices = form.getAll("publication");
  const revisions = form.getAll("revision");
  const [choice] = choices;
  const [revision] = revisions;
  const confirmations = form.getAll("confirmPublication");
  if (choices.length !== 1 || (choice !== "public" && choice !== "private") ||
    revisions.length !== 1 || typeof revision !== "string" || !/^(0|[1-9]\d{0,15})$/.test(revision) ||
    !Number.isSafeInteger(Number(revision)) ||
    (choice === "public" && (confirmations.length !== 1 || confirmations[0] !== "yes"))) {
    return { status: "unavailable" };
  }

  const expectedRevision = Number(revision);
  try {
    const { userId, getToken } = await auth();
    if (!userId) return { status: "unavailable" };

    const supabase = await createAuthenticatedSupabaseClient(getToken);
    const { data, error } = await supabase.rpc("set_my_legacy_gaming_profile_publication", {
      p_public: choice === "public",
      p_expected_revision: expectedRevision,
    }).abortSignal(AbortSignal.timeout(4_000));

    const { publication } = await readGamingProfilePublication(supabase);
    if (!error && data === true) {
      revalidatePath("/players");
      revalidatePath("/players/[playerId]", "page");
      revalidatePath("/rankings");
      revalidatePath("/tournaments");
      return publication ? { status: "saved", publication } : { status: "unavailable" };
    }
    if (publication && publication.revision !== expectedRevision) {
      return { status: "conflict", publication };
    }
    return publication ? { status: "unavailable", publication } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
