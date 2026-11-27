// Test-only module aliases. No credentials, network calls or database writes.
import { uxMatch, uxReport } from "@/tests/fixtures/match-result-ux";
import type { MatchResultActionState } from "@/app/tournaments/match-actions";
import type { MatchResultReportGroup } from "@/lib/tournaments";
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
} from "@/lib/private-assistance";

export let report: MatchResultReportGroup | null = null;
export function setReport(value: MatchResultReportGroup | null) {
  report = value;
  window.dispatchEvent(new Event("fixture-result"));
}
const token = async () => "fixture-only";
export function useAuth() {
  return { getToken: token, isLoaded: true, userId: "user_MatchResultFixture", sessionId: "session_MatchResultFixture" };
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
export const fixtureMatch = uxMatch;


let assistanceVersion = 0;
let assistanceRequestedAt: string | null = null;
export async function getMatchRoomAssistance(input: { roomId: string }) {
  return { ok: true as const, data: {
    roomId: input.roomId, status: assistanceVersion ? "requested" as const : "none" as const,
    requestVersion: assistanceVersion, requestedAt: assistanceRequestedAt, resolvedAt: null, canResolve: false,
  } };
}
export async function requestMatchAdminAssistance(input: { roomId: string; expectedRequestVersion: number }) {
  if (input.expectedRequestVersion !== assistanceVersion) return { ok: false as const, code: "stale_room" as const };
  if (!assistanceVersion) { assistanceVersion = 1; assistanceRequestedAt = new Date().toISOString(); }
  return getMatchRoomAssistance(input);
}
export async function resolveMatchAdminAssistance() {
  return { ok: false as const, code: "forbidden" as const };
}
export async function getMatchRoomOpponentDiscord() {
  return { discordUsername: null };
}

const roomId = "22222222-2222-4222-8222-222222222222";
const room = {
  roomId, matchId: uxMatch.id, tournamentId: "55555555-5555-4555-8555-555555555555",
  tournamentBracketId: "66666666-6666-4666-8666-666666666666",
  tournamentTitle: "Fixture Tournament", divisionName: "Academy", matchReference: "Quarterfinal 1",
  reference: "Fixture Tournament / Academy / Quarterfinal 1",
};
const forbidden = { ok: false, code: "forbidden" } as const;
let assistance: { request: AssistanceRequest; message: AssistanceMessage; clientMessageId: string } | null = null;

export async function getPrivateAssistanceContext(input: { roomId: string }): Promise<AssistanceResult<AssistanceContext>> {
  if (input.roomId !== roomId) return forbidden;
  return { ok: true, data: { room, newRequestsEnabled: true, canCreate: !assistance, request: assistance?.request ?? null, discordUrl: null } };
}

export async function openPrivateAssistance(input: AssistanceOpenInput): Promise<AssistanceResult<AssistanceMutation>> {
  if (input.roomId !== roomId) return forbidden;
  if (!isAssistanceBody(input.body)) return { ok: false, code: "invalid_request" };
  const duplicate = assistance !== null;
  if (!assistance) {
    const createdAt = new Date().toISOString();
    const request: AssistanceRequest = {
      ...room, id: "77777777-7777-4777-8777-777777777777", requesterRegistrationId: uxMatch.playerOneRegistrationId!,
      requesterName: "Marco", status: "open", version: 1, lastSequence: 1,
      createdAt, updatedAt: createdAt, resolvedAt: null, contentPurgedAt: null,
    };
    assistance = { request, clientMessageId: input.clientMessageId, message: {
      id: "88888888-8888-4888-8888-888888888888", requestId: request.id, sequence: 1,
      senderKind: "requester", body: input.body.trim(), createdAt, redactedAt: null,
    } };
  }
  const accepted = assistance.clientMessageId === input.clientMessageId;
  return { ok: true, data: {
    request: assistance.request, message: accepted ? assistance.message : null,
    accepted, acceptedClientMessageId: accepted ? input.clientMessageId : null, duplicate: duplicate && accepted,
  } };
}

export async function readPrivateAssistance(input: AssistanceHistoryInput): Promise<AssistanceResult<AssistanceConversation>> {
  if (!assistance || assistance.request.id !== input.requestId || assistance.request.tournamentId !== input.tournamentId) return forbidden;
  return { ok: true, data: {
    request: assistance.request, messages: input.afterSequence === 0 ? [assistance.message] : [],
    hasMore: false, nextAfterSequence: 1, canReply: true, canSetStatus: false,
  } };
}

export async function replyPrivateAssistance() { return forbidden; }
export async function setPrivateAssistanceStatus() { return forbidden; }
