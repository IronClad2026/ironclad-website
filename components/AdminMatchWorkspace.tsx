"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  AdminResetMatchForm,
  ReportGroupReview,
  ResultEntryForm,
} from "@/components/MatchResultControls";
import AdminMatchResultSummaries from "@/components/AdminMatchResultSummaries";
import AdminMatchDeadlineControls from "@/components/AdminMatchDeadlineControls";
import HydrationSafeLocalDateTime from "@/components/HydrationSafeLocalDateTime";
import useHydrationSafeNow from "@/components/useHydrationSafeNow";
import type {
  GeneratedTournamentMatch,
  MatchResultReportGroup,
  MatchResultSubmission,
  TournamentParticipant,
} from "@/lib/tournaments";

// Presentation of the existing match/report facts. Actions and eligibility stay
// with the existing controls and their server-side authorities.
export default function AdminMatchWorkspace({
  match,
  participantsById,
  reportGroups,
  submissions,
  readOnly,
  isAdmin,
  deadlineManaged,
  canEnterOfficialResult,
  onPendingChange,
  diceHistory,
}: {
  match: GeneratedTournamentMatch;
  participantsById: Map<string, TournamentParticipant>;
  reportGroups: MatchResultReportGroup[];
  submissions: MatchResultSubmission[];
  readOnly: boolean;
  isAdmin: boolean;
  deadlineManaged: boolean;
  canEnterOfficialResult: boolean;
  onPendingChange: (key: string, pending: boolean) => void;
  diceHistory?: ReactNode;
}) {
  const active = reportGroups.find(
    (report) =>
      !report.finalizedAt &&
      ["pending_confirmation", "disputed", "under_review"].includes(
        report.status
      )
  );
  const official =
    match.status === "completed"
      ? reportGroups.find(
          (report) =>
            report.finalizedAt &&
            ["confirmed", "approved", "auto_approved"].includes(
              report.status
            ) &&
            report.winnerRegistrationId === match.winnerRegistrationId &&
            report.playerOneScore === match.playerOneScore &&
            report.playerTwoScore === match.playerTwoScore
        )
      : undefined;
  const current = active ?? official;
  const earlier = reportGroups.filter((report) => report.id !== current?.id);
  const pendingLegacy = submissions.filter(
    (submission) => submission.status === "pending"
  );
  const history = submissions.filter(
    (submission) => submission.status !== "pending"
  );
  const hold = Boolean(match.holdStartedAt && !match.holdReleasedAt);
  const now = useHydrationSafeNow({
    enabled: Boolean(active) || match.status === "in_progress",
  });
  const expired =
    active?.status === "pending_confirmation" &&
    now !== null &&
    now >= Date.parse(active.confirmationDeadlineAt);
  const deadlineAttention =
    !readOnly &&
    !active &&
    !pendingLegacy.length &&
    match.status === "in_progress" &&
    (hold ||
      (deadlineManaged &&
        now !== null &&
        Boolean(match.deadlineAt) &&
        now >= Date.parse(match.deadlineAt!)));
  const reviewRequired =
    !readOnly &&
    (active?.status === "disputed" ||
      active?.status === "under_review" ||
      pendingLegacy.length > 0);
  const state =
    match.status === "completed"
      ? official?.status === "auto_approved"
        ? "Result automatically confirmed"
        : "Match completed"
      : active?.status === "disputed"
        ? "Result disputed — Admin review required"
        : active?.status === "under_review" || pendingLegacy.length > 0
          ? "Result awaiting Admin review"
          : expired
            ? "Confirmation window ended — automatic confirmation processing"
            : active?.status === "pending_confirmation"
              ? "Waiting for opponent confirmation"
              : hold
                ? "Match on hold"
                : deadlineAttention
                  ? "Match deadline requires attention"
                  : match.status === "in_progress"
                    ? "Awaiting player result submission"
                    : match.status === "pending_review"
                      ? "Result awaiting Admin review"
                      : "Waiting for match activation";
  const name = (id: string | null) =>
    (id && participantsById.get(id)?.name) || "TBD";
  const date = active?.confirmationDeadlineAt ?? match.deadlineAt;

  return (
    <div className="min-w-0 text-sm text-zinc-300 [overflow-wrap:anywhere]">
      <section aria-label="Current match" className="pb-6">
        <p className="text-xs text-zinc-500">
          Best of {match.seriesBestOf} · Official score
        </p>
        <div className="mt-3 grid min-w-0 grid-cols-1 items-center sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 sm:gap-6">
          <p
            data-admin-match-player-name
            className="flex min-w-0 items-center justify-between gap-4 text-base font-bold text-white sm:block sm:text-xl"
          >
            <span className="min-w-0">
              {name(match.playerOneRegistrationId)}
            </span>
            <span className="shrink-0 font-mono text-xl sm:hidden">
              {match.playerOneScore ?? "–"}
            </span>
          </p>
          <p
            className="hidden shrink-0 whitespace-nowrap font-mono sm:block text-2xl font-black text-white sm:text-3xl"
            aria-label={`Official score ${match.playerOneScore ?? "not recorded"} to ${match.playerTwoScore ?? "not recorded"}`}
          >
            {match.playerOneScore ?? "–"}
            <span className="px-2 text-zinc-600">:</span>
            {match.playerTwoScore ?? "–"}
          </p>
          <p
            data-admin-match-player-name
            className="flex min-w-0 items-center justify-between gap-4 text-base font-bold text-white sm:block sm:text-right sm:text-xl"
          >
            <span className="min-w-0">
              {name(match.playerTwoRegistrationId)}
            </span>
            <span className="shrink-0 font-mono text-xl sm:hidden">
              {match.playerTwoScore ?? "–"}
            </span>
          </p>
        </div>
        <p
          role="status"
          className={`mt-5 font-bold ${reviewRequired || deadlineAttention ? "text-orange-200" : "text-zinc-200"}`}
        >
          {state}
        </p>
        {date && (
          <p className="mt-2 text-xs text-zinc-400">
            {active ? "Confirmation deadline" : "Match deadline"}:{" "}
            <HydrationSafeLocalDateTime value={date} fallback="Unavailable" />
          </p>
        )}
        {reviewRequired && (
          <p className="mt-3 border-l-2 border-orange-400 pl-3 text-sm text-orange-100">
            Review the reported result and evidence, then record your decision
            below.
          </p>
        )}
        {deadlineAttention && (
          <p className="mt-3 text-sm text-orange-100">
            Deadline &amp; Scheduling is open below for inspection.
          </p>
        )}
      </section>

      <section
        aria-label="Result & Replay Evidence"
        className="border-t border-white/10 py-6"
      >
        <h3 className="mb-4 text-xs font-black uppercase tracking-wider text-zinc-400">
          Result &amp; Replay Evidence
        </h3>
        {current && (
          <ReportGroupReview
            reportGroup={current}
            match={match}
            isAdmin={isAdmin}
            participantsById={participantsById}
            onPendingChange={onPendingChange}
            presentation="workspace"
          />
        )}
        {pendingLegacy.length > 0 && (
          <AdminMatchResultSummaries
            match={match}
            submissions={pendingLegacy}
            participantsById={participantsById}
            onPendingChange={onPendingChange}
            readOnly={readOnly}
            compact
          />
        )}
        {!current && pendingLegacy.length === 0 && (
          <p className="text-zinc-500">
            {match.status === "completed"
              ? "The official result is recorded above. Any earlier evidence is available in Submission History."
              : "No current player report. Submitted results and replay evidence will appear here."}
          </p>
        )}
      </section>

      {(deadlineManaged || diceHistory) && (
        <Disclosure
          key={`schedule-${Boolean(deadlineAttention)}`}
          title="Deadline & Scheduling"
          defaultOpen={Boolean(deadlineAttention)}
        >
          {active && (
            <p className="mb-4 text-xs text-zinc-400">
              The submitted report keeps its original confirmation deadline
              shown above.
            </p>
          )}
          {deadlineManaged && (
            <AdminMatchDeadlineControls
              match={match}
              onPendingChange={onPendingChange}
              readOnly={readOnly}
              compact
            />
          )}
          {diceHistory && <div className="mt-5">{diceHistory}</div>}
        </Disclosure>
      )}

      <Disclosure
        title={`Submission History (${earlier.length + history.length})`}
      >
        <div className="space-y-6">
          {earlier.map((report) => (
            <ReportGroupReview
              key={report.id}
              reportGroup={report}
              match={match}
              isAdmin={false}
              participantsById={participantsById}
              presentation="workspace"
            />
          ))}
          {history.length > 0 && (
            <AdminMatchResultSummaries
              match={match}
              submissions={history}
              participantsById={participantsById}
              readOnly
              compact
            />
          )}
          {earlier.length + history.length === 0 && (
            <p className="text-xs text-zinc-500">No earlier submissions.</p>
          )}
        </div>
      </Disclosure>

      {!readOnly && (
        <>
          <Disclosure title="Advanced Admin Actions">
            {canEnterOfficialResult ? (
              <ResultEntryForm
                match={match}
                playerOneName={name(match.playerOneRegistrationId)}
                playerTwoName={name(match.playerTwoRegistrationId)}
                onPendingChange={onPendingChange}
              />
            ) : (
              <p className="text-xs leading-5 text-zinc-400">
                Official Result Entry requires both participants and an eligible
                active match. Resolve any active report, pending legacy
                submission or administrative hold first.
              </p>
            )}
          </Disclosure>
          <Disclosure title="Danger Zone" danger>
            <AdminResetMatchForm
              match={match}
              onPendingChange={onPendingChange}
            />
          </Disclosure>
        </>
      )}
    </div>
  );
}

function Disclosure({
  title,
  children,
  defaultOpen = false,
  danger = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  danger?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group/disclosure min-w-0 border-t border-white/10"
    >
      <summary
        className={`flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 [&::-webkit-details-marker]:hidden ${danger ? "text-red-300" : "text-zinc-300"}`}
      >
        {title}
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 transition group-open/disclosure:rotate-180"
        />
      </summary>
      <div className="min-w-0 pb-6 pt-2">{children}</div>
    </details>
  );
}
