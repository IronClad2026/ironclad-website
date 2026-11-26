"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { recordCurrentAccountLegalAcceptance } from "@/lib/account-legal-write";

export type AccountLegalAcceptanceActionState = {
  status: "idle" | "error" | "success";
  code:
    | "idle"
    | "auth-required"
    | "acceptance-required"
    | "unavailable"
    | "accepted";
};

export async function acceptAccountLegalUpdate(
  _previousState: AccountLegalAcceptanceActionState,
  formData: FormData
): Promise<AccountLegalAcceptanceActionState> {
  let userId: string | null;

  try {
    ({ userId } = await auth());
  } catch {
    console.error("Account legal acceptance authentication failed.");
    return { status: "error", code: "auth-required" };
  }

  if (!userId) {
    return { status: "error", code: "auth-required" };
  }

  const result = await recordCurrentAccountLegalAcceptance(userId, formData);
  if (result !== "accepted") {
    return { status: "error", code: result };
  }

  try {
    revalidatePath("/", "layout");
  } catch {
    console.error("Account legal acceptance cache invalidation failed.");
  }

  return { status: "success", code: "accepted" };
}
