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
  const { data, error } = await supabase
    .from("players")
    .update({ public_profile_enabled: enabled })
    .eq("clerk_user_id", userId)
    .select("id, public_profile_enabled")
    .maybeSingle();

  if (error) {
    console.error("Public profile visibility update failed:", error);
    return {
      status: "error",
      message: "Public profile visibility could not be updated.",
      enabled: !enabled,
    };
  }

  if (!data) {
    return {
      status: "error",
      message: "Complete your player profile before changing this setting.",
      enabled: false,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/players");
  revalidatePath(`/players/${data.id as string}`);

  return {
    status: "success",
    message: enabled
      ? "Your player profile is now public."
      : "Your player profile is now private.",
    enabled: Boolean(data.public_profile_enabled),
  };
}
