"use server";

import { auth } from "@clerk/nextjs/server";
import { requireCurrentAccountLegalAcceptance } from "@/lib/account-legal-mutation-guard";
import { isAccountLegalAcceptanceRpcError } from "@/lib/account-legal-rpc-error";
import { authorizePrivateAssistance, callPrivateAssistanceRpc } from "@/lib/private-assistance-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getPublicPlayerById } from "@/lib/public-players";
import { getMatchRoomHistory } from "@/app/tournaments/room-actions";
import {
  isRecord, isUuid, isRoomAssistanceInput, isMutateRoomAssistanceInput, parseRoomAssistance,
  type MatchRoomAssistance, type MatchRoomAssistanceInput, type MutateMatchRoomAssistanceInput,
} from "@/lib/match-room-assistance";
import type { MatchRoomActionResult } from "@/lib/match-room";

export async function getMatchRoomAssistance(input: MatchRoomAssistanceInput): Promise<MatchRoomActionResult<MatchRoomAssistance>> {
  const actor = await authorizePrivateAssistance();
  if (!actor.ok) return actor;
  if (!isRoomAssistanceInput(input)) return { ok: false, code: "invalid_request" };
  return callAssistance(actor.data, "get_match_room_assistance", { p_room_id: input.roomId }, input.roomId);
}

export async function requestMatchAdminAssistance(input: MutateMatchRoomAssistanceInput): Promise<MatchRoomActionResult<MatchRoomAssistance>> {
  try {
    const { userId } = await auth();
    if (!userId) return { ok: false, code: "auth_required" };
  } catch {
    return { ok: false, code: "auth_required" };
  }
  if (!isMutateRoomAssistanceInput(input)) return { ok: false, code: "invalid_request" };
  // This old endpoint has no initial message or private requester context.
  // Already-open clients must reopen help to use the private request form.
  return { ok: false, code: "invalid_request" };
}

export async function resolveMatchAdminAssistance(input: MutateMatchRoomAssistanceInput): Promise<MatchRoomActionResult<MatchRoomAssistance>> {
  const actor = await authorizePrivateAssistance(true);
  if (!actor.ok) return actor;
  if (!isMutateRoomAssistanceInput(input) || input.expectedRequestVersion < 1) return { ok: false, code: "invalid_request" };
  try {
    await requireCurrentAccountLegalAcceptance();
  } catch {
    return { ok: false, code: "legal_required" };
  }
  return callAssistance(actor.data, "resolve_match_room_assistance", {
    p_room_id: input.roomId, p_expected_request_version: input.expectedRequestVersion,
  }, input.roomId);
}

async function callAssistance(
  actor: Parameters<typeof callPrivateAssistanceRpc>[0],
  operation: "get_match_room_assistance" | "resolve_match_room_assistance",
  args: Record<string, string | number>,
  roomId: string,
): Promise<MatchRoomActionResult<MatchRoomAssistance>> {
  try {
    const { data, error } = await callPrivateAssistanceRpc(actor, operation, args);
    if (error) {
      if (isAccountLegalAcceptanceRpcError(error)) {
        return { ok: false, code: error.message === "ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED" ? "legal_required" : "unavailable" };
      }
      if (error.code === "P0001" && error.message === "MATCH_ROOM_DISABLED") return { ok: false, code: "disabled" };
      if (error.code === "42501") return { ok: false, code: "forbidden" };
      if (error.code === "22023") return { ok: false, code: "invalid_request" };
      if (error.code === "40001") return { ok: false, code: "stale_room" };
      return { ok: false, code: "unavailable" };
    }
    const parsed = parseRoomAssistance(data, roomId);
    // Only this communication component refreshes; result/replay drafts stay mounted.
    return parsed ? { ok: true, data: parsed } : { ok: false, code: "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

/** Fetch fresh, opt-in public contact for the immutable room's actual opponent. */
export async function getMatchRoomOpponentDiscord(input: {
  roomId: string;
}): Promise<{ discordUsername: string | null }> {
  try {
    const { userId } = await auth();
    if (!userId || !isRecord(input) || !isUuid(input.roomId)) {
      return { discordUsername: null };
    }
    const history = await getMatchRoomHistory({ roomId: input.roomId, afterSequence: 0, limit: 1 });
    if (!history.ok || !history.data.room.viewerRegistrationId) {
      return { discordUsername: null };
    }
    const room = history.data.room;
    const opponentId = room.viewerRegistrationId === room.playerOneRegistrationId
      ? room.playerTwoRegistrationId : room.playerOneRegistrationId;
    const { data, error } = await createSupabaseAdminClient()
      .from("registrations")
      .select("profile_id")
      .eq("id", opponentId)
      .maybeSingle();
    if (error || !isRecord(data) || !isUuid(data.profile_id)) {
      return { discordUsername: null };
    }
    const profile = await getPublicPlayerById(data.profile_id);
    return {
      discordUsername: profile?.publicProfileEnabled && profile.discordPublicEnabled
        ? profile.discordUsername : null,
    };
  } catch {
    return { discordUsername: null };
  }
}
