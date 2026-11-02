"use server";

import {
  ASSISTANCE_HISTORY_LIMIT, hasAssistanceKeys, isAssistanceBody, isAssistanceRecord, isAssistanceUuid,
  parseAssistanceContext, parseAssistanceConversation, parseAssistanceMutation,
  type AssistanceContext, type AssistanceConversation, type AssistanceHistoryInput,
  type AssistanceMutation, type AssistanceOpenInput, type AssistanceReplyInput, type AssistanceResult,
} from "@/lib/private-assistance";
import { authorizePrivateAssistance, callPrivateAssistance } from "@/lib/private-assistance-server";
import { VERIFIED_DISCORD_TICKET_URL } from "@/lib/support";

export async function getPrivateAssistanceContext(input: { roomId: string }): Promise<AssistanceResult<AssistanceContext>> {
  const denied = await authorizePrivateAssistance();
  if (denied) return { ok: false, code: denied };
  if (!isAssistanceRecord(input) || !hasAssistanceKeys(input, ["roomId"]) || !isAssistanceUuid(input.roomId)) {
    return { ok: false, code: "invalid_request" };
  }
  const roomId = input.roomId.toLowerCase();
  return callPrivateAssistance("get_private_assistance_context", { p_room_id: roomId }, (value) => {
    if (!isAssistanceRecord(value)) return null;
    const parsed = parseAssistanceContext({ ...value, discordUrl: VERIFIED_DISCORD_TICKET_URL });
    return parsed?.room.roomId === roomId ? parsed : null;
  });
}

export async function openPrivateAssistance(input: AssistanceOpenInput): Promise<AssistanceResult<AssistanceMutation>> {
  const denied = await authorizePrivateAssistance(false, true);
  if (denied) return { ok: false, code: denied };
  if (!isAssistanceRecord(input) || !hasAssistanceKeys(input, ["roomId", "clientMessageId", "body"]) ||
    !isAssistanceUuid(input.roomId) || !isAssistanceUuid(input.clientMessageId) || !isAssistanceBody(input.body)) {
    return { ok: false, code: "invalid_request" };
  }
  const roomId = input.roomId.toLowerCase();
  const clientMessageId = input.clientMessageId.toLowerCase();
  return callPrivateAssistance("open_private_assistance", {
    p_room_id: roomId, p_client_message_id: clientMessageId, p_body: input.body.trim(),
  }, (value) => {
    const parsed = parseAssistanceMutation(value);
    return parsed?.request.roomId === roomId && (!parsed.accepted || parsed.acceptedClientMessageId === clientMessageId) ? parsed : null;
  });
}

export async function readPrivateAssistance(input: AssistanceHistoryInput): Promise<AssistanceResult<AssistanceConversation>> {
  const denied = await authorizePrivateAssistance();
  if (denied) return { ok: false, code: denied };
  if (!isAssistanceRecord(input) || !hasAssistanceKeys(input, ["requestId", "tournamentId", "afterSequence", "limit"]) ||
    !isAssistanceUuid(input.requestId) || !isAssistanceUuid(input.tournamentId) ||
    !Number.isSafeInteger(input.afterSequence) || input.afterSequence < 0 ||
    !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > ASSISTANCE_HISTORY_LIMIT) {
    return { ok: false, code: "invalid_request" };
  }
  const requestId = input.requestId.toLowerCase();
  const tournamentId = input.tournamentId.toLowerCase();
  return callPrivateAssistance("read_private_assistance", {
    p_request_id: requestId, p_tournament_id: tournamentId,
    p_after_sequence: input.afterSequence, p_limit: input.limit,
  }, (value) => {
    const parsed = parseAssistanceConversation(value);
    return parsed?.request.id === requestId && parsed.request.tournamentId === tournamentId &&
      parsed.messages.length <= input.limit && parsed.messages.every((m) => m.sequence > input.afterSequence) ? parsed : null;
  });
}

export async function replyPrivateAssistance(input: AssistanceReplyInput): Promise<AssistanceResult<AssistanceMutation>> {
  const denied = await authorizePrivateAssistance(false, true);
  if (denied) return { ok: false, code: denied };
  if (!isAssistanceRecord(input) || !hasAssistanceKeys(input, ["requestId", "tournamentId", "clientMessageId", "body"]) ||
    !isAssistanceUuid(input.requestId) || !isAssistanceUuid(input.tournamentId) ||
    !isAssistanceUuid(input.clientMessageId) || !isAssistanceBody(input.body)) {
    return { ok: false, code: "invalid_request" };
  }
  const requestId = input.requestId.toLowerCase();
  const tournamentId = input.tournamentId.toLowerCase();
  const clientMessageId = input.clientMessageId.toLowerCase();
  return callPrivateAssistance("reply_private_assistance", {
    p_request_id: requestId, p_tournament_id: tournamentId,
    p_client_message_id: clientMessageId, p_body: input.body.trim(),
  }, (value) => {
    const parsed = parseAssistanceMutation(value);
    return parsed?.request.id === requestId && parsed.request.tournamentId === tournamentId &&
      parsed.acceptedClientMessageId === clientMessageId ? parsed : null;
  });
}
