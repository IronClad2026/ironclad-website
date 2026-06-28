"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  updateEloVerificationSetting,
  updateEloVerificationSupportLinkSetting,
} from "@/lib/platform-settings";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

export type EloVerificationSupportLinkActionState = {
  status: "idle" | "success" | "error";
  message: string;
  url?: string;
};

export async function updateEloVerificationMode(formData: FormData) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const mode = String(formData.get("mode") ?? "");

  if (mode !== "enabled" && mode !== "disabled") {
    throw new Error("Invalid ELO verification mode.");
  }

  await updateEloVerificationSetting({
    enabled: mode === "enabled",
    updatedByClerkUserId: userId,
  });

  revalidatePath("/admin");
}

export async function updateEloVerificationSupportLink(
  _previousState: EloVerificationSupportLinkActionState,
  formData: FormData
): Promise<EloVerificationSupportLinkActionState> {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    throw new Error("Unauthorized");
  }

  const supportUrl = String(formData.get("supportUrl") ?? "");
  const result = await updateEloVerificationSupportLinkSetting({
    url: supportUrl,
    updatedByClerkUserId: userId,
  });

  if (result.error) {
    return {
      status: "error",
      message: result.error,
      url: supportUrl.trim(),
    };
  }

  revalidatePath("/admin");

  return {
    status: "success",
    message: "ELO verification support link updated.",
    url: result.url,
  };
}
