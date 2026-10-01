import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createNoStoreSupabaseClient } from "@/lib/supabase";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";
import { isShowcaseUuid } from "@/lib/player-showcase/validation";
import { mediaConfiguration } from "./config";
import type { HighlightClip, HighlightsState, HighlightSlot, PublicHighlightClip } from "./types";

export function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
export function revision(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
export function slotNumber(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 3; }
export function parseClip(value: unknown): HighlightClip | null {
  const row = record(value);
  if (!row || !isShowcaseUuid(row.uploadId) || typeof row.title !== "string" || row.title.length > 64 || !["video/mp4", "video/webm"].includes(String(row.contentType)) || typeof row.hasPoster !== "boolean") return null;
  for (const [name, max] of [["durationMs", 15000], ["width", 1920], ["height", 1080], ["fps", 60]] as const) if (typeof row[name] !== "number" || !Number.isFinite(row[name]) || row[name] <= 0 || row[name] > max) return null;
  return { uploadId: row.uploadId, title: row.title, contentType: row.contentType as HighlightClip["contentType"], hasPoster: row.hasPoster, durationMs: row.durationMs as number, width: row.width as number, height: row.height as number, fps: row.fps as number };
}
export function parseHighlightsState(value: unknown): HighlightsState | null {
  const row = record(value);
  if (!row || !isShowcaseUuid(row.playerId) || typeof row.enabled !== "boolean" || typeof row.publicProfileEnabled !== "boolean" || !Array.isArray(row.slots) || row.slots.length > 3) return null;
  const slots: HighlightSlot[] = [];
  for (const value of row.slots) {
    const item = record(value);
    if (!item || !slotNumber(item.slotNumber) || !slotNumber(item.displayOrder) || !revision(item.revision) || typeof item.hidden !== "boolean" || (item.pendingUploadId !== null && !isShowcaseUuid(item.pendingUploadId))) return null;
    const clip = item.clip === null ? null : parseClip(item.clip);
    if (item.clip !== null && !clip) return null;
    slots.push({ slotNumber: item.slotNumber, displayOrder: item.displayOrder, revision: item.revision, hidden: item.hidden, pendingUploadId: item.pendingUploadId as string | null, clip });
  }
  if (new Set(slots.map((s) => s.slotNumber)).size !== slots.length || new Set(slots.map((s) => s.displayOrder)).size !== slots.length) return null;
  return { playerId: row.playerId, enabled: row.enabled, publicProfileEnabled: row.publicProfileEnabled, slots: slots.sort((a, b) => a.displayOrder - b.displayOrder) };
}
export async function getMyCombatHighlights(): Promise<HighlightsState | null> {
  try {
    if (!mediaConfiguration() || !(await auth()).userId) return null;
    const { data, error } = await (await createAuthenticatedSupabaseClient()).rpc("get_my_player_combat_highlights");
    return error ? null : parseHighlightsState(data);
  } catch { return null; }
}
export async function getPublicCombatHighlights(playerId: string): Promise<PublicHighlightClip[]> {
  try {
    const config = mediaConfiguration();
    if (!config || !isShowcaseUuid(playerId)) return [];
    const { data, error } = await createNoStoreSupabaseClient().rpc("get_public_player_combat_highlights", { p_player_id: playerId });
    if (error || !Array.isArray(data) || data.length > 3) return [];
    return data.flatMap((value) => { const clip = parseClip(value); return clip ? [{ ...clip, videoUrl: config.origin + "/public/" + clip.uploadId + "/video", posterUrl: clip.hasPoster ? config.origin + "/public/" + clip.uploadId + "/poster" : null }] : []; });
  } catch { return []; }
}
