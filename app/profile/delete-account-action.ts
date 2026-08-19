"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const AVATAR_BUCKET = "player-avatars";

export type DeleteAccountState = {
  status: "idle" | "error" | "success";
  code?:
    | "session-expired"
    | "confirmation-invalid"
    | "not-configured"
    | "avatar-failed"
    | "data-failed"
    | "clerk-failed"
    | "deleted";
  message: string;
};

type AccountClosureOutcome = "deleted" | "pseudonymized" | "not_found";

export async function deleteIronCladAccount(
  _previousState: DeleteAccountState,
  formData: FormData
): Promise<DeleteAccountState> {
  const { userId } = await auth();
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  if (!userId) {
    return {
      status: "error",
      code: "session-expired",
      message: "Your session has expired. Sign in again before deleting.",
    };
  }

  if (confirmation !== "DELETE") {
    return {
      status: "error",
      code: "confirmation-invalid",
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
      code: "not-configured",
      message:
        "Account deletion is not configured. Contact an IronClad administrator.",
    };
  }

  const { error: avatarError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .remove([`${userId}/avatar`]);

  if (avatarError) {
    console.error("Account avatar deletion failed:", avatarError);

    return {
      status: "error",
      code: "avatar-failed",
      message:
        "Your avatar could not be removed. Your Clerk account was not deleted.",
    };
  }

  const { data: closureData, error: closureError } = await supabase.rpc(
    "close_ironclad_player_account",
    {
      p_clerk_user_id: userId,
    }
  );

  if (closureError || !isAccountClosureOutcome(closureData)) {
    console.error(
      "IronClad account closure failed:",
      closureError ?? "Unexpected account closure response"
    );

    return {
      status: "error",
      code: "data-failed",
      message:
        "Your IronClad data could not be safely closed. Your Clerk account was not deleted.",
    };
  }

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch (error) {
    console.error("Clerk account deletion failed after Supabase cleanup:", error);

    return {
      status: "error",
      code: "clerk-failed",
      message:
        "Your IronClad identity was closed, but Clerk account deletion failed. Contact an administrator.",
    };
  }

  return {
    status: "success",
    code: "deleted",
    message: "Your IronClad account has been deleted.",
  };
}

function isAccountClosureOutcome(value: unknown): value is {
  outcome: AccountClosureOutcome;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const outcome = Reflect.get(value, "outcome");
  return (
    outcome === "deleted" ||
    outcome === "pseudonymized" ||
    outcome === "not_found"
  );
}
