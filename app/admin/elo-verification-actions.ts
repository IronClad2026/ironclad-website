"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { updateEloVerificationSetting } from "@/lib/platform-settings";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
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
