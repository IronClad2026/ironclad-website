"use server";
import { cancelCombatHighlight, clearCombatHighlight, completeCombatHighlight, previewCombatHighlight, reorderCombatHighlights, reserveCombatHighlight } from "@/lib/combat-highlights/mutations";
import type { ReserveHighlightInput } from "@/lib/combat-highlights/types";
export async function reserveHighlight(input: ReserveHighlightInput) { return reserveCombatHighlight(input); }
export async function completeHighlight(uploadId: string) { return completeCombatHighlight(uploadId); }
export async function cancelHighlight(uploadId: string, expectedRevision: number) { return cancelCombatHighlight(uploadId, expectedRevision); }
export async function clearHighlight(slotNumber: number, expectedRevision: number) { return clearCombatHighlight(slotNumber, expectedRevision); }
export async function reorderHighlights(slotNumbers: number[], expectedRevisions: number[]) { return reorderCombatHighlights(slotNumbers, expectedRevisions); }
export async function previewHighlight(uploadId: string) { return previewCombatHighlight(uploadId); }
