"use client";

import { useActionState } from "react";
import {
  reviewMatchResult,
  type MatchResultActionState,
} from "@/app/tournaments/match-actions";
import type {
  GeneratedTournamentMatch,
  MatchResultSubmission,
  TournamentParticipant,
} from "@/lib/tournaments";

const initialState: MatchResultActionState = {
  status: "idle",
  message: "",
};

export default function AdminMatchResultSummaries({
  match,
  submissions,
  participantsById,
}: {
  match: GeneratedTournamentMatch;
  submissions: MatchResultSubmission[];
  participantsById: Map<string, TournamentParticipant>;
}) {
  const pending = submissions.filter(
    (submission) => submission.status === "pending"
  );
  const pendingByGame = new Map<number, MatchResultSubmission[]>();
  for (const submission of pending) {
    const reports = pendingByGame.get(submission.gameNumber) ?? [];
    reports.push(submission);
    pendingByGame.set(submission.gameNumber, reports);
  }
  const gameSummaries = [...pendingByGame.entries()]
    .sort(([left], [right]) => left - right)
    .map(([gameNumber, reports]) => ({
      gameNumber,
      reports,
      winnerIds: new Set(
        reports.map((report) => report.claimedWinnerRegistrationId)
      ),
    }));
  const conflictingGames = gameSummaries.filter(
    (game) => game.winnerIds.size > 1
  );
  const resolvedGames = gameSummaries.filter(
    (game) => game.winnerIds.size === 1
  );
  const playerOneWins = resolvedGames.filter(
    (game) =>
      [...game.winnerIds][0] === match.playerOneRegistrationId
  ).length;
  const playerTwoWins = resolvedGames.filter(
    (game) =>
      [...game.winnerIds][0] === match.playerTwoRegistrationId
  ).length;
  const winsRequired = Math.floor(match.seriesBestOf / 2) + 1;
  const seriesComplete =
    conflictingGames.length === 0 &&
    Math.max(playerOneWins, playerTwoWins) === winsRequired;
  const historical = submissions.filter(
    (submission) => submission.status !== "pending"
  );

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="rounded-2xl border border-orange-400/25 bg-orange-500/[0.04] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-orange-200">
                Series Review
              </p>
              <p className="mt-2 text-sm text-white">
                {participantName(
                  participantsById,
                  match.playerOneRegistrationId ?? ""
                )}{" "}
                <strong>{playerOneWins}</strong> - <strong>{playerTwoWins}</strong>{" "}
                {participantName(
                  participantsById,
                  match.playerTwoRegistrationId ?? ""
                )}
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                seriesComplete
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-400/30 bg-amber-500/10 text-amber-200"
              }`}
            >
              {seriesComplete ? "Ready for Review" : "Reports In Progress"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-black/25 p-4 text-xs sm:grid-cols-3">
            <SummaryValue label="Round" value={match.roundName} />
            <SummaryValue
              label="Match Format"
              value={`BO${match.seriesBestOf}`}
            />
            <SummaryValue
              label="Current Series Score"
              value={`${playerOneWins}-${playerTwoWins}`}
            />
          </div>

          {conflictingGames.length > 0 && (
            <div className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-red-200">
                Conflicting Player Reports Detected
              </p>
              <p className="mt-2 text-xs leading-5 text-red-100/80">
                Conflicts exist for game
                {conflictingGames.length === 1 ? " " : "s "}
                {conflictingGames.map((game) => game.gameNumber).join(", ")}.
              </p>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {gameSummaries.map((game) => (
              <GameSummary
                key={game.gameNumber}
                gameNumber={game.gameNumber}
                reports={game.reports}
                participantsById={participantsById}
              />
            ))}
          </div>

          <ReviewForm
            submissionId={pending[0].id}
            approvalDisabled={!seriesComplete}
          />
        </div>
      )}

      {historical.map((submission) => (
        <div
          key={submission.id}
          className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs font-black uppercase tracking-wider text-amber-200">
              Submission #{submission.submissionNumber} -{" "}
              {formatStatus(submission.status)}
            </p>
            <span className="text-[10px] text-slate-500">
              {new Date(submission.createdAt).toLocaleString()}
            </span>
          </div>
          <ResultSummary
            match={match}
            submission={submission}
            participantsById={participantsById}
          />
          <EvidenceSummary
            submission={submission}
            participantsById={participantsById}
          />
        </div>
      ))}
    </div>
  );
}

function ResultSummary({
  match,
  submission,
  participantsById,
}: {
  match: GeneratedTournamentMatch;
  submission: MatchResultSubmission;
  participantsById: Map<string, TournamentParticipant>;
}) {
  const reporter = reporterName(submission, participantsById);
  const winner = participantName(
    participantsById,
    submission.claimedWinnerRegistrationId
  );
  const loserRegistrationId =
    submission.claimedWinnerRegistrationId === match.playerOneRegistrationId
      ? match.playerTwoRegistrationId
      : match.playerOneRegistrationId;
  const loser = loserRegistrationId
    ? participantName(participantsById, loserRegistrationId)
    : "Participant";

  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-black/25 p-4 text-xs text-slate-300 sm:grid-cols-2">
      <SummaryValue
        label="Match"
              value={`${match.roundName} - Match ${match.matchNumber}`}
      />
      <SummaryValue label="Reporting Player" value={reporter} />
      <SummaryValue label="Reported Winner" value={winner} />
      <SummaryValue label="Reported Loser" value={loser} />
      <SummaryValue
        label="Submission Date"
        value={new Date(submission.createdAt).toLocaleString()}
      />
      <SummaryValue label="Current Status" value={formatStatus(submission.status)} />
    </div>
  );
}

function EvidenceSummary({
  submission,
  participantsById,
}: {
  submission: MatchResultSubmission;
  participantsById: Map<string, TournamentParticipant>;
}) {
  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4">
      <p className="text-xs font-black text-white">
                  Submission #{submission.submissionNumber} - Game{" "}
        {submission.gameNumber}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">
        Reported by {reporterName(submission, participantsById)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {submission.replayProofUrl ? (
          <ProofLink href={submission.replayProofUrl} label="Replay Proof" />
        ) : (
          <MissingProof label="Replay Proof" />
        )}
        {submission.screenshotProofUrl ? (
          <ProofLink
            href={submission.screenshotProofUrl}
            label="Screenshot Proof"
          />
        ) : (
          <MissingProof label="Screenshot Proof" />
        )}
      </div>
      {submission.notes && (
        <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-400">
          {submission.notes}
        </p>
      )}
    </div>
  );
}

function GameSummary({
  gameNumber,
  reports,
  participantsById,
}: {
  gameNumber: number;
  reports: MatchResultSubmission[];
  participantsById: Map<string, TournamentParticipant>;
}) {
  const winnerIds = new Set(
    reports.map((report) => report.claimedWinnerRegistrationId)
  );
  const conflict = winnerIds.size > 1;
  const winner =
    winnerIds.size === 1
      ? participantName(participantsById, [...winnerIds][0])
      : "Conflicting reports";

  return (
    <div
      className={`rounded-xl border p-4 ${
        conflict
          ? "border-red-400/30 bg-red-500/5"
          : "border-white/10 bg-black/25"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-black text-white">Game {gameNumber}</p>
        <p className={conflict ? "text-red-300" : "text-emerald-300"}>
          Winner: {winner}
        </p>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {reports.map((report) => (
          <EvidenceSummary
            key={report.id}
            submission={report}
            participantsById={participantsById}
          />
        ))}
      </div>
    </div>
  );
}

function ReviewForm({
  submissionId,
  approvalDisabled = false,
}: {
  submissionId: string;
  approvalDisabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    reviewMatchResult,
    initialState
  );

  return (
    <form action={formAction} className="mt-4 space-y-2">
      <input type="hidden" name="submissionId" value={submissionId} />
      <textarea
        name="reviewNotes"
        maxLength={2000}
        rows={2}
        placeholder="Administrator message (required for rejection or resubmission)"
        className="w-full resize-none rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-orange-400"
      />
      {state.status !== "idle" && (
        <p
          className={`rounded-lg border p-2 text-xs ${
            state.status === "success"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-400/30 bg-red-500/10 text-red-200"
          }`}
        >
          {state.message}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <ReviewButton
          decision="approved"
          label="Approve Series Result"
          disabled={pending || approvalDisabled}
          className="bg-emerald-600 hover:bg-emerald-500"
        />
        <ReviewButton
          decision="rejected"
          label="Reject Result"
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

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-slate-500">{label}:</span>{" "}
      <strong className="text-white">{value}</strong>
    </p>
  );
}

function ProofLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-sky-200"
    >
      {label}
    </a>
  );
}

function MissingProof({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-white/10 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-600">
      No {label}
    </span>
  );
}

function reporterName(
  submission: MatchResultSubmission,
  participantsById: Map<string, TournamentParticipant>
) {
  return submission.submittedByRegistrationId
    ? participantName(participantsById, submission.submittedByRegistrationId)
    : submission.submittedByClerkUserId;
}

function participantName(
  participantsById: Map<string, TournamentParticipant>,
  registrationId: string
) {
  return participantsById.get(registrationId)?.name ?? "Participant";
}

function formatStatus(status: MatchResultSubmission["status"]) {
  return {
    pending: "Under Review",
    approved: "Approved",
    rejected: "Rejected",
    resubmission_requested: "Resubmission Requested",
  }[status];
}
