"use server";

import { auth } from "@clerk/nextjs/server";
import type { MatchRoomActionResult } from "@/lib/match-room";
import {
  isMatchRoomUnreadInput,
  parseMatchRoomUnreadSummary,
  type MatchRoomUnreadInput,
  type MatchRoomUnreadSummary,
} from "@/lib/match-room-unread";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

/** Private POST boundary; never cached or included in public tournament data. */
export async function getMatchRoomUnreadSummary(
  input: MatchRoomUnreadInput
): Promise<MatchRoomActionResult<MatchRoomUnreadSummary>> {
  try {
    if (!(await auth()).userId) return { ok: false, code: "auth_required" };
  } catch {
    return { ok: false, code: "auth_required" };
  }
  if (!isMatchRoomUnreadInput(input)) return { ok: false, code: "invalid_request" };
  if (input.matchIds.length === 0) return { ok: true, data: { items: [] } };

  try {
    const supabase = await createAuthenticatedSupabaseClient();
    // JWT sub is the only identity; admin claims do not bypass participant scope.
    const { data, error } = await supabase.rpc("get_match_room_unread_summary", {
      p_match_ids: input.matchIds,
    });
    if (error) {
      return { ok: false, code: error.code === "42501" ? "forbidden" : "unavailable" };
    }
    const parsed = parseMatchRoomUnreadSummary(data, input);
    return parsed === null ? { ok: false, code: "unavailable" } : { ok: true, data: parsed };
  } catch {
    // Infrastructure and database errors never expose room data or raw text.
    return { ok: false, code: "unavailable" };
  }
}
