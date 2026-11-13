import "server-only";

import type { GamingProfilePublication } from "@/lib/gaming-profile-publication";
import type { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

type PublicationClient = Pick<Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>, "rpc">;
type PublicationRead =
  | { status: "available"; publication: GamingProfilePublication | null }
  | { status: "unavailable"; publication: null };

export function isGamingProfilePublicationUiEnabled() {
  return process.env.PATCH2_GAMING_PROFILE_PUBLICATION_ENABLED === "true";
}

export async function readGamingProfilePublication(
  supabase: PublicationClient
): Promise<PublicationRead> {
  try {
    const { data, error } = await supabase
      .rpc("get_my_gaming_profile_publication")
      .abortSignal(AbortSignal.timeout(4_000));
    if (error) return { status: "unavailable", publication: null };
    if (data === null) return { status: "available", publication: null };
    if (!data || typeof data !== "object") return { status: "unavailable", publication: null };

    const { mode, public: isPublic, revision, objectionOpen } = data as Record<string, unknown>;
    if ((mode !== "legacy" && mode !== "new") || typeof isPublic !== "boolean" ||
      typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0 ||
      typeof objectionOpen !== "boolean" || (objectionOpen && isPublic)) {
      return { status: "unavailable", publication: null };
    }

    return { status: "available", publication: { mode, public: isPublic, revision, objectionOpen } };
  } catch {
    return { status: "unavailable", publication: null };
  }
}
