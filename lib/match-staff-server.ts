import "server-only";

import { hasCurrentPatch2AdminAccess } from "@/lib/patch2-admin-access";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type MatchSession = {
  userId: string | null;
  sessionId: string | null;
  sessionClaims: unknown;
};

type MatchStaffOperation =
  | "resolve_match_room"
  | "get_match_room_history"
  | "get_match_room_earlier_history"
  | "mark_match_room_read"
  | "send_admin_match_room_message"
  | "get_match_dice_rolloff";

export async function getVerifiedMatchStaff(
  session: MatchSession,
  requirePlayer: boolean,
): Promise<string | null> {
  const { userId, sessionId, sessionClaims } = session;
  const role = (sessionClaims as { metadata?: { role?: unknown } } | null)?.metadata?.role;
  if (!userId || !sessionId || role !== "admin") return null;
  return await hasCurrentPatch2AdminAccess(userId, sessionClaims, sessionId, requirePlayer)
    ? userId : null;
}

export async function callVerifiedMatchStaff(
  actor: string,
  operation: MatchStaffOperation,
  args: Record<string, string | number>,
) {
  return createSupabaseAdminClient().rpc("call_patch2_match_staff", {
    p_operation: operation,
    p_arguments: args,
    p_actor_clerk_user_id: actor,
  });
}
