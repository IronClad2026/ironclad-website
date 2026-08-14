"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

export type PublicProfileVisibilityActionResult = {
  status: "success" | "error";
  message: string;
  enabled: boolean;
};

export async function updatePublicProfileEnabled(
  enabled: unknown
): Promise<PublicProfileVisibilityActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return {
      status: "error",
      message: "Sign in before updating public profile visibility.",
      enabled: false,
    };
  }

  if (typeof enabled !== "boolean") {
    return {
      status: "error",
      message: "Public profile visibility must be enabled or disabled.",
      enabled: false,
    };
  }

  const supabase = await createAuthenticatedSupabaseClient();
  const { data: updatedPlayer, error: updateError } = await supabase
    .from("players")
    .update({ public_profile_enabled: enabled })
    .eq("clerk_user_id", userId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("Public profile visibility update failed:", updateError);
    return {
      status: "error",
      message: "Public profile visibility could not be updated.",
      enabled: !enabled,
    };
  }

  if (!updatedPlayer) {
    return {
      status: "error",
      message: "Complete your player profile before changing this setting.",
      enabled: false,
    };
  }

  const { data: persistedPlayer, error: verificationError } = await supabase
    .from("players")
    .select("id, public_profile_enabled")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (
    verificationError ||
    !persistedPlayer ||
    persistedPlayer.id !== updatedPlayer.id ||
    persistedPlayer.public_profile_enabled !== enabled
  ) {
    if (verificationError) {
      console.error(
        "Public profile visibility verification failed:",
        verificationError
      );
    } else {
      console.error(
        "Public profile visibility verification returned an unexpected value."
      );
    }

    return {
      status: "error",
      message: "Public profile visibility could not be verified.",
      enabled: !enabled,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/players");
  revalidatePath(`/players/${persistedPlayer.id as string}`);
  revalidatePath("/tournaments");

  return {
    status: "success",
    message: enabled
      ? "Your player profile is now public."
      : "Your player profile is now private.",
    enabled: persistedPlayer.public_profile_enabled,
  };
}
