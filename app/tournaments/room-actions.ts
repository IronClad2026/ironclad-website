"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import {
  AccountLegalMutationBlockedError,
  requireCurrentAccountLegalAcceptance,
} from "@/lib/account-legal-mutation-guard";
import { isAccountLegalAcceptanceRpcError } from "@/lib/account-legal-rpc-error";
import {
  isMarkMatchRoomReadInput,
  isMatchRoomHistoryInput,
  isMatchRoomEarlierHistoryInput,
  isResolveMatchRoomInput,
  isSendMatchRoomMessageInput,
  parseMatchRoomHistory,
  parseMatchRoomEarlierHistory,
  parseMatchRoomReadResult,
  parseMatchRoomSendResult,
  parseResolveMatchRoomResult,
  type MarkMatchRoomReadInput,
  type MatchRoomActionFailure,
  type MatchRoomActionResult,
  type MatchRoomErrorCode,
  type MatchRoomHistory,
  type MatchRoomEarlierHistory,
  type MatchRoomEarlierHistoryInput,
  type MatchRoomHistoryInput,
  type MatchRoomReadResult,
  type MatchRoomSendResult,
  type ResolveMatchRoomInput,
  type ResolveMatchRoomResult,
  type SendMatchRoomMessageInput,
} from "@/lib/match-room";
import { callVerifiedMatchStaff, getVerifiedMatchStaff, type MatchSession } from "@/lib/match-staff-server";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

export async function resolveMatchRoom(
  input: ResolveMatchRoomInput
): Promise<MatchRoomActionResult<ResolveMatchRoomResult>> {
  if (!isResolveMatchRoomInput(input)) return failure("invalid_request");

  return callRoomRpc(
    "resolve_match_room",
    { p_match_id: input.matchId },
    (value) => parseResolveMatchRoomResult(value, input.matchId)
  );
}

export async function getMatchRoomHistory(
  input: MatchRoomHistoryInput
): Promise<MatchRoomActionResult<MatchRoomHistory>> {
  if (!isMatchRoomHistoryInput(input)) return failure("invalid_request");

  return callRoomRpc(
    "get_match_room_history",
    {
      p_room_id: input.roomId,
      p_after_sequence: input.afterSequence,
      p_limit: input.limit,
    },
    (value) => parseMatchRoomHistory(value, input)
  );
}

/** Each bounded earlier page repeats the authenticated immutable-room check. */
export async function getMatchRoomEarlierHistory(
  input: MatchRoomEarlierHistoryInput
): Promise<MatchRoomActionResult<MatchRoomEarlierHistory>> {
  if (!isMatchRoomEarlierHistoryInput(input)) return failure("invalid_request");
  return callRoomRpc(
    "get_match_room_earlier_history",
    {
      p_room_id: input.roomId,
      p_before_sequence: input.beforeSequence,
      p_limit: input.limit,
    },
    (value) => parseMatchRoomEarlierHistory(value, input)
  );
}

export async function sendMatchRoomMessage(
  input: SendMatchRoomMessageInput
): Promise<MatchRoomActionResult<MatchRoomSendResult>> {
  return sendRoomMessage(input, false);
}

export async function sendAdminMatchRoomMessage(
  input: SendMatchRoomMessageInput
): Promise<MatchRoomActionResult<MatchRoomSendResult>> {
  return sendRoomMessage(input, true);
}

export async function markMatchRoomRead(
  input: MarkMatchRoomReadInput
): Promise<MatchRoomActionResult<MatchRoomReadResult>> {
  if (!isMarkMatchRoomReadInput(input)) return failure("invalid_request");

  const result = await callRoomRpc(
    "mark_match_room_read",
    { p_room_id: input.roomId, p_through_sequence: input.throughSequence },
    (value) => parseMatchRoomReadResult(value, input)
  );
  // The room owns its refresh; preserve result/replay drafts in the workspace.
  return result;
}

async function sendRoomMessage(
  input: SendMatchRoomMessageInput,
  admin: boolean
): Promise<MatchRoomActionResult<MatchRoomSendResult>> {
  if (!isSendMatchRoomMessageInput(input)) return failure("invalid_request");
  const session = await readRoomSession();
  if (!session) return failure("auth_required");
  const staff = admin ? await getVerifiedMatchStaff(session, true) : null;
  if (admin && !staff) return failure("forbidden");

  try {
    await requireCurrentAccountLegalAcceptance();
  } catch (error) {
    if (error instanceof AccountLegalMutationBlockedError) {
      revalidatePath("/", "layout");
      return failure(error.reason === "required" ? "legal_required" : "legal_unavailable");
    }
    return failure("unavailable");
  }

  const args = {
    p_match_id: input.matchId,
    p_expected_room_id: input.expectedRoomId,
    p_client_message_id: input.clientMessageId,
    p_body: input.body,
  };
  const result = await parseRoomRpc(
    () => staff ? callVerifiedMatchStaff(staff, "send_admin_match_room_message", args)
      : callParticipantRoomRpc("send_match_room_message", args),
    (value) => parseMatchRoomSendResult(value, input, admin ? "admin" : "player"),
  );
  // The room owns its refresh; preserve result/replay drafts in the workspace.
  return result;
}

async function readRoomSession(): Promise<MatchSession | null> {
  try {
    const { userId, sessionId, sessionClaims } = await auth();
    return userId ? { userId, sessionId, sessionClaims } : null;
  } catch {
    return null;
  }
}

type RoomRpc = "resolve_match_room" | "get_match_room_history" |
  "get_match_room_earlier_history" | "mark_match_room_read";
type RoomRpcArgs = Record<string, string | number>;

async function callRoomRpc<T>(
  name: RoomRpc,
  args: RoomRpcArgs,
  parse: (value: unknown) => T | null
): Promise<MatchRoomActionResult<T>> {
  const session = await readRoomSession();
  if (!session) return failure("auth_required");

  return parseRoomRpc(async () => {
    const result = await callParticipantRoomRpc(name, args);
    if (result.error?.code !== "42501" || result.error.message === "PROFILE_NOTICE_REQUIRED") {
      return result;
    }
    const staff = await getVerifiedMatchStaff(session, true);
    return staff ? callVerifiedMatchStaff(staff, name, args) : result;
  }, parse);
}

async function callParticipantRoomRpc(name: RoomRpc | "send_match_room_message", args: RoomRpcArgs) {
  const supabase = await createAuthenticatedSupabaseClient();
  return supabase.rpc(name, args);
}

async function parseRoomRpc<T>(
  call: () => Promise<{ data: unknown; error: unknown }>,
  parse: (value: unknown) => T | null,
): Promise<MatchRoomActionResult<T>> {
  try {
    const { data, error } = await call();
    if (error) return roomRpcFailure(error);
    const parsed = parse(data);
    return parsed === null ? failure("unavailable") : { ok: true, data: parsed };
  } catch (error) {
    return roomRpcFailure(error);
  }
}

function roomRpcFailure(error: unknown): MatchRoomActionFailure {
  if (isAccountLegalAcceptanceRpcError(error)) {
    revalidatePath("/", "layout");
    return failure(
      (error as { message: string }).message === "ACCOUNT_LEGAL_ACCEPTANCE_REQUIRED"
        ? "legal_required"
        : "legal_unavailable"
    );
  }
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    return failure("unavailable");
  }

  const { code, message } = error as { code?: unknown; message?: unknown };
  switch (code) {
    case "42501": return failure("forbidden");
    case "22023": return failure("invalid_request");
    case "40001": return failure("stale_room");
    case "55000": return failure("read_only");
    case "23505": return failure("idempotency_conflict");
    case "P0001":
      if (message === "MATCH_ROOM_DISABLED") return failure("disabled");
      return failure(message === "MATCH_ROOM_RATE_LIMITED" ? "rate_limited" : "unavailable");
    default: return failure("unavailable");
  }
}

function failure(code: MatchRoomErrorCode): MatchRoomActionFailure {
  return { ok: false, code };
}
