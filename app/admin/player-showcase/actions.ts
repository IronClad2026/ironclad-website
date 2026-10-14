"use server";

import { revalidatePath } from "next/cache";
import { moderatePlayerShowcase } from "@/lib/player-showcase/moderation";
import type { ActionResult } from "@/lib/player-showcase/types";

export async function moderateThought(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const revisionText = form.get("revision");
  const hidden = form.get("hidden");
  const result = await moderatePlayerShowcase({
    playerId: form.get("playerId"),
    revision: typeof revisionText === "string" && /^\d+$/.test(revisionText) ? Number(revisionText) : null,
    hidden: hidden === "true" ? true : hidden === "false" ? false : null,
  });
  if (result.status === "success") revalidatePath("/admin/player-showcase");
  return result;
}
