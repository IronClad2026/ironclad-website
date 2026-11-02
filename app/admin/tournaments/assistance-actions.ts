"use server";

import {
  hasAssistanceKeys, isAssistanceFilter, isAssistanceRecord, isAssistanceStatus, isAssistanceUuid,
  parseAssistanceQueue, parseAssistanceRequest,
  type AssistanceAdminQueue, type AssistanceQueueInput, type AssistanceRequest, type AssistanceResult, type AssistanceStatusInput,
} from "@/lib/private-assistance";
import { authorizePrivateAssistance, callPrivateAssistance } from "@/lib/private-assistance-server";

export async function getAdminPrivateAssistanceQueue(input: AssistanceQueueInput): Promise<AssistanceResult<AssistanceAdminQueue>> {
  const denied = await authorizePrivateAssistance(true);
  if (denied) return { ok: false, code: denied };
  if (!isAssistanceRecord(input) || !hasAssistanceKeys(input, ["tournamentId", "filter", "page", "selectedId"]) ||
    !isAssistanceUuid(input.tournamentId) || !isAssistanceFilter(input.filter) ||
    !Number.isSafeInteger(input.page) || input.page < 1 || input.page > 2147483647 ||
    (input.selectedId !== null && !isAssistanceUuid(input.selectedId))) {
    return { ok: false, code: "invalid_request" };
  }
  const tournamentId = input.tournamentId.toLowerCase();
  const selectedId = input.selectedId?.toLowerCase() ?? null;
  return callPrivateAssistance("list_admin_private_assistance", {
    p_tournament_id: tournamentId, p_status: input.filter, p_page: input.page, p_selected_id: selectedId,
  }, (value) => {
    const parsed = parseAssistanceQueue(value, tournamentId);
    return parsed && parsed.filter === input.filter &&
      (!parsed.selectedRequest || parsed.selectedRequest.id === selectedId) ? parsed : null;
  });
}

export async function setPrivateAssistanceStatus(input: AssistanceStatusInput): Promise<AssistanceResult<{ request: AssistanceRequest; changed: boolean }>> {
  const denied = await authorizePrivateAssistance(true, true);
  if (denied) return { ok: false, code: denied };
  if (!isAssistanceRecord(input) || !hasAssistanceKeys(input, ["requestId", "tournamentId", "status", "expectedVersion"]) ||
    !isAssistanceUuid(input.requestId) || !isAssistanceUuid(input.tournamentId) || !isAssistanceStatus(input.status) ||
    !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    return { ok: false, code: "invalid_request" };
  }
  const requestId = input.requestId.toLowerCase();
  const tournamentId = input.tournamentId.toLowerCase();
  return callPrivateAssistance("set_private_assistance_status", {
    p_tournament_id: tournamentId, p_request_id: requestId, p_status: input.status, p_expected_version: input.expectedVersion,
  }, (value) => {
    if (!isAssistanceRecord(value) || typeof value.changed !== "boolean") return null;
    const request = parseAssistanceRequest(value.request);
    return request?.id === requestId && request.tournamentId === tournamentId && request.status === input.status
      ? { request, changed: value.changed } : null;
  });
}
