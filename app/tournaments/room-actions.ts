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
  isResolveMatchRoomInput,
  isSendMatchRoomMessageInput,
  parseMatchRoomHistory,
  parseMatchRoomReadResult,
  parseMatchRoomSendResult,
  parseResolveMatchRoomResult,
  type MarkMatchRoomReadInput,
  type MatchRoomActionFailure,
  type MatchRoomActionResult,
  type MatchRoomErrorCode,
  type MatchRoomHistory,
  type MatchRoomHistoryInput,
  type MatchRoomReadResult,
  type MatchRoomSendResult,
  type ResolveMatchRoomInput,
  type ResolveMatchRoomResult,
  type SendMatchRoomMessageInput,
} from "@/lib/match-room";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

export async function resolveMatchRoom(
  input: ResolveMatchRoomInput
): Promise<MatchRoomActionResult<ResolveMatchRoomResult>> {
  const denied = await authorizeRoomAction();
  if (denied) return denied;
  if (!isResolveMatchRoomInput(input)) return failure("invalid_request");

  return callRoomRpc(
    "resolve_match_room",
    { p_match_id: input.matchId },
    (value) => parseResolveMatchRoomResult(value, input.matchId)
  );
}

/** The same authenticated boundary permits authorized admin history access. */
export async function getMatchRoomHistory(
  input: MatchRoomHistoryInput
): Promise<MatchRoomActionResult<MatchRoomHistory>> {
  const denied = await authorizeRoomAction();
  if (denied) return denied;
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
  const denied = await authorizeRoomAction();
  if (denied) return denied;
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
  const denied = await authorizeRoomAction(admin);
  if (denied) return denied;
  if (!isSendMatchRoomMessageInput(input)) return failure("invalid_request");

  try {
    await requireCurrentAccountLegalAcceptance();
  } catch (error) {
    if (error instanceof AccountLegalMutationBlockedError) {
      revalidatePath("/", "layout");
      return failure(error.reason === "required" ? "legal_required" : "legal_unavailable");
    }
    return failure("unavailable");
  }

  const result = await callRoomRpc(
    admin ? "send_admin_match_room_message" : "send_match_room_message",
    {
      p_match_id: input.matchId,
      p_expected_room_id: input.expectedRoomId,
      p_client_message_id: input.clientMessageId,
      p_body: input.body,
    },
    (value) => parseMatchRoomSendResult(value, input, admin ? "admin" : "player")
  );
  // The room owns its refresh; preserve result/replay drafts in the workspace.
  return result;
}

async function authorizeRoomAction(
  admin = false
): Promise<MatchRoomActionFailure | null> {
  try {
    const { userId, sessionClaims } = await auth();
    if (!userId) return failure("auth_required");
    const claims = sessionClaims as { metadata?: { role?: unknown } } | null;
    if (admin && claims?.metadata?.role !== "admin") return failure("forbidden");
    return null;
  } catch {
    return failure("auth_required");
  }
}

/** No service-role client, browser-supplied identity, raw rows or error text. */
async function callRoomRpc<T>(
  name: string,
  args: Record<string, string | number>,
  parse: (value: unknown) => T | null
): Promise<MatchRoomActionResult<T>> {
  try {
    const supabase = await createAuthenticatedSupabaseClient();
    const { data, error } = await supabase.rpc(name, args);
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
      return failure(message === "MATCH_ROOM_RATE_LIMITED" ? "rate_limited" : "unavailable");
    default: return failure("unavailable");
  }
}

function failure(code: MatchRoomErrorCode): MatchRoomActionFailure {
  return { ok: false, code };
}
