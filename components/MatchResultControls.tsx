"use client";

import { useActionState, useState } from "react";
import {
  saveAdminMatchResult,
  submitMatchResult,
  reviewMatchResult,
  type MatchResultActionState,
} from "@/app/tournaments/match-actions";
import AdminMatchResultSummaries from "@/components/AdminMatchResultSummaries";
import PlayerMatchResultForm from "@/components/PlayerMatchResultForm";
import type {
  GeneratedTournamentMatch,
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
  presentation = "inline",
}: {
  match: GeneratedTournamentMatch;
  participantsById: Map<string, TournamentParticipant>;
  isAdmin: boolean;
  canSubmit: boolean;
  viewerClerkUserId: string | null;
  submissions: MatchResultSubmission[];
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
  const viewerPendingGameNumbers = submissions
    .filter(
      (submission) =>
        submission.status === "pending" &&
        submission.matchId === match.id &&
        submission.submittedByClerkUserId === viewerClerkUserId
    )
    .map((submission) => submission.gameNumber);
  const viewerPendingSubmissions = submissions.filter(
    (submission) =>
      submission.status === "pending" &&
      submission.matchId === match.id &&
      submission.submittedByClerkUserId === viewerClerkUserId
  );
  const winsRequired = Math.floor(match.seriesBestOf / 2) + 1;
  const viewerReportedSeriesComplete = [
    match.playerOneRegistrationId,
    match.playerTwoRegistrationId,
  ].some(
    (registrationId) =>
      registrationId &&
      viewerPendingSubmissions.filter(
        (submission) =>
          submission.claimedWinnerRegistrationId === registrationId
      ).length >= winsRequired
  );
  const viewerCanReportAnotherGame =
    viewerPendingGameNumbers.length < match.seriesBestOf &&
    !viewerReportedSeriesComplete;

  if (!isAdmin && !canSubmit && submissions.length === 0) {
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
                mode="admin"
              />
            </div>
          )}

          {canSubmit &&
            hasParticipants &&
            match.status !== "completed" &&
            viewerCanReportAnotherGame && (
              <div className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.04] p-5">
                <PlayerMatchResultForm
                  match={match}
                  playerOneName={playerOne?.name ?? "Player 1"}
                  playerTwoName={playerTwo?.name ?? "Player 2"}
                  reportedGameNumbers={viewerPendingGameNumbers}
                />
              </div>
            )}

          {canSubmit &&
            !viewerCanReportAnotherGame &&
            match.status !== "completed" && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-100/80">
                You have reported a complete BO{match.seriesBestOf} series.
                The series package is under review.
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
            ? pendingSubmission
              ? "Result Review Required"
              : "Manage Match Result"
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
  mode,
}: {
  match: GeneratedTournamentMatch;
  playerOneName: string;
  playerTwoName: string;
  mode: "admin" | "player";
}) {
  const action = mode === "admin" ? saveAdminMatchResult : submitMatchResult;
  const [state, formAction, pending] = useActionState(action, initialState);
  const winsRequired = Math.floor(match.seriesBestOf / 2) + 1;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="matchId" value={match.id} />
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-white">
          {mode === "admin" ? "Official Result Entry" : "Player Result Claim"}
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

      {mode === "player" && (
        <>
          <label className="block">
            <span className="text-xs font-bold text-slate-300">
              Replay proof (.rec or .replay)
            </span>
            <input
              name="replay"
              type="file"
              accept=".rec,.replay"
              className="mt-2 block w-full text-sm text-slate-400 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:py-3 file:font-bold file:text-white"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-300">
              Victory screenshot
            </span>
            <input
              name="screenshot"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-2 block w-full text-sm text-slate-400 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:py-3 file:font-bold file:text-white"
            />
          </label>
          <p className="text-[11px] text-slate-500">
            At least one proof file is required. Maximum 10 MB per file.
          </p>
          <label className="block">
            <span className="text-xs font-bold text-slate-300">
              Notes (optional)
            </span>
            <textarea
              name="notes"
              maxLength={2000}
              rows={5}
              className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-orange-400"
            />
          </label>
        </>
      )}

      <ActionMessage state={state} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-orange-500 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-400 disabled:opacity-50"
      >
        {pending
          ? "Saving..."
          : mode === "admin"
            ? "Complete Match & Advance Winner"
            : "Submit Result for Review"}
      </button>
    </form>
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

function formatSubmissionStatus(status: MatchResultSubmission["status"]) {
  return {
    pending: "Under Review",
    approved: "Approved",
    rejected: "Rejected",
    resubmission_requested: "Resubmission Requested",
  }[status];
}
