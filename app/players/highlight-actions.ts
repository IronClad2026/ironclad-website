"use server";
import { reportCombatHighlight } from "@/lib/combat-highlights/mutations";
export async function reportHighlight(uploadId: string, reason: string) { return reportCombatHighlight(uploadId, reason); }
