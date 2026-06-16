"use client";

import { useActionState, useState } from "react";
import {
  editAdminMatchParticipants,
  resetAdminMatch,
  saveAdminMatchResult,
  reviewMatchResult,
  reviewMatchResultReportGroup,
  type MatchResultActionState,
} from "@/app/tournaments/match-actions";
import AdminMatchResultSummaries from "@/components/AdminMatchResultSummaries";
import PlayerMatchResultForm from "@/components/PlayerMatchResultForm";
import type {
  GeneratedTournamentMatch,
  MatchResultReportGroup,
  MatchResultSubmission,
  TournamentParticipant,
} from "@/lib/tournaments";

const initialState: MatchResultActionState = {
  status: "idle",
  message: "",
};

export default function MatchResultControls({
  match,
  participantsById,
  isAdmin,
  canSubmit,
  viewerClerkUserId,
  submissions,
  reportGroups,
  participantOptions,
  showDirectAdminControls = false,
  presentation = "inline",
}: {
  match: GeneratedTournamentMatch;
  participantsById: Map<string, TournamentParticipant>;
  isAdmin: boolean;
  canSubmit: boolean;
  viewerClerkUserId: string | null;
  submissions: MatchResultSubmission[];
  reportGroups: MatchResultReportGroup[];
  participantOptions?: TournamentParticipant[];
  showDirectAdminControls?: boolean;
  presentation?: "inline" | "workspace";
}) {
  const [expanded, setExpanded] = useState(false);
  const playerOne = match.playerOneRegistrationId
    ? participantsById.get(match.playerOneRegistrationId)
    : null;
  const playerTwo = match.playerTwoRegistrationId
    ? participantsById.get(match.playerTwoRegistrationId)
    : null;
  const hasParticipants = Boolean(playerOne && playerTwo);
  const pendingSubmission = submissions.find(
    (submission) => submission.status === "pending"
  );
  const activeReportGroup = reportGroups.find(
    (reportGroup) =>
      reportGroup.finalizedAt === null &&
      ["pending_confirmation", "disputed", "under_review"].includes(
        reportGroup.status
      )
  );
  const availableParticipantOptions =
    participantOptions ?? Array.from(participantsById.values());
  const canOpenForReportGroups = reportGroups.length > 0;
  const canSubmitNewReport =
    canSubmit &&
    hasParticipants &&
    match.status !== "completed" &&
    !activeReportGroup &&
    !pendingSubmission;

  if (!isAdmin && !canSubmit && submissions.length === 0 && !canOpenForReportGroups) {
    return null;
  }

  const content = (
    <div
      className={
        presentation === "workspace"
          ? "grid gap-6 xl:grid-cols-2"
          : "space-y-4"
      }
    >
          {isAdmin && match.status === "completed" && (
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3 text-[10px] leading-5 text-slate-400">
              <p className="font-black uppercase tracking-wider text-emerald-200">
                Official Result Audit
              </p>
              <p className="mt-2 break-all">
                Submission ID:{" "}
                <span className="font-mono text-slate-200">
                  {match.officialResultSubmissionId ?? "Direct admin entry"}
                </span>
              </p>
              <p className="break-all">
                Decided by:{" "}
                <span className="font-mono text-slate-200">
                  {match.officialResultDecidedBy ?? "Legacy result"}
                </span>
              </p>
              <p>
                Decided at:{" "}
                <span className="text-slate-200">
                  {match.officialResultDecidedAt
                    ? new Date(
                        match.officialResultDecidedAt
                      ).toLocaleString()
                    : "Not recorded"}
                </span>
              </p>
            </div>
          )}

          {isAdmin && hasParticipants && (
            <div className="rounded-2xl border border-orange-400/20 bg-orange-500/[0.04] p-5">
              <ResultEntryForm
                match={match}
                playerOneName={playerOne?.name ?? "Player 1"}
                playerTwoName={playerTwo?.name ?? "Player 2"}
              />
            </div>
          )}

          {isAdmin && showDirectAdminControls && (
            <div className="grid gap-4 xl:col-span-2 lg:grid-cols-2">
              <AdminParticipantEditForm
                match={match}
                participantOptions={availableParticipantOptions}
              />
              <AdminResetMatchForm match={match} />
            </div>
          )}

          {canSubmitNewReport && (
              <div className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.04] p-5">
                <PlayerMatchResultForm
                  match={match}
                  playerOneName={playerOne?.name ?? "Player 1"}
                  playerTwoName={playerTwo?.name ?? "Player 2"}
                />
              </div>
            )}

          {canSubmit &&
            activeReportGroup &&
            match.status !== "completed" && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-100/80">
                {activeReportGroup.submittedByClerkUserId ===
                viewerClerkUserId
                  ? "Your result is awaiting opponent confirmation."
                  : "Your opponent submitted a result. Confirm or dispute it from your dashboard notification."}
              </div>
            )}

          {canSubmit &&
            pendingSubmission &&
            match.status !== "completed" &&
            !activeReportGroup && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-100/80">
                This match has a legacy report awaiting administrator review.
              </div>
            )}

          {reportGroups.length > 0 && (
            <div className="space-y-4 xl:col-span-2">
              {reportGroups.map((reportGroup) => (
                <ReportGroupReview
                  key={reportGroup.id}
                  reportGroup={reportGroup}
                  match={match}
                  isAdmin={isAdmin}
                  participantsById={participantsById}
                />
              ))}
            </div>
          )}

          {submissions.length > 0 && (
            <div className="space-y-4 xl:col-span-2">
              {isAdmin ? (
                <AdminMatchResultSummaries
                  match={match}
                  submissions={submissions}
                  participantsById={participantsById}
                />
              ) : (
                submissions.map((submission) => (
                  <SubmissionReview
                    key={submission.id}
                    match={match}
                    submission={submission}
                    isAdmin={false}
                    participantsById={participantsById}
                  />
                ))
              )}
            </div>
          )}

          {!hasParticipants && (
            <p className="text-xs text-slate-500">
              Both participants must be assigned before a result can be
              recorded.
            </p>
          )}
    </div>
  );

  if (presentation === "workspace") {
    return content;
  }

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-black/35">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.18em] text-orange-300 transition hover:bg-orange-500/10"
      >
        <span>
          {isAdmin
            ? activeReportGroup
              ? "Confirmation Review Required"
              : pendingSubmission
                ? "Result Review Required"
                : "Manage Match Result"
            : activeReportGroup
              ? "Result Pending Confirmation"
              : pendingSubmission
                ? "Result Pending Review"
                : "Submit Match Result"}
        </span>
        <span className="text-slate-500">{expanded ? "Hide" : "Open"}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/10 p-3">{content}</div>
      )}
    </div>
  );
}

function ResultEntryForm({
  match,
  playerOneName,
  playerTwoName,
}: {
  match: GeneratedTournamentMatch;
  playerOneName: string;
  playerTwoName: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveAdminMatchResult,
    initialState
  );
  const winsRequired = Math.floor(match.seriesBestOf / 2) + 1;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="matchId" value={match.id} />
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-white">
          Official Result Entry
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Best of {match.seriesBestOf} · winner requires {winsRequired} wins
        </p>
      </div>

      <div className="grid grid-cols-[1fr_90px] gap-3">
        <label className="min-w-0">
          <span className="block truncate text-xs font-bold text-slate-300">
            {playerOneName}
          </span>
          <input
            name="playerOneScore"
            type="number"
            min="0"
            max={winsRequired}
            required
            defaultValue={match.playerOneScore ?? ""}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-orange-400"
          />
        </label>
        <span className="self-end pb-2 text-center text-xs text-slate-600">
          Score
        </span>
      </div>

      <div className="grid grid-cols-[1fr_90px] gap-3">
        <label className="min-w-0">
          <span className="block truncate text-xs font-bold text-slate-300">
            {playerTwoName}
          </span>
          <input
            name="playerTwoScore"
            type="number"
            min="0"
            max={winsRequired}
            required
            defaultValue={match.playerTwoScore ?? ""}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-orange-400"
          />
        </label>
        <span className="self-end pb-2 text-center text-xs text-slate-600">
          Score
        </span>
      </div>

      <label className="block">
        <span className="text-xs font-bold text-slate-300">Winner</span>
        <select
          name="winnerRegistrationId"
          required
          defaultValue={match.winnerRegistrationId ?? ""}
          className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-orange-400"
        >
          <option value="">Select winner</option>
          <option value={match.playerOneRegistrationId ?? ""}>
            {playerOneName}
          </option>
          <option value={match.playerTwoRegistrationId ?? ""}>
            {playerTwoName}
          </option>
        </select>
      </label>

      <ActionMessage state={state} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-orange-500 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-400 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Complete Match & Advance Winner"}
      </button>
    </form>
  );
}

function AdminParticipantEditForm({
  match,
  participantOptions,
}: {
  match: GeneratedTournamentMatch;
  participantOptions: TournamentParticipant[];
}) {
  const [state, formAction, pending] = useActionState(
    editAdminMatchParticipants,
    initialState
  );
  const uniqueOptions = Array.from(
    new Map(
      participantOptions.map((participant) => [
        participant.registrationId,
        participant,
      ])
    ).values()
  ).sort((left, right) => left.name.localeCompare(right.name));

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.04] p-5"
    >
      <input type="hidden" name="matchId" value={match.id} />
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-white">
          Edit Participants
        </p>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">
          Allowed only before reports, official results, or dependent bracket
          activity exist.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold text-slate-300">Player 1</span>
          <select
            name="playerOneRegistrationId"
            defaultValue={match.playerOneRegistrationId ?? ""}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-xs text-white outline-none focus:border-orange-400"
          >
            <option value="">TBD / Empty slot</option>
            {uniqueOptions.map((participant) => (
              <option
                key={`p1-${participant.registrationId}`}
                value={participant.registrationId}
              >
                {participant.name} ({formatSubmissionStatusLabel(participant.status)})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-bold text-slate-300">Player 2</span>
          <select
            name="playerTwoRegistrationId"
            defaultValue={match.playerTwoRegistrationId ?? ""}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-xs text-white outline-none focus:border-orange-400"
          >
            <option value="">TBD / Empty slot</option>
            {uniqueOptions.map((participant) => (
              <option
                key={`p2-${participant.registrationId}`}
                value={participant.registrationId}
              >
                {participant.name} ({formatSubmissionStatusLabel(participant.status)})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <ActionMessage state={state} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-3 w-full rounded-xl border border-sky-400/30 bg-sky-500/15 px-4 py-3 text-xs font-black uppercase tracking-wider text-sky-100 transition hover:border-sky-300 hover:bg-sky-500/25 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save Participants"}
      </button>
    </form>
  );
}

function AdminResetMatchForm({ match }: { match: GeneratedTournamentMatch }) {
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState(
    resetAdminMatch,
    initialState
  );

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-red-400/25 bg-red-500/[0.05] p-5"
    >
      <input type="hidden" name="matchId" value={match.id} />
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-red-200">
          Destructive Action
        </p>
        <p className="mt-1 text-sm font-black uppercase tracking-wider text-white">
          Reset Match
        </p>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">
          Resets pending review state when safe. Replay and proof records are
          preserved for audit. Completed or downstream-dependent matches are
          blocked server-side.
        </p>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-bold text-slate-300">
          Type RESET to continue
        </span>
        <input
          name="confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="mt-2 w-full rounded-xl border border-red-400/20 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-red-300"
        />
      </label>

      <div className="mt-4">
        <ActionMessage state={state} />
      </div>
      <button
        type="submit"
        disabled={pending || confirmation !== "RESET"}
        className="mt-3 w-full rounded-xl bg-red-700 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-red-600 disabled:opacity-50"
      >
        {pending ? "Resetting..." : "Reset Match"}
      </button>
    </form>
  );
}

function ReportGroupReview({
  reportGroup,
  match,
  isAdmin,
  participantsById,
}: {
  reportGroup: MatchResultReportGroup;
  match: GeneratedTournamentMatch;
  isAdmin: boolean;
  participantsById: Map<string, TournamentParticipant>;
}) {
  const [state, formAction, pending] = useActionState(
    reviewMatchResultReportGroup,
    initialState
  );
  const reporter = participantName(
    participantsById,
    reportGroup.submittedByRegistrationId
  );
  const opponent = participantName(
    participantsById,
    reportGroup.opponentRegistrationId
  );
  const winner = participantName(
    participantsById,
    reportGroup.winnerRegistrationId
  );
  const loserRegistrationId =
    reportGroup.winnerRegistrationId === match.playerOneRegistrationId
      ? match.playerTwoRegistrationId
      : match.playerOneRegistrationId;
  const loser = loserRegistrationId
    ? participantName(participantsById, loserRegistrationId)
    : "Participant";
  const actionable =
    reportGroup.finalizedAt === null &&
    ["pending_confirmation", "disputed", "under_review"].includes(
      reportGroup.status
    );

  return (
    <div className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-sky-200">
            Confirmation Package - {formatReportGroupStatus(reportGroup.status)}
          </p>
          <p className="mt-2 text-sm text-white">
            {reportGroup.playerOneScore}-{reportGroup.playerTwoScore}{" "}
            reported for {winner}
          </p>
        </div>
        <span className="text-[10px] text-slate-500">
          {new Date(reportGroup.createdAt).toLocaleString()}
        </span>
      </div>

      <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-black/25 p-4 text-xs text-slate-300 sm:grid-cols-2">
        <SummaryValue
          label="Match"
          value={`${match.roundName} - Match ${match.matchNumber}`}
        />
        <SummaryValue label="Reporting Player" value={reporter} />
        <SummaryValue label="Opponent" value={opponent} />
        <SummaryValue label="Reported Winner" value={winner} />
        <SummaryValue label="Reported Loser" value={loser} />
        <SummaryValue
          label="Confirmation Deadline"
          value={new Date(reportGroup.confirmationDeadlineAt).toLocaleString()}
        />
        {reportGroup.finalizedSource && (
          <SummaryValue
            label="Finalized By"
            value={formatFinalizedSource(reportGroup.finalizedSource)}
          />
        )}
      </div>

      {reportGroup.disputeNotes && (
        <div className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-red-200">
            Dispute Notes
          </p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-red-100/80">
            {reportGroup.disputeNotes}
          </p>
        </div>
      )}

      {reportGroup.reviewNotes && (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-orange-300">
            Review Notes
          </p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-300">
            {reportGroup.reviewNotes}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {reportGroup.replayProofs.length > 0 ? (
          reportGroup.replayProofs.map((proof) =>
            proof.replayProofUrl ? (
              <a
                key={`${proof.gameNumber}:${proof.replayStoragePath}`}
                href={proof.replayProofUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-sky-200"
              >
                Game {proof.gameNumber} Replay
              </a>
            ) : (
              <span
                key={`${proof.gameNumber}:${proof.replayStoragePath}`}
                className="rounded-md border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] uppercase tracking-wider text-red-200"
              >
                Game {proof.gameNumber} replay unavailable
              </span>
            )
          )
        ) : (
          <span className="rounded-md border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] uppercase tracking-wider text-red-200">
            Replay unavailable
          </span>
        )}
      </div>

      {isAdmin && actionable && (
        <form action={formAction} className="mt-4 space-y-2">
          <input type="hidden" name="reportGroupId" value={reportGroup.id} />
          <textarea
            name="reviewNotes"
            maxLength={2000}
            rows={2}
            placeholder="Administrator message (required for rejection)"
            className="w-full resize-none rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-orange-400"
          />
          <ActionMessage state={state} />
          <div className="grid gap-2 sm:grid-cols-3">
            <ReportGroupReviewButton
              decision="approved"
              label="Approve Result"
              disabled={pending}
              className="bg-emerald-600 hover:bg-emerald-500"
            />
            <ReportGroupReviewButton
              decision="under_review"
              label="Mark Under Review"
              disabled={pending}
              className="bg-amber-600 hover:bg-amber-500"
            />
            <ReportGroupReviewButton
              decision="rejected"
              label="Reject Result"
              disabled={pending}
              className="bg-red-700 hover:bg-red-600"
            />
          </div>
        </form>
      )}
    </div>
  );
}

function ReportGroupReviewButton({
  decision,
  label,
  disabled,
  className,
}: {
  decision: string;
  label: string;
  disabled: boolean;
  className: string;
}) {
  return (
    <button
      type="submit"
      name="decision"
      value={decision}
      disabled={disabled}
      className={`rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-wider text-white transition disabled:opacity-50 ${className}`}
    >
      {label}
    </button>
  );
}

function SubmissionReview({
  match,
  submission,
  isAdmin,
  participantsById,
}: {
  match: GeneratedTournamentMatch;
  submission: MatchResultSubmission;
  isAdmin: boolean;
  participantsById: Map<string, TournamentParticipant>;
}) {
  const [state, formAction, pending] = useActionState(
    reviewMatchResult,
    initialState
  );
  const winner =
    participantsById.get(submission.claimedWinnerRegistrationId)?.name ??
    "Participant";
  const loserRegistrationId =
    submission.claimedWinnerRegistrationId === match.playerOneRegistrationId
      ? match.playerTwoRegistrationId
      : match.playerOneRegistrationId;
  const loser = loserRegistrationId
    ? participantsById.get(loserRegistrationId)?.name ?? "Participant"
    : "Participant";
  const reporter = submission.submittedByRegistrationId
    ? participantsById.get(submission.submittedByRegistrationId)?.name ??
      "Participant"
    : submission.submittedByClerkUserId;

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wider text-amber-200">
          Submission #{submission.submissionNumber} ·{" "}
          {formatSubmissionStatus(submission.status)}
        </p>
        <span className="text-[10px] text-slate-500">
          {new Date(submission.createdAt).toLocaleString()}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-2">
        <p>
          Match:{" "}
          <strong className="text-white">
            {match.roundName} · Match {match.matchNumber}
          </strong>
        </p>
        <p>
          Reporting player: <strong className="text-white">{reporter}</strong>
        </p>
        <p>
          Reported winner: <strong className="text-white">{winner}</strong>
        </p>
        <p>
          Reported loser: <strong className="text-white">{loser}</strong>
        </p>
      </div>
      <p className="mt-2 text-xs text-slate-300">
        Claimed winner: <strong className="text-white">{winner}</strong>
        {" · "}
        Score {submission.playerOneScore}-{submission.playerTwoScore}
      </p>
      {isAdmin && (
        <div className="mt-3 grid gap-2 rounded-lg border border-white/10 bg-black/30 p-3 text-[10px] text-slate-400 sm:grid-cols-2">
          <p className="break-all">
            Submission ID:{" "}
            <span className="font-mono text-slate-200">{submission.id}</span>
          </p>
          <p className="break-all">
            Submitted by:{" "}
            <span className="font-mono text-slate-200">
              {submission.submittedByClerkUserId}
            </span>
          </p>
          <p className="break-all">
            Reviewed by:{" "}
            <span className="font-mono text-slate-200">
              {submission.reviewedBy ?? "Pending"}
            </span>
          </p>
          <p>
            Reviewed at:{" "}
            <span className="text-slate-200">
              {submission.reviewedAt
                ? new Date(submission.reviewedAt).toLocaleString()
                : "Pending"}
            </span>
          </p>
        </div>
      )}
      {submission.notes && (
        <p className="mt-2 text-xs leading-5 text-slate-400">
          {submission.notes}
        </p>
      )}
      {submission.reviewNotes && (
        <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-orange-300">
            Administrator Message
          </p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-300">
            {submission.reviewNotes}
          </p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {submission.replayProofUrl && (
          <a
            href={submission.replayProofUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-sky-200"
          >
            Download Replay
          </a>
        )}
        {submission.screenshotProofUrl && (
          <a
            href={submission.screenshotProofUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-sky-200"
          >
            View Screenshot
          </a>
        )}
      </div>
      {isAdmin && (
        <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/60 p-3 text-[10px] leading-5 text-slate-500">
          <p>
            Storage bucket:{" "}
            <span className="font-mono text-slate-300">match-proofs</span>
          </p>
          {submission.replayStoragePath && (
            <p className="break-all">
              Replay path:{" "}
              <span className="font-mono text-slate-300">
                {submission.replayStoragePath}
              </span>
              {" · "}
              <span
                className={
                  submission.replayProofExists
                    ? "text-emerald-300"
                    : "text-red-300"
                }
              >
                {submission.replayProofExists
                  ? "Object verified"
                  : "Object missing"}
              </span>
            </p>
          )}
          {submission.screenshotStoragePath && (
            <p className="break-all">
              Screenshot path:{" "}
              <span className="font-mono text-slate-300">
                {submission.screenshotStoragePath}
              </span>
              {" · "}
              <span
                className={
                  submission.screenshotProofExists
                    ? "text-emerald-300"
                    : "text-red-300"
                }
              >
                {submission.screenshotProofExists
                  ? "Object verified"
                  : "Object missing"}
              </span>
            </p>
          )}
        </div>
      )}

      {isAdmin && submission.status === "pending" && (
        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="submissionId" value={submission.id} />
          <textarea
            name="reviewNotes"
            maxLength={2000}
            rows={2}
            placeholder="Administrator message (required for rejection or resubmission)"
            className="w-full resize-none rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-orange-400"
          />
          <ActionMessage state={state} />
          <div className="grid gap-2 sm:grid-cols-3">
            <ReviewButton
              decision="approved"
              label="Approve"
              disabled={pending}
              className="bg-emerald-600 hover:bg-emerald-500"
            />
            <ReviewButton
              decision="rejected"
              label="Reject"
              disabled={pending}
              className="bg-red-700 hover:bg-red-600"
            />
            <ReviewButton
              decision="resubmission_requested"
              label="Request Resubmission"
              disabled={pending}
              className="bg-amber-600 hover:bg-amber-500"
            />
          </div>
        </form>
      )}
    </div>
  );
}

function ReviewButton({
  decision,
  label,
  disabled,
  className,
}: {
  decision: string;
  label: string;
  disabled: boolean;
  className: string;
}) {
  return (
    <button
      type="submit"
      name="decision"
      value={decision}
      disabled={disabled}
      className={`rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-wider text-white transition disabled:opacity-50 ${className}`}
    >
      {label}
    </button>
  );
}

function ActionMessage({ state }: { state: MatchResultActionState }) {
  if (state.status === "idle") return null;

  return (
    <p
      className={`rounded-lg border p-2 text-xs ${
        state.status === "success"
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
          : "border-red-400/30 bg-red-500/10 text-red-200"
      }`}
    >
      {state.message}
    </p>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-slate-500">{label}:</span>{" "}
      <strong className="text-white">{value}</strong>
    </p>
  );
}

function participantName(
  participantsById: Map<string, TournamentParticipant>,
  registrationId: string
) {
  return participantsById.get(registrationId)?.name ?? "Participant";
}

function formatSubmissionStatus(status: MatchResultSubmission["status"]) {
  return {
    pending: "Under Review",
    approved: "Approved",
    rejected: "Rejected",
    resubmission_requested: "Resubmission Requested",
  }[status];
}

function formatSubmissionStatusLabel(status: TournamentParticipant["status"]) {
  return {
    pending: "Pending",
    manual_review: "Manual Review",
    approved: "Approved",
    rejected: "Rejected",
    waitlisted: "Waitlisted",
  }[status];
}

function formatReportGroupStatus(status: MatchResultReportGroup["status"]) {
  return {
    pending_confirmation: "Pending Opponent Confirmation",
    confirmed: "Confirmed",
    auto_approved: "Auto-Approved",
    disputed: "Disputed",
    under_review: "Under Review",
    approved: "Approved",
    rejected: "Rejected",
    reset: "Reset",
  }[status];
}

function formatFinalizedSource(source: string) {
  return {
    opponent_confirmation: "Opponent Confirmation",
    cron_auto_approval: "Automatic Approval",
    admin_approval: "Admin Approval",
    admin_override: "Admin Override",
    reset: "Reset",
  }[source] ?? source.replaceAll("_", " ");
}
