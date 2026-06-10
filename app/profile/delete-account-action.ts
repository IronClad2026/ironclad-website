"use server";

import { randomUUID } from "node:crypto";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const AVATAR_BUCKET = "player-avatars";

export type DeleteAccountState = {
  status: "idle" | "error" | "success";
  message: string;
};

export async function deleteIronCladAccount(
  _previousState: DeleteAccountState,
  formData: FormData
): Promise<DeleteAccountState> {
  const { userId } = await auth();
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  if (!userId) {
    return {
      status: "error",
      message: "Your session has expired. Sign in again before deleting.",
    };
  }

  if (confirmation !== "DELETE") {
    return {
      status: "error",
      message: "Type DELETE exactly to confirm account deletion.",
    };
  }

  let supabase;

  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    console.error("Delete account configuration error:", error);

    return {
      status: "error",
      message:
        "Account deletion is not configured. Contact an IronClad administrator.",
    };
  }

  const anonymizedUserId = `deleted:${randomUUID()}`;
  const { error: registrationError } = await supabase
    .from("registrations")
    .update({
      clerk_user_id: anonymizedUserId,
      player_name: "Deleted Player",
      discord_username: "Deleted Account",
      steam_name: "Deleted Account",
      country: "Anonymized",
      region: "Anonymized",
      timezone: "UTC",
      coh3_player_card_url: null,
    })
    .eq("clerk_user_id", userId);

  if (registrationError) {
    console.error("Registration anonymization failed:", registrationError);

    return {
      status: "error",
      message:
        "Historical registrations could not be anonymized. Your account was not deleted.",
    };
  }

  const { error: avatarError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .remove([`${userId}/avatar`]);

  if (avatarError) {
    console.error("Account avatar deletion failed:", avatarError);

    return {
      status: "error",
      message:
        "Your avatar could not be removed. Your Clerk account was not deleted.",
    };
  }

  const { error: profileError } = await supabase
    .from("players")
    .delete()
    .eq("clerk_user_id", userId);

  if (profileError) {
    console.error("Player profile deletion failed:", profileError);

    return {
      status: "error",
      message:
        "Your player profile could not be removed. Your Clerk account was not deleted.",
    };
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch (error) {
    console.error("Clerk account deletion failed after Supabase cleanup:", error);

    return {
      status: "error",
      message:
        "IronClad data was removed, but Clerk account deletion failed. Contact an administrator.",
    };
  }

  return {
    status: "success",
    message: "Your IronClad account has been deleted.",
  };
}
