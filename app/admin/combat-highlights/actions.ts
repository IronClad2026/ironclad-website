"use server";
import { moderateCombatHighlight, retryHighlightCleanup } from "@/lib/combat-highlights/moderation";
export async function moderateHighlight(_state: { ok: boolean; code: string }, form: FormData) {
  const hidden = form.get("hidden");
  return moderateCombatHighlight({ playerId: form.get("playerId"), slotNumber: Number(form.get("slotNumber")), revision: Number(form.get("revision")), hidden: hidden === "true" ? true : hidden === "false" ? false : null });
}
export async function retryCleanup() { await retryHighlightCleanup(); }
