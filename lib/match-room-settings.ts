import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type MatchRoomSettingResult =
  | { ok: true; enabled: boolean }
  | { ok: false; code: "forbidden" | "invalid_request" | "unavailable" };

async function adminIdentity(): Promise<string | null> {
  try {
    const { userId, sessionClaims } = await auth();
    return userId && (sessionClaims as { metadata?: { role?: unknown } } | null)?.metadata?.role === "admin"
      ? userId : null;
  } catch {
    return null;
  }
}

export async function getAdminMatchRoomSetting(): Promise<MatchRoomSettingResult> {
  if (!await adminIdentity()) return { ok: false, code: "forbidden" };
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("get_match_room_enabled");
    return !error && typeof data === "boolean"
      ? { ok: true, enabled: data } : { ok: false, code: "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

/** A scoped service-role command; never accepts a caller-supplied actor or key. */
export async function setAdminMatchRoomEnabled(enabled: boolean): Promise<MatchRoomSettingResult> {
  const actorId = await adminIdentity();
  if (!actorId) return { ok: false, code: "forbidden" };
  if (typeof enabled !== "boolean") return { ok: false, code: "invalid_request" };
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("set_match_room_enabled", {
      p_enabled: enabled,
      p_actor_clerk_user_id: actorId,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data) ||
      Object.keys(data).length !== 1 || data.enabled !== enabled) {
      return { ok: false, code: "unavailable" };
    }
    return { ok: true, enabled };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
