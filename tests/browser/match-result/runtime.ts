// Test-only module aliases. No credentials, network calls or database writes.
import { uxMatch, uxReport } from "@/tests/fixtures/match-result-ux";
import type { MatchResultActionState } from "@/app/tournaments/match-actions";
import {
  isAssistanceBody,
  type AssistanceContext,
  type AssistanceConversation,
  type AssistanceHistoryInput,
  type AssistanceMessage,
  type AssistanceMutation,
  type AssistanceOpenInput,
  type AssistanceRequest,
  type AssistanceResult,
  type AssistanceRoom,
} from "@/lib/private-assistance";
import type { MatchResultReportGroup } from "@/lib/tournaments";

export let report: MatchResultReportGroup | null = null;
export function setReport(value: MatchResultReportGroup | null) {
  report = value;
  window.dispatchEvent(new Event("fixture-result"));
}
const token = async () => "fixture-only";
export function useAuth() {
  return {
    getToken: token,
    isLoaded: true,
    userId: "fixture-player",
    sessionId: "fixture-session",
  };
}
export function useRouter() {
  return {
    refresh() {
      window.dispatchEvent(new Event("fixture-result"));
    },
  };
}
export function createAuthenticatedBrowserSupabaseClient() {
  return {
    storage: {
      from() {
        return {
          async uploadToSignedUrl(path: string) {
            return { data: { path }, error: null };
          },
        };
      },
    },
  };
}
export async function prepareMatchReplayUploads(input: {
  replayFiles: { name: string; size: number }[];
  playerOneScore: number;
  playerTwoScore: number;
  winnerRegistrationId: string;
}) {
  Object.assign(uxReport, {
    playerOneScore: input.playerOneScore,
    playerTwoScore: input.playerTwoScore,
    winnerRegistrationId: input.winnerRegistrationId,
    replayProofs: input.replayFiles.map((_, index) => ({
      id: "fixture-" + index,
      gameNumber: index + 1,
      proofAvailable: true,
      replayAccessHref: null,
    })),
  });
  return {
    status: "success",
    bucket: "fixture-only",
    attemptId: "fixture-only",
    uploads: input.replayFiles.map((_, index) => ({
      gameNumber: index + 1,
      path: "fixture-" + index + ".rec",
      token: "fixture-only",
    })),
  };
}
export async function finalizeMatchResult() {
  setReport({
    ...uxReport,
    createdAt: new Date().toISOString(),
    confirmationDeadlineAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  });
  return { status: "success", message: "Fixture saved" };
}
export async function cleanupPreparedReplayUploads() {
  return { status: "success", removedCount: 0 };
}
export async function confirmMatchResultReportGroup(): Promise<MatchResultActionState> {
  if (report)
    setReport({
      ...report,
      status: "confirmed",
      finalizedAt: new Date().toISOString(),
      finalizedSource: "opponent_confirmation",
    });
  return { status: "success", message: "Fixture confirmed" };
}
export async function disputeMatchResultReportGroup(): Promise<MatchResultActionState> {
  if (report) setReport({ ...report, status: "disputed" });
  return { status: "success", message: "Fixture disputed" };
}
export async function submitNoShowReport(): Promise<MatchResultActionState> {
  return { status: "error", message: "Fixture only" };
}
export const reviewMatchResult = submitNoShowReport;
export const reviewMatchResultReportGroup = submitNoShowReport;
export const saveAdminMatchResult = submitNoShowReport;
export const resetAdminMatch = submitNoShowReport;

export const fixtureRoomId = "55555555-5555-4555-8555-555555555555";
const room: AssistanceRoom = {
  roomId: fixtureRoomId,
  matchId: uxMatch.id,
  matchReference: "Quarterfinal",
  tournamentId: "66666666-6666-4666-8666-666666666666",
  tournamentTitle: "Fixture tournament",
  tournamentBracketId: "77777777-7777-4777-8777-777777777777",
  divisionName: "Academy",
  reference: "Fixture tournament · Academy · Quarterfinal",
};
let request: AssistanceRequest | null = null;
let message: AssistanceMessage | null = null;

export async function getPrivateAssistanceContext(
  input: { roomId: string },
): Promise<AssistanceResult<AssistanceContext>> {
  if (input.roomId !== fixtureRoomId) return { ok: false, code: "forbidden" };
  return {
    ok: true,
    data: { room, request, newRequestsEnabled: true, canCreate: !request, discordUrl: null },
  };
}

export async function openPrivateAssistance(
  input: AssistanceOpenInput,
): Promise<AssistanceResult<AssistanceMutation>> {
  if (input.roomId !== fixtureRoomId) return { ok: false, code: "forbidden" };
  if (!isAssistanceBody(input.body)) return { ok: false, code: "invalid_request" };
  if (request) return { ok: false, code: "conflict" };
  const now = new Date().toISOString();
  request = {
    ...room,
    id: crypto.randomUUID(),
    requesterRegistrationId: uxMatch.playerOneRegistrationId!,
    requesterName: "Marco",
    status: "open",
    version: 1,
    lastSequence: 1,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    contentPurgedAt: null,
  };
  message = {
    id: crypto.randomUUID(),
    requestId: request.id,
    sequence: 1,
    senderKind: "requester",
    body: input.body,
    createdAt: now,
    redactedAt: null,
  };
  return {
    ok: true,
    data: { request, message, accepted: true, acceptedClientMessageId: input.clientMessageId, duplicate: false },
  };
}

export async function readPrivateAssistance(
  input: AssistanceHistoryInput,
): Promise<AssistanceResult<AssistanceConversation>> {
  if (!request || input.requestId !== request.id || input.tournamentId !== room.tournamentId) {
    return { ok: false, code: "forbidden" };
  }
  const messages = message && input.afterSequence < message.sequence ? [message] : [];
  return {
    ok: true,
    data: {
      request,
      messages,
      hasMore: false,
      nextAfterSequence: messages[0]?.sequence ?? input.afterSequence,
      canReply: true,
      canSetStatus: false,
    },
  };
}

export async function replyPrivateAssistance() {
  return { ok: false as const, code: "forbidden" as const };
}
export const setPrivateAssistanceStatus = replyPrivateAssistance;
export async function getMatchRoomOpponentDiscord() {
  return { discordUsername: null };
}
