"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmMatchResultReportGroup,
  disputeMatchResultReportGroup,
  type MatchResultActionState,
} from "@/app/tournaments/match-actions";
import MatchConfirmationCountdown from "@/components/MatchConfirmationCountdown";
import useHydrationSafeNow from "@/components/useHydrationSafeNow";
import { useOptionalTranslations } from "@/components/i18n/LocaleProvider";
import competitionEnglish from "@/lib/i18n/dictionaries/en/competition";
import { getConfirmationTiming } from "@/lib/match-result-entry";
import type {
  GeneratedTournamentMatch,
  MatchResultReportGroup,
  TournamentParticipant,
} from "@/lib/tournaments";

const initialState: MatchResultActionState = { status: "idle", message: "" };

export default function PlayerMatchResultStatus({
  match,
  report,
  participantsById,
  viewerRegistrationId,
  canRespond,
}: {
  match: GeneratedTournamentMatch;
  report: MatchResultReportGroup | null;
  participantsById: Map<string, TournamentParticipant>;
  viewerRegistrationId: string | null;
  canRespond: boolean;
}) {
  const t = useOptionalTranslations("competition", competitionEnglish);
  const router = useRouter();
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [confirmState, confirmAction, confirming] = useActionState(
    confirmMatchResultReportGroup,
    initialState
  );
  const [disputeState, disputeAction, disputing] = useActionState(
    disputeMatchResultReportGroup,
    initialState
  );
  const pending =
    report?.status === "pending_confirmation" && !report.finalizedAt;
  const now = useHydrationSafeNow({ enabled: pending });
  const { deadline } = getConfirmationTiming(
    report?.confirmationDeadlineAt ?? null,
    report?.createdAt ?? null
  );
  const open = pending && deadline !== null && now !== null && now < deadline;
  const expired =
    pending && deadline !== null && now !== null && now >= deadline;
  const official =
    match.status === "completed" &&
    Boolean(match.winnerRegistrationId) &&
    !match.outcomeType;
  const autoConfirmed =
    official &&
    report?.status === "auto_approved" &&
    report.finalizedSource === "cron_auto_approval";
  const review =
    report?.status === "disputed" ||
    report?.status === "under_review" ||
    disputeState.status === "success";
  const isSubmitter =
    report?.submittedByRegistrationId === viewerRegistrationId;
  const participantName = (registrationId: string | null) =>
    (registrationId && participantsById.get(registrationId)?.name) ||
    t("matchControls.participant");
  const winnerId = official
    ? match.winnerRegistrationId
    : (report?.winnerRegistrationId ?? null);
  const loserId =
    winnerId === match.playerOneRegistrationId
      ? match.playerTwoRegistrationId
      : match.playerOneRegistrationId;
  const oneScore = official ? match.playerOneScore : report?.playerOneScore;
  const twoScore = official ? match.playerTwoScore : report?.playerTwoScore;
  const result =
    winnerId && oneScore != null && twoScore != null
      ? t("resultUx.namedResult", {
          winner: participantName(winnerId),
          loser: participantName(loserId),
          winnerScore: Math.max(oneScore, twoScore),
          loserScore: Math.min(oneScore, twoScore),
        })
      : null;
  const actionState =
    disputeState.status !== "idle" ? disputeState : confirmState;
  const actionComplete =
    confirmState.status === "success" || disputeState.status === "success";
  useEffect(() => {
    if (actionComplete) router.refresh();
  }, [actionComplete, router]);
  const canAct =
    canRespond &&
    viewerRegistrationId === report?.opponentRegistrationId &&
    open &&
    !review &&
    !official &&
    !actionComplete;

  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-orange-400/20 bg-black/20 p-4 sm:p-5">
      <h4 className="text-sm font-black uppercase tracking-wide text-orange-200">
        {t(
          official
            ? autoConfirmed
              ? "resultUx.autoConfirmed"
              : "resultUx.confirmed"
            : review
              ? "resultUx.underReview"
              : expired
                ? "resultUx.windowEnded"
                : isSubmitter
                  ? "resultUx.waiting"
                  : "resultUx.confirmationRequired"
        )}
      </h4>
      {!official && report && (
        <p className="text-xs text-zinc-400">
          {t(isSubmitter ? "resultUx.youReported" : "resultUx.reportedBy", {
            name: participantName(report.submittedByRegistrationId),
          })}
        </p>
      )}
      {result && (
        <p className="break-words text-base font-bold text-white">{result}</p>
      )}
      {report && (
        <p className="text-xs text-zinc-400">
          {report.resultType === "no_show"
            ? t("matchControls.noReplayNoShow")
            : t("resultUx.filesSubmitted", {
                count: report.replayProofs.length,
              })}
        </p>
      )}
      {official ? (
        <>
          <p className="text-sm text-zinc-300">
            {autoConfirmed && t("resultUx.expiredConfirmed")}
          </p>
          <p className="text-sm text-zinc-300">{t("resultUx.advanced")}</p>
        </>
      ) : review ? (
        <p className="text-sm text-zinc-300">
          {t("resultUx.reviewExplanation")}
        </p>
      ) : (
        pending &&
        report && (
          <MatchConfirmationCountdown
            deadlineAt={report.confirmationDeadlineAt}
            createdAt={report.createdAt}
            isSubmitter={Boolean(isSubmitter)}
          />
        )
      )}
      {actionState.status === "error" && (
        <p role="alert" className="text-sm text-red-300">
          {t(
            actionState.code === "stale_conflict"
              ? "resultUx.stale"
              : "resultUx.actionFailed"
          )}
        </p>
      )}
      {confirmState.status === "success" && !official && (
        <p role="status" className="text-sm text-zinc-300">
          {t("resultUx.refreshSaved")}
        </p>
      )}
      {canAct && report && (
        <div className="space-y-3">
          <form action={confirmAction}>
            <input type="hidden" name="reportGroupId" value={report.id} />
            <button
              type="submit"
              disabled={confirming || disputing}
              className="min-h-12 w-full rounded-lg bg-orange-500 px-4 py-3 text-sm font-black text-black hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 disabled:opacity-50"
            >
              {t(confirming ? "resultForm.submitting" : "resultUx.confirm")}
            </button>
          </form>
          <button
            type="button"
            disabled={confirming || disputing}
            aria-expanded={disputeOpen}
            onClick={() => setDisputeOpen(!disputeOpen)}
            className="min-h-11 w-full rounded-lg border border-white/20 px-4 py-2 text-sm font-bold text-zinc-300 focus-visible:outline focus-visible:outline-orange-400"
          >
            {t("resultUx.dispute")}
          </button>
          {disputeOpen && (
            <form action={disputeAction} className="space-y-3">
              <input type="hidden" name="reportGroupId" value={report.id} />
              <label className="block text-sm text-zinc-300">
                {t("matchControls.disputeNotes")}
                <textarea
                  name="disputeNotes"
                  rows={3}
                  maxLength={2000}
                  disabled={confirming || disputing}
                  className="mt-2 w-full rounded-lg border border-white/20 bg-zinc-950 p-3 text-base text-white focus-visible:outline focus-visible:outline-orange-400"
                />
              </label>
              <button
                type="submit"
                disabled={confirming || disputing}
                className="min-h-11 w-full rounded-lg border border-red-400/40 px-4 py-2 text-sm font-bold text-red-200 focus-visible:outline focus-visible:outline-orange-400 disabled:opacity-50"
              >
                {t(
                  disputing ? "resultForm.submitting" : "resultUx.sendDispute"
                )}
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
