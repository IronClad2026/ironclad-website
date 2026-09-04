// Test-only module aliases. No credentials, network calls or database writes.
import { uxMatch, uxReport } from "@/tests/fixtures/match-result-ux";
import type { MatchResultActionState } from "@/app/tournaments/match-actions";
import type { MatchResultReportGroup } from "@/lib/tournaments";

export let report: MatchResultReportGroup | null = null;
export function setReport(value: MatchResultReportGroup | null) {
  report = value;
  window.dispatchEvent(new Event("fixture-result"));
}
const token = async () => "fixture-only";
export function useAuth() {
  return { getToken: token };
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
