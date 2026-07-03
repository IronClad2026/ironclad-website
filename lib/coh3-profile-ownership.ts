import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const COH3_PROFILE_ALREADY_LINKED_MESSAGE =
  "This coh3stats profile is already linked to another IronClad account.";

export const COH3_PROFILE_LINKED_ACCOUNT_MISMATCH_MESSAGE =
  "Use the coh3stats profile linked to your IronClad account.";

export type Coh3ProfileOwnershipCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "already_linked" | "linked_account_mismatch" | "lookup_failed";
      message: string;
    };

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function checkCoh3ProfileOwnership({
  supabase,
  profileId,
  playerId,
  linkedProfileId,
}: {
  supabase: SupabaseAdminClient;
  profileId: string;
  playerId: string;
  linkedProfileId?: string | null;
}): Promise<Coh3ProfileOwnershipCheck> {
  if (linkedProfileId && linkedProfileId !== profileId) {
    return {
      ok: false,
      reason: "linked_account_mismatch",
      message: COH3_PROFILE_LINKED_ACCOUNT_MISMATCH_MESSAGE,
    };
  }

  const { data, error } = await supabase.rpc("find_coh3_profile_owner", {
    p_profile_id: profileId,
    p_exclude_player_id: playerId,
  });

  if (error) {
    console.error("COH3 profile ownership lookup failed:", error);
    return {
      ok: false,
      reason: "lookup_failed",
      message:
        "Could not verify the coh3stats profile right now. Please try again later.",
    };
  }

  const owner = Array.isArray(data) ? data[0] : data;

  if (owner?.id) {
    return {
      ok: false,
      reason: "already_linked",
      message: COH3_PROFILE_ALREADY_LINKED_MESSAGE,
    };
  }

  return { ok: true };
}

export function isCoh3ProfileAlreadyLinkedError(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "23505" ||
    error.message
      ?.toLowerCase()
      .includes("coh3stats profile is already linked") === true
  );
}
