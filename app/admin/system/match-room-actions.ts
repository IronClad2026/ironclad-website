"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { setAdminMatchRoomEnabled, type MatchRoomSettingResult } from "@/lib/match-room-settings";

export async function updateMatchRoomEnabled(
  _previous: MatchRoomSettingResult | null,
  formData: FormData
): Promise<MatchRoomSettingResult> {
  try {
    const { userId, sessionClaims } = await auth();
    if (!userId || (sessionClaims as { metadata?: { role?: unknown } } | null)?.metadata?.role !== "admin") {
      return { ok: false, code: "forbidden" };
    }
  } catch {
    return { ok: false, code: "forbidden" };
  }
  const values = formData.getAll("enabled");
  if (values.length !== 1 || (values[0] !== "true" && values[0] !== "false")) {
    return { ok: false, code: "invalid_request" };
  }
  const result = await setAdminMatchRoomEnabled(values[0] === "true");
  if (result.ok) revalidatePath("/admin/system");
  return result;
}
